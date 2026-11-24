/* ============================================================
   Wiredan Vending Hub AuthContext - Clean & Production Ready
   Path: src/context/AuthContext.jsx
   Status: STABLE | AUTO-SYNC USER IDENTITY | ADMIN ROLE PERSISTENCE
   ============================================================ */

import React, { createContext, useState, useContext, useEffect, useCallback } from "react";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

function buildSanitizedUser(source, fallback = {}) {
  const src = source && typeof source === "object" ? source : {};
  const fb = fallback && typeof fallback === "object" ? fallback : {};

  const resolvedWallet =
    src.wallet_address ||
    src.sidra_wallet ||
    src.sidra_wallet_address ||
    fb.wallet_address ||
    fb.sidra_wallet ||
    fb.sidra_wallet_address ||
    "";
  const computedDan = Number(src.dan_balance ?? fb.dan_balance ?? 0);
  const premiumFlag = computedDan >= 2000 ? 1 : Number(src.is_premium ?? fb.is_premium ?? 0);

  const userRole =
    src.role ||
    fb.role ||
    (Number(src.is_admin) === 1 || Number(fb.is_admin) === 1 ? "admin" : "user");
  const adminFlag = Number(src.is_admin ?? fb.is_admin ?? (userRole === "admin" ? 1 : 0));

  const resolvedId = String(src.id || src.uuid || fb.id || fb.uuid || "").trim();
  const resolvedUuid = String(src.uuid || src.id || fb.uuid || fb.id || "").trim();

  return {
    ...fb,
    ...src,
    id: resolvedId,
    uuid: resolvedUuid,
    role: userRole,
    is_admin: adminFlag,
    wallet_address: resolvedWallet,
    sidra_wallet: resolvedWallet,
    sidra_wallet_address: resolvedWallet,
    kyc_verified: Number(src.kyc_verified ?? fb.kyc_verified) || 0,
    kyc_status: src.kyc_status || fb.kyc_status || "unverified",
    balance: Number(src.balance ?? fb.balance) || 0,
    dan_balance: computedDan,
    sda_balance: Number(src.sda_balance ?? fb.sda_balance) || 0,
    is_premium: premiumFlag,
    can_trade_high_value: premiumFlag,
  };
}

