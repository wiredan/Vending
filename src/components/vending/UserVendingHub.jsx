import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiSmartphone, FiSun, FiMoon, FiZap, FiLayers, FiArrowLeft, FiAward, FiLogOut } from 'react-icons/fi';
import VendingWalletCard from './VendingWalletCard';
import VendingFormTab from './VendingFormTab';
import VendingModalKYC from './VendingModalKYC';
import { vendingCache } from '../../utils/vendingCache';

const NETWORKS = [
    {
        id: 'mtn',
        name: 'MTN',
        color: 'bg-amber-400 text-slate-950',
        border: 'border-amber-300',
        types: [
            { id: 'gifting', label: 'Gifting', available: true },
            { id: 'share', label: 'Data Share', available: true },
            { id: 'sme', label: 'SME', available: false, reason: 'Not available' }
        ]
    },
    {
        id: 'glo',
        name: 'GLO',
        color: 'bg-emerald-600 text-white',
        border: 'border-emerald-500',
        types: [
            { id: 'cg', label: 'Corporate CG', available: true },
            { id: 'data', label: 'Standard Data', available: true }
        ]
    },
    {
        id: 'airtel',
        name: 'Airtel',
        color: 'bg-rose-600 text-white',
        border: 'border-rose-500',
        types: [
            { id: 'gifting', label: 'Gifting', available: true },
            { id: 'cg', label: 'Corporate CG', available: true }
        ]
    },
    {
        id: '9mobile',
        name: '9mobile',
        color: 'bg-teal-700 text-white',
        border: 'border-teal-500',
        types: [
            { id: 'cg', label: 'Corporate CG', available: true },
            { id: 'data', label: 'Standard Data', available: true }
        ]
    }
];

const FAST_REQUEST_TIMEOUT_MS = 3500;
const CATALOG_REQUEST_TIMEOUT_MS = 10_000;
const CATALOG_CACHE_TTL_MS = 60_000;

function getNetworkRouteStatus(networkId, dataType) {
    const net = NETWORKS.find(n => n.id === networkId) || NETWORKS[0];
    const match = (net.types || []).find(t => t.id === dataType);
    if (!match) return { available: true, reason: '' };
    const available = match.available !== false;
    return { available, reason: available ? '' : (match.reason || 'Not available') };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FAST_REQUEST_TIMEOUT_MS) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        return await fetch(url, {
            ...options,
            ...(controller ? { signal: controller.signal } : {})
        });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const hideVendor = (m) => String(m || '').replace(/pey(?:flex)?|pevf(?:lex)?/gi, 'Gateway').replace(/\s+/g, ' ').trim();
const readStored = (k) => { try { return JSON.parse(localStorage.getItem('agritrade_user'))?.[k] || ''; } catch { return ''; } };
const resolveUserId = (u) => String(u?.uuid || u?.id || readStored('uuid') || readStored('id') || localStorage.getItem('userId') || 'guest').trim();
const resolveUserEmail = (u) => String(u?.email || readStored('email') || localStorage.getItem('userEmail') || '').trim();
const splitName = (u) => { const p = String(u?.full_name || u?.name || '').trim().split(/\s+/).filter(Boolean); return { first: String(u?.first_name || p[0] || '').trim(), last: String(u?.last_name || p.slice(1).join(' ') || '').trim() }; };

function normPkg(pkg, i) {
    const name = hideVendor(String(pkg?.name || pkg?.plan_name || pkg?.title || '').replace(/=\s*₦?\d[\d,]*(?:\.\d+)?/gi, '').trim());
    const productCode = String(pkg?.productCode || pkg?.product_code || pkg?.plan_code || pkg?.variation_code || pkg?.code || pkg?.id || name || `pkg-${i}`).trim();
    const rawPrice = Number(pkg?.retailPrice ?? pkg?.price ?? pkg?.amount ?? NaN);
    return {
        ...pkg,
        productCode,
        name: name || productCode,
        ...(Number.isFinite(rawPrice) && rawPrice > 0 ? { retailPrice: rawPrice } : {})
    };
}

