import React, { useState } from 'react';
import { FiCreditCard, FiCopy, FiCheck } from 'react-icons/fi';

export default function VendingWalletCard({
    cardBg,
    innerCardBg,
    textSub,
    isWhite,
    walletBalance,
    virtualAccount,
    onOpenModal
}) {
    const [copiedAccount, setCopiedAccount] = useState(false);

    const copyAccount = () => {
        if (!virtualAccount?.accountNumber) return;
        navigator.clipboard?.writeText(virtualAccount.accountNumber).catch(() => {});
        setCopiedAccount(true);
        setTimeout(() => setCopiedAccount(false), 2000);
    };

    const holderName = virtualAccount?.accountHolderName || virtualAccount?.accountName || '';

    return (
        <div className={`${cardBg} border rounded-3xl p-5 flex flex-col justify-between shadow-xl space-y-5`}>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Vending Fiat Wallet</span>
                    <FiCreditCard className="text-amber-500" />
                </div>
                <div className="text-2xl font-black text-emerald-500 font-mono">
                    ₦{Number(walletBalance || 0).toLocaleString()}
                </div>
            </div>

            {virtualAccount?.accountNumber ? (
                <div className={`p-3.5 ${innerCardBg} border border-amber-500/20 rounded-2xl space-y-2`}>
                    <span className="text-[10px] font-bold uppercase text-amber-500 block">Dedicated Funding Account</span>
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-base font-black">{virtualAccount.accountNumber}</span>
                        <button
                            type="button"
                            onClick={copyAccount}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg cursor-pointer"
                        >
                            {copiedAccount ? <FiCheck size={14} /> : <FiCopy size={14} />}
                        </button>
                    </div>
                    <div className={`text-[11px] ${textSub}`}>{virtualAccount.bankName || 'Paystack-Titan'}</div>
                    {holderName && (
                        <div className={`text-[10px] ${textSub} font-semibold truncate`}>{holderName}</div>
                    )}
                </div>
            ) : (
                <div className={`p-3.5 ${innerCardBg} border rounded-2xl text-center space-y-2`}>
                    <p className={`text-[11px] ${textSub}`}>Generate an instant virtual bank account to fund your wallet.</p>
                    <button
                        type="button"
                        onClick={onOpenModal}
                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-xl cursor-pointer transition-all"
                    >
                        Generate Account Number
                    </button>
                </div>
            )}

            <div className={`pt-3 border-t ${isWhite ? 'border-slate-200' : 'border-slate-800/80'}`}>
                <span className={`text-[10px] ${textSub} block`}>Transfer to your account to auto-credit wallet.</span>
            </div>
        </div>
    );
}