export const AuthProvider = ({ children }) => {
  // 🛡️ Instant Synchronous Hydration from LocalStorage on Boot
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("agritrade_user");
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        return buildSanitizedUser(parsed, {
          id: localStorage.getItem("userId") || "",
          uuid: localStorage.getItem("userUuid") || "",
        });
      }
    } catch (e) {}
    return null;
  });

  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("agritrade_token") || null;
    } catch (e) {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return Boolean(localStorage.getItem("agritrade_token") || localStorage.getItem("agritrade_user"));
    } catch (e) {
      return false;
    }
  });

  // 🛡️ Anti-Flicker: Initialize loading true if cached credentials exist so PrivateRoute waits for fresh sync
  const [loading, setLoading] = useState(() => {
    try {
      return Boolean(localStorage.getItem("agritrade_token") || localStorage.getItem("agritrade_user"));
    } catch (e) {
      return false;
    }
  });

  const [globalOrders, setGlobalOrders] = useState(() => {
    try {
      const savedUserStr = localStorage.getItem("agritrade_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
      const userKey = savedUser?.uuid || savedUser?.id;
      if (userKey) {
        const cached = localStorage.getItem(`wiredan_cached_orders_${userKey}`);
        return cached ? JSON.parse(cached) : [];
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    const userKey = user?.uuid || user?.id;
    if (userKey && globalOrders && Array.isArray(globalOrders)) {
      try {
        localStorage.setItem(`wiredan_cached_orders_${userKey}`, JSON.stringify(globalOrders));
      } catch (e) {}
    }
  }, [globalOrders, user?.uuid, user?.id]);

  const syncAllData = useCallback(async (customToken, customUserId) => {
    const currentToken = customToken || token || localStorage.getItem("agritrade_token");
    const savedUserStr = localStorage.getItem("agritrade_user");
    let parsedSavedUser = {};
    try {
      parsedSavedUser = savedUserStr ? JSON.parse(savedUserStr) : {};
    } catch (e) {}

    const activeUserId =
      customUserId ||
      parsedSavedUser?.uuid ||
      parsedSavedUser?.id ||
      localStorage.getItem("userId") ||
      localStorage.getItem("userUuid");
    if (!activeUserId || activeUserId === "local_user") {
      setLoading(false);
      return;
    }

    const authHeaders = currentToken ? { Authorization: `Bearer ${currentToken}` } : {};

    setLoading(true);
    try {
      // 🛡️ 1. Fetch Fresh Identity, Role & Balance directly from /api/user/me
      const profileRes = await fetch(`/api/user/me?id=${encodeURIComponent(activeUserId)}`, {
        headers: authHeaders,
        credentials: "include",
      });

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (profileData && profileData.success) {
          setUser((prevUser) => {
            const baseUser =
              prevUser && (prevUser.uuid === activeUserId || prevUser.id === activeUserId)
                ? prevUser
                : parsedSavedUser?.uuid === activeUserId || parsedSavedUser?.id === activeUserId
                  ? parsedSavedUser
                  : {};
            const sanitizedUser = buildSanitizedUser(
              {
                ...profileData,
                uuid: profileData.uuid || profileData.id || activeUserId,
                id: profileData.id || profileData.uuid || activeUserId,
              },
              baseUser
            );
            try {
              localStorage.setItem("agritrade_user", JSON.stringify(sanitizedUser));
            } catch (err) {}
            return sanitizedUser;
          });
        }
      }
    } catch (err) {
    } finally {
      setLoading(false); // ⚡ Release loading shield
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      const activeToken = token || localStorage.getItem("agritrade_token");
      const activeUserId = user?.uuid || user?.id || localStorage.getItem("userId") || localStorage.getItem("userUuid");
      syncAllData(activeToken, activeUserId);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, token, syncAllData, user?.uuid, user?.id]);

  const login = useCallback((userData, authTokenParam) => {
    const rawUser = userData?.user || userData || {};
    const authToken = authTokenParam || userData?.token || userData?.accessToken || localStorage.getItem("agritrade_token");

    let existingLocalUser = {};
    try {
      const cachedUserStr = localStorage.getItem("agritrade_user");
      if (cachedUserStr) existingLocalUser = JSON.parse(cachedUserStr);
    } catch (e) {}

    const incomingId = String(rawUser.uuid || rawUser.id || "").trim();
    const existingId = String(existingLocalUser.uuid || existingLocalUser.id || "").trim();
    const sameAccount = Boolean(incomingId && existingId && incomingId === existingId);

    const sanitizedUser = buildSanitizedUser(
      {
        ...rawUser,
        uuid: rawUser.uuid || rawUser.id || (sameAccount ? existingLocalUser.uuid || existingLocalUser.id : "") || "user_node",
        id: rawUser.id || rawUser.uuid || (sameAccount ? existingLocalUser.id || existingLocalUser.uuid : "") || "user_node",
      },
      sameAccount ? existingLocalUser : {}
    );

    if (!sameAccount) {
      setGlobalOrders([]);
    }

    setUser(sanitizedUser);
    if (authToken) setToken(authToken);
    setIsAuthenticated(true);

    try {
      localStorage.setItem("agritrade_user", JSON.stringify(sanitizedUser));
      if (authToken) localStorage.setItem("agritrade_token", authToken);
      if (sanitizedUser.id) localStorage.setItem("userId", sanitizedUser.id);
      if (sanitizedUser.uuid) localStorage.setItem("userUuid", sanitizedUser.uuid);
    } catch (e) {}

    if (sanitizedUser.uuid || sanitizedUser.id) {
      syncAllData(authToken, sanitizedUser.uuid || sanitizedUser.id);
    }
  }, [syncAllData]);

  const updateUser = useCallback((updated) => {
    setUser((prevUser) => {
      const newState = buildSanitizedUser(updated, prevUser || {});
      try {
        localStorage.setItem("agritrade_user", JSON.stringify(newState));
      } catch (e) {}
      return newState;
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setGlobalOrders([]);
    try {
      localStorage.removeItem("agritrade_user");
      localStorage.removeItem("agritrade_token");
      localStorage.removeItem("userId");
      localStorage.removeItem("userUuid");
    } catch (e) {}
  }, []);

  const value = {
    user,
    token,
    isAuthenticated,
    loading,
    globalOrders,
    setGlobalOrders,
    syncAllData,
    login,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
