import React, { useState } from 'react';
import { FiUsers, FiSearch, FiCopy, FiCheck } from 'react-icons/fi';

export default function VendingUserDirectory({ users = [], loading = false, isLight = true }) {
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const handleCopy = (val) => {
    if (!val) return;
    navigator.clipboard?.writeText(String(val)).catch(() => {});
    setCopiedId(String(val));
    setTimeout(() => setCopiedId(''), 1800);
  };

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(u.full_name || '').toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.uuid || u.id || '').toLowerCase().includes(q)
    );
  });

  const cardBgClass = isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0B1221] border-slate-800 shadow-xl';
  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`border rounded-3xl p-5 space-y-4 transition-all ${cardBgClass}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-2">
          <FiUsers /> Registered Users &amp; Fiat Balances ({users.length})
        </h3>
        <div className="relative w-full sm:w-64">
          <FiSearch className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search name, email or UUID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500'
                : 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
            }`}
          />
        </div>
      </div>

      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className={`text-[10px] uppercase border-b ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
              <th className="pb-2.5 pr-3">User</th>
              <th className="pb-2.5 pr-3">UUID</th>
              <th className="pb-2.5 pr-3">Role</th>
              <th className="pb-2.5 text-right">Wallet Balance (₦)</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/60'}`}>
            {loading ? (
              <tr>
                <td colSpan="4" className={`text-center py-6 ${textMuted}`}>Loading users...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="4" className={`text-center py-6 ${textMuted}`}>No matching users found.</td>
              </tr>
            ) : (
              filtered.map((u, idx) => {
                const uid = u.uuid || u.id || 'UNKNOWN';
                return (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3">
                      <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                        {u.full_name || u.email || uid}
                      </div>
                      <div className={`text-[10px] ${textMuted}`}>{u.email || ''}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-500/10 text-[10px] text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                        <span>{uid}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(uid)}
                          className="hover:text-emerald-500 cursor-pointer"
                          title="Copy UUID"
                        >
                          {copiedId === String(uid) ? <FiCheck size={10} className="text-emerald-500" /> : <FiCopy size={10} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 uppercase text-[10px] font-bold">
                      {Number(u.is_admin) === 1 || u.role === 'admin' ? 'Admin' : 'User'}
                    </td>
                    <td className="py-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                      ₦{Number(u.balance || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