function readPersistedRoutePackages(network, dataType) {
    try {
        const stored = vendingCache.get(`pkgs_${network}_${dataType}`, null, 'shared_catalog');
        if (Array.isArray(stored) && stored.length > 0) {
            return stored.map(normPkg);
        }
    } catch {}
    return [];
}

function writePersistedRoutePackages(network, dataType, items) {
    try {
        if (Array.isArray(items) && items.length > 0) {
            vendingCache.set(`pkgs_${network}_${dataType}`, items, 'shared_catalog');
        }
    } catch {}
}

function findAnyCachedNetworkPackages(network, memoryCache) {
    const net = NETWORKS.find(n => n.id === network);
    const candidateTypes = [
        'all',
        ...((net?.types || []).filter(t => t.available !== false).map(t => t.id)),
        'data',
        'gifting',
        'cg',
        'share'
    ];
    for (const typeId of candidateTypes) {
        const mem = memoryCache?.current?.get(`${network}::${typeId}`)?.items;
        if (Array.isArray(mem) && mem.length > 0) {
            return mem.map(normPkg);
        }
        const persisted = readPersistedRoutePackages(network, typeId);
        if (persisted.length > 0) {
            return persisted;
        }
    }
    return [];
}

async function requestPackagesEndpoint(network, dataType) {
    try {
        const res = await fetchWithTimeout(
            `/api/packages?network=${encodeURIComponent(network)}&type=${encodeURIComponent(dataType)}`,
            {},
            CATALOG_REQUEST_TIMEOUT_MS
        );
        const payload = await res.json().catch(() => []);
        if (!res.ok) return null;
        const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.packages) ? payload.packages : []);
        return list.map(normPkg);
    } catch {
        return null;
    }
}

async function fetchNetworkPackages(network, dataType, memoryCache) {
    if (!getNetworkRouteStatus(network, dataType).available) return [];
    const primary = await requestPackagesEndpoint(network, dataType);
    if (Array.isArray(primary) && primary.length > 0) {
        return primary;
    }
    if (String(dataType || '').toLowerCase() !== 'all') {
        const fallbackAll = await requestPackagesEndpoint(network, 'all');
        if (Array.isArray(fallbackAll) && fallbackAll.length > 0) {
            return fallbackAll;
        }
    }
    const sameNetCached = findAnyCachedNetworkPackages(network, memoryCache);
    if (sameNetCached.length > 0) {
        return sameNetCached;
    }
    return Array.isArray(primary) ? primary : [];
}

