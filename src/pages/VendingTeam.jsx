/* ============================================================
   Wiredan Vending Hub - VendingTeam.jsx (Team Daily Sales & Operator Tracking)
   Path: src/pages/VendingTeam.jsx
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { FiUsers, FiCalendar, FiCheckCircle, FiRefreshCw, FiSun, FiMoon, FiCopy, FiCheck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import VendingUserDirectory from '../components/vending/VendingUserDirectory';

export default function VendingTeam() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('light');
  const [copiedId, setCopiedId] = useState('');
  const [teamData, setTeamData] = useState({
    summary: { totalRevenue: 0, totalVolumeGB: 0, totalOrders: 0, activeAgents: 0, totalUsers: 0 },
    userDirectory: [],
    dailyBreakdown: [],
    agentPerformance: [],
    recentSales: []
  });

  const isAuthorizedUser = user?.email === 'mtlhumaid@gmail.com' || user?.role === 'admin' || user?.is_admin === 1;

  useEffect(() => {
    if (!isAuthorizedUser) {
      navigate('/vending');
      return;
    }
    fetchTeamSales();
  }, [token, user, isAuthorizedUser, navigate]);

  const fetchTeamSales = async () => {
    setLoading(true);
    try {
      const userId = user?.uuid || user?.id || localStorage.getItem('userId') || "";
      const res = await fetch('/api/vending-team', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(userId ? { 'X-User-Id': userId } : {})
        }
      });
      const data = await res.json();
      if (data.success) {
        setTeamData(data);
      }
    } catch (err) {
      console.error("Vending Team Sync Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleCopy = (val) => {
    if (!val) return;
    navigator.clipboard?.writeText(String(val)).catch(() => {});
    setCopiedId(String(val));
    setTimeout(() => setCopiedId(''), 1800);
  };

  const { summary, userDirectory = [], dailyBreakdown, agentPerformance, recentSales } = teamData;

  const isLight = theme === 'light';
  const bgClass = isLight ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#070C14] text-white';
  const cardBgClass = isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0B1221] border-slate-800 shadow-xl';
  const subCardBgClass = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800';
  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const tableHeaderClass = isLight ? 'border-b border-slate-200 text-slate-500' : 'border-b border-slate-800 text-slate-400';
  const tableRowHover = isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-900/50';

  return (
    <div className={`p-4 sm:p-8 space-y-6 font-sans min-h-screen transition-colors duration-300 ${bgClass}`}>

      {/* Header */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-black uppercase rounded-lg">
              Vending Team Division
            </span>
            <span className={textMuted}>|</span>
            <span className={`font-mono text-xs ${textMuted}`}>Active Sales Tracker</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
            <FiUsers className="animate-pulse" /> Vending Team Daily Records
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-2 font-black text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
            }`}
            title="Toggle Theme"
          >
            {isLight ? <FiMoon size={16} className="text-slate-700" /> : <FiSun size={16} className="text-amber-400" />}
            <span>{isLight ? 'Dark Mode' : 'Light Mode'}</span>
          </button>

          <button
            onClick={() => navigate('/vending')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            ← Vending Hub
          </button>

          <button
            onClick={fetchTeamSales}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} /> Sync Team Ledger
          </button>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`border rounded-2xl p-5 space-y-1 transition-all ${cardBgClass}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Total Team Revenue</span>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">₦{Number(summary.totalRevenue).toLocaleString()}</div>
          <p className={`text-[10px] font-mono ${textMuted}`}>30-day cumulative sales</p>
        </div>
        <div className={`border rounded-2xl p-5 space-y-1 transition-all ${cardBgClass}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Total Data Volume</span>
          <div className="text-2xl font-black font-mono text-amber-500 dark:text-amber-400">{summary.totalVolumeGB} GB</div>
          <p className={`text-[10px] font-mono ${textMuted}`}>Delivered data bundles</p>
        </div>
        <div className={`border rounded-2xl p-5 space-y-1 transition-all ${cardBgClass}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Total Orders</span>
          <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">{summary.totalOrders}</div>
          <p className={`text-[10px] font-mono ${textMuted}`}>Successful transactions</p>
        </div>
        <div className={`border rounded-2xl p-5 space-y-1 transition-all ${cardBgClass}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Active Operators</span>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400">{summary.activeAgents}</div>
          <p className={`text-[10px] font-mono ${textMuted}`}>Contributing agents ({userDirectory.length} total users)</p>
        </div>
      </div>

      {/* D1 Full User Directory & Available Fiat Wallets */}
      <VendingUserDirectory
        users={userDirectory}
        loading={loading}
        isLight={isLight}
      />

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Daily Breakdown */}
        <div className={`border rounded-3xl p-5 space-y-4 transition-all ${cardBgClass}`}>
          <h3 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-2">
            <FiCalendar /> Daily Sales Breakdown
          </h3>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {loading ? (
              <p className={`text-xs text-center py-6 ${textMuted}`}>Loading daily records...</p>
            ) : dailyBreakdown.length === 0 ? (
              <p className={`text-xs text-center py-6 ${textMuted}`}>No daily records found.</p>
            ) : (
              dailyBreakdown.map((day, idx) => (
                <div key={idx} className={`p-3 border rounded-xl flex items-center justify-between font-mono text-xs transition-all ${subCardBgClass}`}>
                  <div>
                    <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{day.date}</span>
                    <div className={`text-[10px] ${textMuted}`}>{day.totalOrders} orders processed</div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-amber-500 dark:text-amber-400">{day.volumeGB} GB</span>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400">₦{Number(day.revenue).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Operator Performance */}
        <div className={`border rounded-3xl p-5 space-y-4 transition-all ${cardBgClass}`}>
          <h3 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-2">
            <FiUsers /> Operator / Agent Performance
          </h3>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {loading ? (
              <p className={`text-xs text-center py-6 ${textMuted}`}>Loading agent metrics...</p>
            ) : agentPerformance.length === 0 ? (
              <p className={`text-xs text-center py-6 ${textMuted}`}>No agent data recorded yet.</p>
            ) : (
              agentPerformance.map((agent, idx) => {
                const displayUuid = agent.userUuid || agent.agentId;
                return (
                  <div key={idx} className={`p-3 border rounded-xl flex items-center justify-between gap-3 font-mono text-xs transition-all ${subCardBgClass}`}>
                    <div className="min-w-0">
                      <div className={`font-bold truncate ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {agent.agentName || displayUuid}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 truncate max-w-[190px]">
                          UUID: {displayUuid}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(displayUuid)}
                          className="text-slate-400 hover:text-emerald-500 cursor-pointer shrink-0"
                          title="Copy UUID"
                        >
                          {copiedId === String(displayUuid) ? <FiCheck size={11} className="text-emerald-500" /> : <FiCopy size={11} />}
                        </button>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${textMuted}`}>{agent.ordersCount} sales executed</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-blue-600 dark:text-blue-400">{agent.volumeGB} GB</span>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">₦{Number(agent.revenueGenerated).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Recent Sales Stream (phone numbers hidden visibly) */}
      <div className={`border rounded-3xl p-5 space-y-4 transition-all ${cardBgClass}`}>
        <h3 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-2">
          <FiCheckCircle /> Recent Vending Team Transactions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className={`text-[10px] uppercase ${tableHeaderClass}`}>
                <th className="pb-3 pr-3">Timestamp</th>
                <th className="pb-3 pr-3">User Name &amp; UUID</th>
                <th className="pb-3 pr-3">Product / Plan</th>
                <th className="pb-3 text-right">Amount (₦)</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/60'}`}>
              {loading ? (
                <tr><td colSpan="4" className={`text-center py-6 ${textMuted}`}>Syncing sales feed...</td></tr>
              ) : recentSales.length === 0 ? (
                <tr><td colSpan="4" className={`text-center py-6 ${textMuted}`}>No transactions recorded yet.</td></tr>
              ) : (
                recentSales.map((sale, i) => {
                  const saleUuid = sale.userUuid || sale.userId || 'UNKNOWN';
                  const saleUserName = sale.userName || sale.agentName || saleUuid;
                  return (
                    <tr key={i} className={`transition-colors ${tableRowHover}`}>
                      <td className={`py-3 pr-3 text-[11px] whitespace-nowrap ${textMuted}`}>{sale.created_at}</td>
                      <td className="py-3 pr-3">
                        <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                          {saleUserName}
                        </div>
                        <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded bg-slate-500/10 text-[10px] text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          <span>{saleUuid}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(saleUuid)}
                            className="hover:text-emerald-500 cursor-pointer"
                            title="Copy UUID"
                          >
                            {copiedId === String(saleUuid) ? <FiCheck size={10} className="text-emerald-500" /> : <FiCopy size={10} />}
                          </button>
                        </div>
                      </td>
                      <td className={`py-3 pr-3 font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{sale.productName || sale.product_name || sale.productId || sale.product_id}</td>
                      <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">₦{Number(sale.price || sale.amount || 0).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