export default function UserVendingHub() {
    const { user, token: authToken, loading: authLoading, logout } = useAuth();
    const navigate = useNavigate();
    const rawUserId = useMemo(() => resolveUserId(user), [user]);
    const names = useMemo(() => splitName(user), [user]);
    const routeCatalogCacheRef = useRef(new Map());

    const [packages, setPackages] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [isBooting, setIsBooting] = useState(false);
    const [activeTab, setActiveTab] = useState(() => vendingCache.get('tab', 'data', rawUserId));
    const [selectedNetwork, setSelectedNetwork] = useState(() => vendingCache.get('network', 'mtn', rawUserId));
    const [selectedDataType, setSelectedDataType] = useState(() => vendingCache.get('datatype', 'gifting', rawUserId));
    const [voucherType, setVoucherType] = useState(() => vendingCache.get('vouchertype', 'airtime', rawUserId));
    const [theme, setTheme] = useState(() => vendingCache.get('theme', 'white', rawUserId));
    const [walletBalance, setWalletBalance] = useState(() => {
        const cached = Number(vendingCache.get('balance', 0, rawUserId));
        return Number.isFinite(cached) ? cached : 0;
    });
    const [virtualAccount, setVirtualAccount] = useState(() => vendingCache.get('va', null, rawUserId));
    const [showModal, setShowModal] = useState(false);
    const [firstName, setFirstName] = useState(names.first || localStorage.getItem('userFirstName') || '');
    const [lastName, setLastName] = useState(names.last || localStorage.getItem('userLastName') || '');
    const [phone, setPhone] = useState(user?.phone || localStorage.getItem('userPhone') || '');
    const [idType, setIdType] = useState('bvn');
    const [idNumber, setIdNumber] = useState('');
    const [selectedPackage, setSelectedPackage] = useState('');
    const [selectedVoucherPackage, setSelectedVoucherPackage] = useState('');
    const [voucherQuantity, setVoucherQuantity] = useState(1);
    const [airtimeAmount, setAirtimeAmount] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [vendingStatus, setVendingStatus] = useState('');
    const [voucherReceipt, setVoucherReceipt] = useState(null);
    const [voucherListReceipts, setVoucherListReceipts] = useState([]);

    const isAdminUser = user?.email === 'mtlhumaid@gmail.com' || user?.role === 'admin' || Number(user?.is_admin) === 1;

    useEffect(() => {
        if (names.first && !firstName) setFirstName(names.first);
        if (names.last && !lastName) setLastName(names.last);
        if (user?.phone && !phone) setPhone(user.phone);
    }, [user, names, firstName, lastName, phone]);

    useEffect(() => {
        if (!rawUserId || rawUserId === 'guest') {
            setWalletBalance(0);
            setVirtualAccount(null);
            return;
        }
        const cachedBal = Number(vendingCache.get('balance', 0, rawUserId));
        setWalletBalance(Number.isFinite(cachedBal) ? cachedBal : 0);
        const cachedVa = vendingCache.get('va', null, rawUserId);
        setVirtualAccount(cachedVa || null);
    }, [rawUserId]);

    useEffect(() => {
        if (activeTab === 'airtime') {
            setSelectedPackage('');
        }
    }, [activeTab]);

    const apiHeaders = useCallback((withJson = false) => {
        const token = authToken || localStorage.getItem('agritrade_token') || localStorage.getItem('token') || '';
        const uid = resolveUserId(user) === 'guest' ? '' : resolveUserId(user);
        return { ...(withJson ? { 'Content-Type': 'application/json' } : {}), ...(uid ? { 'X-User-Id': uid } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    }, [authToken, user]);

    const fetchWalletAndAccount = useCallback(async () => {
        const uid = resolveUserId(user) === 'guest' ? '' : resolveUserId(user);
        if (!uid) return;
        try {
            const res = await fetchWithTimeout(`/api/user/wallet?userId=${encodeURIComponent(uid)}`, { headers: apiHeaders(false) }, FAST_REQUEST_TIMEOUT_MS);
            const data = await res.json().catch(() => null);
            if (!data?.success) return;
            const next = Number(data.balance);
            if (Number.isFinite(next)) {
                setWalletBalance(next);
                vendingCache.set('balance', next, rawUserId);
            }
            if (data.virtualAccount) {
                setVirtualAccount(data.virtualAccount);
                vendingCache.set('va', data.virtualAccount, rawUserId);
            }
        } catch (err) { console.error('fetchWalletAndAccount error:', err); }
    }, [user, apiHeaders, rawUserId]);

    // Shared catalog loader decoupled from user/auth state so account switches always see packages
    useEffect(() => {
        if (authLoading) return;
        let cancelled = false;
        const cacheKey = `${selectedNetwork}::${selectedDataType}`;
        const cachedEntry = routeCatalogCacheRef.current.get(cacheKey);
        const persistedItems = !Array.isArray(cachedEntry?.items) || cachedEntry.items.length === 0
            ? readPersistedRoutePackages(selectedNetwork, selectedDataType)
            : [];
        const sameNetFallbackItems = (!Array.isArray(cachedEntry?.items) || cachedEntry.items.length === 0) && persistedItems.length === 0
            ? findAnyCachedNetworkPackages(selectedNetwork, routeCatalogCacheRef)
            : [];
        const initialItems = Array.isArray(cachedEntry?.items) && cachedEntry.items.length > 0
            ? cachedEntry.items
            : (persistedItems.length > 0 ? persistedItems : sameNetFallbackItems);
        const hasCachedItems = initialItems.length > 0;
        const hasFreshCache = cachedEntry && (Date.now() - cachedEntry.ts) < CATALOG_CACHE_TTL_MS;

        if (hasCachedItems) {
            if (!cachedEntry?.items?.length && persistedItems.length > 0) {
                routeCatalogCacheRef.current.set(cacheKey, { items: persistedItems, ts: 0 });
            }
            setPackages(initialItems);
            setSelectedPackage(prev => (prev && initialItems.some(p => p.productCode === prev || p.name === prev) ? prev : ''));
            setLoadingCatalog(false);
        } else if (!getNetworkRouteStatus(selectedNetwork, selectedDataType).available) {
            setPackages([]);
            setSelectedPackage('');
            setLoadingCatalog(false);
        } else {
            setLoadingCatalog(true);
        }

        if (hasFreshCache) {
            setLoadingCatalog(false);
            setIsBooting(false);
            return () => { cancelled = true; };
        }

        (async () => {
            try {
                const resolvedPkgs = await fetchNetworkPackages(selectedNetwork, selectedDataType, routeCatalogCacheRef);
                if (!cancelled) {
                    if (Array.isArray(resolvedPkgs)) {
                        const nextList = resolvedPkgs.length > 0 || !hasCachedItems ? resolvedPkgs : initialItems;
                        if (resolvedPkgs.length > 0) {
                            routeCatalogCacheRef.current.set(cacheKey, { items: resolvedPkgs, ts: Date.now() });
                            writePersistedRoutePackages(selectedNetwork, selectedDataType, resolvedPkgs);
                        }
                        setPackages(nextList);
                        setSelectedPackage(prev => (prev && nextList.some(p => p.productCode === prev || p.name === prev) ? prev : ''));
                    } else if (!hasCachedItems) {
                        setPackages([]);
                    }
                }
            } catch (err) { console.error('Catalog load error:', err); }
            finally { if (!cancelled) { setLoadingCatalog(false); setIsBooting(false); } }
        })();

        return () => { cancelled = true; };
    }, [authLoading, selectedNetwork, selectedDataType]);

    // User wallet & deposit sync scoped independently to the active user account
    useEffect(() => {
        if (authLoading) return;
        const uid = resolveUserId(user) === 'guest' ? '' : resolveUserId(user);
        if (!uid) return;
        let cancelled = false;
        const email = resolveUserEmail(user);

        (async () => {
            try {
                const syncData = await fetchWithTimeout('/api/wallet/sync', {
                    method: 'POST',
                    headers: apiHeaders(true),
                    body: JSON.stringify({ user_id: uid, userId: uid, email: email || undefined })
                }, FAST_REQUEST_TIMEOUT_MS).then(r => r.json().catch(() => null)).catch(() => null);

                if (!cancelled) {
                    if (syncData?.success) {
                        const updated = Number(syncData.current_balance);
                        if (Number.isFinite(updated)) {
                            setWalletBalance(prev => {
                                if (syncData.synced_new_deposits > 0) {
                                    const delta = Math.max(0, updated - Number(prev || 0));
                                    setVendingStatus(delta > 0 ? `✅ Successfully synced ₦${delta.toLocaleString()} deposit from bank transfer!` : `✅ Synced ${syncData.synced_new_deposits} new deposit(s) from bank transfer!`);
                                }
                                return updated;
                            });
                            vendingCache.set('balance', updated, rawUserId);
                        }
                    }
                    fetchWalletAndAccount();
                }
            } catch (err) { console.error('Wallet sync error:', err); }
        })();

        return () => { cancelled = true; };
    }, [authLoading, user, rawUserId, apiHeaders, fetchWalletAndAccount]);

    useEffect(() => {
        vendingCache.set('tab', activeTab, rawUserId); vendingCache.set('network', selectedNetwork, rawUserId);
        vendingCache.set('datatype', selectedDataType, rawUserId); vendingCache.set('vouchertype', voucherType, rawUserId); vendingCache.set('theme', theme, rawUserId);
    }, [activeTab, selectedNetwork, selectedDataType, voucherType, theme, rawUserId]);

    useEffect(() => {
        const net = NETWORKS.find(n => n.id === selectedNetwork);
        if (net?.types && !net.types.some(t => t.id === selectedDataType)) setSelectedDataType(net.types[0].id);
    }, [selectedNetwork, selectedDataType]);

    const handleGenerateVirtualAccount = async (e) => {
        e.preventDefault();
        const cleanPhone = String(phone || user?.phone || localStorage.getItem('userPhone') || '').trim();
        const cleanId = String(idNumber || '').trim();
        if (!cleanPhone) return alert('Enter a valid phone number');
        if (cleanId.length !== 11) return alert(`Enter valid 11-digit ${idType.toUpperCase()}`);
        const uid = resolveUserId(user) === 'guest' ? '' : resolveUserId(user);
        const email = resolveUserEmail(user);
        try {
            localStorage.setItem('userPhone', cleanPhone);
            if (firstName) localStorage.setItem('userFirstName', firstName.trim());
            if (lastName) localStorage.setItem('userLastName', lastName.trim());
            if (email) localStorage.setItem('userEmail', email);
            const fullName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
            const data = await (await fetch('/api/virtual-account', {
                method: 'POST', headers: apiHeaders(true),
                body: JSON.stringify({ userId: uid || email || undefined, email: email || undefined, firstName: firstName.trim(), lastName: lastName.trim(), phone: cleanPhone, bvn: idType === 'bvn' ? cleanId : undefined, nin: idType === 'nin' ? cleanId : undefined })
            })).json().catch(() => ({}));
            if (data.success) {
                const va = { accountNumber: data.accountNumber, bankName: data.bankName || 'Paystack-Titan', accountName: data.accountName || fullName, accountHolderName: data.accountHolderName || fullName };
                setVirtualAccount(va); vendingCache.set('va', va, rawUserId); setIdNumber(''); setShowModal(false); fetchWalletAndAccount();
            } else alert(hideVendor(data.error) || 'Failed');
        } catch { alert('Network error'); }
    };

    const handlePurchase = async (e) => {
        e.preventDefault();
        const routeStatus = getNetworkRouteStatus(selectedNetwork, selectedDataType);
        if (activeTab === 'data' && !routeStatus.available) return alert(routeStatus.reason || 'Not available');
        if (activeTab === 'data' && !selectedPackage) return alert('Select data package.');
        if (activeTab === 'airtime' && Number(airtimeAmount || 0) < 50) return alert('Min airtime is ₦50.');
        if (activeTab === 'voucher' && !selectedVoucherPackage && Number(airtimeAmount || 0) < 100) return alert('Select a voucher denomination or enter a valid amount.');
        if (activeTab !== 'voucher' && !recipientPhone) return alert('Enter recipient phone.');
        const uid = resolveUserId(user) === 'guest' ? '' : resolveUserId(user);
        setVendingStatus('Processing transaction with fulfillment gateway...');
        setVoucherReceipt(null); setVoucherListReceipts([]);

        const pkg = activeTab === 'data'
            ? packages.find(p => p.productCode === selectedPackage || p.name === selectedPackage)
            : null;
        const effectiveVoucherOrder = activeTab === 'voucher';
        let pCode = '', pAmount = 0, pRetailPrice, pType = activeTab, pName = '', pNetworkSlug = undefined, pDataType = effectiveVoucherOrder ? 'airtime' : selectedDataType;

        if (activeTab === 'data') {
            pCode = pkg?.productCode || selectedPackage;
            pRetailPrice = Number.isFinite(Number(pkg?.retailPrice)) && Number(pkg?.retailPrice) > 0 ? Number(pkg.retailPrice) : undefined;
            pAmount = Number(pkg?.retailPrice ?? 0);
            pName = pkg?.name || '';
            pNetworkSlug = pkg?.networkSlug;
            pDataType = pkg?.dataType || selectedDataType;
        } else if (activeTab === 'airtime') {
            pCode = '';
            pAmount = Number(airtimeAmount);
            pRetailPrice = Number(airtimeAmount);
            pDataType = 'airtime';
        } else {
            pType = 'airtime';
            pCode = selectedVoucherPackage && selectedVoucherPackage !== 'custom' ? selectedVoucherPackage : '';
            pAmount = selectedVoucherPackage && selectedVoucherPackage !== 'custom' ? Number(selectedVoucherPackage.split('-')[1] || 100) : Number(airtimeAmount);
            pRetailPrice = pAmount;
        }

        try {
            const result = await (await fetch('/api/vending/purchase', {
                method: 'POST', headers: apiHeaders(true),
                body: JSON.stringify({
                    type: pType,
                    network: selectedNetwork,
                    networkSlug: pNetworkSlug,
                    productCode: pCode,
                    planName: pName,
                    amount: pAmount,
                    retailPrice: pRetailPrice,
                    phone: recipientPhone || user?.phone || '08030000000',
                    userId: uid,
                    isVoucher: effectiveVoucherOrder,
                    quantity: voucherQuantity,
                    dataType: pDataType
                })
            })).json().catch(() => ({}));
            if (Boolean(result.success || (result.message && /success|generated|vended/i.test(result.message)))) {
                const fallbackMsg = activeTab === 'airtime' ? `Airtime Top-up of ₦${pAmount?.toLocaleString()} to ${recipientPhone || user?.phone} was completed successfully.` : activeTab === 'data' ? `Data bundle subscription successfully delivered to ${recipientPhone || user?.phone}.` : `Successfully generated ${voucherQuantity} Airtime E-PIN Voucher Slip(s)!`;
                setVendingStatus(`✅ Success: ${hideVendor(result.message) || fallbackMsg}`);
                if (result.newBalance !== undefined && Number.isFinite(Number(result.newBalance))) {
                    const nextBal = Number(result.newBalance);
                    setWalletBalance(nextBal);
                    vendingCache.set('balance', nextBal, rawUserId);
                }
                fetchWalletAndAccount();
                if (result.vouchers) setVoucherListReceipts(result.vouchers); else if (result.voucher) setVoucherReceipt(result.voucher);
            } else setVendingStatus(`❌ Failed: ${hideVendor(result.error || result.message) || 'Transaction could not be completed.'}`);
        } catch { setVendingStatus('❌ Network error communicating with fulfillment node.'); }
    };

    const filteredPackages = useMemo(() => packages.map(normPkg), [packages]);
    const voucherDenominations = useMemo(() => [100, 200, 500, 1000].map(amt => ({ productCode: `${selectedNetwork}-${amt}`, name: `${selectedNetwork.toUpperCase()} ₦${amt} PIN` })), [selectedNetwork]);
    const currentNet = useMemo(() => NETWORKS.find(n => n.id === selectedNetwork) || NETWORKS[0], [selectedNetwork]);
    const currentRouteStatus = useMemo(() => getNetworkRouteStatus(selectedNetwork, selectedDataType), [selectedNetwork, selectedDataType]);
    const isW = theme === 'white';
    const ui = useMemo(() => ({
        bg: isW
            ? 'bg-gradient-to-br from-slate-50 via-white to-amber-50/50 text-slate-900 ring-1 ring-slate-200/90 shadow-xl shadow-slate-200/40'
            : 'bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30 text-white ring-1 ring-slate-800/90 shadow-2xl shadow-black/60',
        border: isW ? 'border-slate-200/90' : 'border-slate-800/90',
        card: isW
            ? 'bg-white/95 backdrop-blur-md border-slate-200/90 shadow-lg shadow-slate-200/50'
            : 'bg-slate-900/90 backdrop-blur-md border-slate-800/90 shadow-2xl shadow-black/50',
        inner: isW ? 'bg-slate-100/90 border-slate-200/80' : 'bg-slate-950/85 border-slate-800/80',
        sub: isW ? 'text-slate-600' : 'text-slate-400',
        input: isW
            ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
            : 'bg-slate-950 border-slate-800 text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20',
        tab: isW ? 'bg-slate-200/80 border-slate-300/90' : 'bg-slate-950/90 border-slate-800'
    }), [isW]);

    if (isBooting) {
        return (
            <div className={`max-w-4xl mx-auto p-6 font-sans min-h-[450px] flex items-center justify-center ${ui.bg} rounded-3xl border ${ui.border}`}>
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className={`text-xs font-bold uppercase tracking-wider ${ui.sub}`}>Syncing Secure Vending Node...</p>
                </div>
            </div>
        );
    }

    const isOk = vendingStatus.startsWith('✅');

    return (
        <div className={`max-w-4xl mx-auto p-3.5 sm:p-6 font-sans transition-colors duration-200 rounded-3xl ${ui.bg}`}>
            <div className={`mb-5 pb-4 border-b ${ui.border} flex items-center justify-between gap-4`}>
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-all hover:border-amber-500/70 ${
                            isW
                                ? 'bg-white border-slate-300 text-slate-700 shadow-xs hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                        }`}
                    >
                        <FiArrowLeft size={16} />
                        <span className="hidden sm:inline">Back</span>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-lg sm:text-xl font-black tracking-tight text-amber-500 flex items-center gap-2">
                                <FiSmartphone className="shrink-0" /> Universal Vending &amp; Voucher Hub
                            </h1>
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isW
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}>
                                Instant Fulfillment
                            </span>
                        </div>
                        <p className={`text-[11px] mt-0.5 truncate sm:whitespace-normal ${ui.sub}`}>
                            Instant multi-network airtime, SME/Gifting data, and secure airtime E-PIN voucher fulfillment.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isAdminUser && (
                        <button
                            type="button"
                            onClick={() => navigate('/vending-team')}
                            className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                        >
                            Team
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setTheme(isW ? 'dark' : 'white')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer shrink-0 transition-all hover:border-amber-500/70 ${
                            isW
                                ? 'bg-white border-slate-300 text-slate-700 shadow-xs hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
                        }`}
                    >
                        {isW ? <FiMoon size={14} /> : <FiSun size={14} />}
                        <span className="hidden sm:inline">{isW ? 'Dark Theme' : 'White Theme'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                        className={`p-2 rounded-xl border text-xs font-bold cursor-pointer ${
                            isW
                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Sign Out"
                    >
                        <FiLogOut size={14} />
                    </button>
                </div>
            </div>

            <div className={`mb-4 p-2 rounded-2xl border flex gap-2 overflow-x-auto no-scrollbar ${
                isW ? 'bg-slate-100/80 border-slate-200/90' : 'bg-slate-950/70 border-slate-800/90'
            }`}>
                {NETWORKS.map((n) => {
                    const isSelected = selectedNetwork === n.id;
                    return (
                        <button
                            key={n.id}
                            type="button"
                            onClick={() => setSelectedNetwork(n.id)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-2 border transition-all whitespace-nowrap shrink-0 ${
                                isSelected
                                    ? `${n.color} ${n.border} shadow-md ring-2 ring-amber-500/20`
                                    : (isW
                                        ? 'bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
                                        : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80')
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-current' : 'bg-amber-400/80'}`} />
                            {n.name}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'data' && currentNet.types && (
                <div className={`mb-5 flex items-center gap-3 overflow-x-auto py-2.5 px-3.5 rounded-2xl border shadow-xs ${
                    isW ? 'bg-white/90 border-slate-200/90' : 'bg-slate-900/75 border-slate-800/90'
                }`}>
                    <span className="text-[11px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5 shrink-0 px-1">
                        <FiLayers size={14} /> Route:
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                        {currentNet.types.map((t) => {
                            const isRouteAvail = t.available !== false;
                            const isActive = selectedDataType === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedDataType(t.id)}
                                    className={`px-4 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider cursor-pointer border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                                            : isRouteAvail
                                                ? (isW ? 'bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-400/70 hover:bg-amber-50/40' : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-amber-500/40')
                                                : (isW ? 'bg-slate-100 text-slate-500 border-slate-200/80' : 'bg-slate-900/60 text-slate-400 border-slate-800')
                                    }`}
                                >
                                    <span>{t.label}</span>
                                    {!isRouteAvail && (
                                        <span className="text-[9px] font-bold normal-case px-1.5 py-0.5 rounded bg-black/10">
                                            {t.reason || 'Not available'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'data' && !currentRouteStatus.available && (
                <div className={`mb-5 px-4 py-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
                    isW ? 'bg-amber-50/90 border-amber-300/90 text-amber-900' : 'bg-amber-950/35 border-amber-500/35 text-amber-200'
                }`}>
                    <span>
                        <strong>{currentNet.name} {currentNet.types.find(t => t.id === selectedDataType)?.label || selectedDataType.toUpperCase()}:</strong>{' '}
                        {currentRouteStatus.reason || 'Not available'}
                    </span>
                </div>
            )}

            {vendingStatus && (
                <div className={`mb-5 p-4 sm:p-5 rounded-2xl border flex items-start gap-3.5 shadow-lg ${
                    isOk
                        ? (isW ? 'bg-emerald-50/95 border-emerald-300/90' : 'bg-emerald-950/40 border-emerald-500/40')
                        : (isW ? 'bg-amber-50/95 border-amber-300/90' : 'bg-amber-950/40 border-amber-500/40')
                }`}>
                    <div className={`p-3 rounded-2xl shadow-sm shrink-0 ${
                        isOk ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
                    }`}>
                        {isOk ? <FiAward size={20} /> : <FiZap size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            isOk ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}>
                            {isOk ? 'Fulfillment Confirmed' : 'System Notice'}
                        </span>
                        <h4 className={`text-sm sm:text-base font-black mt-1 ${
                            isOk ? (isW ? 'text-emerald-950' : 'text-emerald-300') : (isW ? 'text-amber-950' : 'text-amber-300')
                        }`}>
                            {isOk ? 'Transaction Completed Successfully' : 'Notice Alert'}
                        </h4>
                        <p className={`text-xs font-medium mt-1 break-words ${
                            isOk ? (isW ? 'text-emerald-800' : 'text-emerald-200/90') : (isW ? 'text-amber-800' : 'text-amber-200/90')
                        }`}>
                            {hideVendor(vendingStatus.replace(/^[✅❌]\s*(Success:)?\s*/i, ''))}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setVendingStatus('')}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-xl cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                <VendingWalletCard
                    cardBg={ui.card}
                    innerCardBg={ui.inner}
                    textSub={ui.sub}
                    isWhite={isW}
                    walletBalance={walletBalance}
                    virtualAccount={virtualAccount}
                    onOpenModal={() => setShowModal(true)}
                />
                <VendingFormTab
                    cardBg={ui.card}
                    innerCardBg={ui.inner}
                    textSub={ui.sub}
                    inputBg={ui.input}
                    tabContainerBg={ui.tab}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    canPrintVouchers={true}
                    selectedNetwork={selectedNetwork}
                    selectedPackage={selectedPackage}
                    setSelectedPackage={setSelectedPackage}
                    loadingCatalog={loadingCatalog}
                    filteredPackages={filteredPackages}
                    airtimeAmount={airtimeAmount}
                    setAirtimeAmount={setAirtimeAmount}
                    voucherType={voucherType}
                    setVoucherType={setVoucherType}
                    setSelectedVoucherPackage={setSelectedVoucherPackage}
                    selectedVoucherPackage={selectedVoucherPackage}
                    voucherDenominations={voucherDenominations}
                    voucherQuantity={voucherQuantity}
                    setVoucherQuantity={setVoucherQuantity}
                    recipientPhone={recipientPhone}
                    setRecipientPhone={setRecipientPhone}
                    handlePurchase={handlePurchase}
                    vendingStatus={vendingStatus}
                    voucherListReceipts={voucherListReceipts}
                    voucherReceipt={voucherReceipt}
                />
            </div>

            <VendingModalKYC
                showModal={showModal}
                onClose={() => setShowModal(false)}
                isWhite={isW}
                textSub={ui.sub}
                inputBg={ui.input}
                tabContainerBg={ui.tab}
                firstName={firstName}
                setFirstName={setFirstName}
                lastName={lastName}
                setLastName={setLastName}
                phone={phone}
                setPhone={setPhone}
                idType={idType}
                setIdType={setIdType}
                idNumber={idNumber}
                setIdNumber={setIdNumber}
                handleGenerateVirtualAccount={handleGenerateVirtualAccount}
            />
        </div>
    );
}
