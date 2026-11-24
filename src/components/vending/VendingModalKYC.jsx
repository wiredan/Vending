import React from 'react';
import { FiShield } from 'react-icons/fi';

export default function VendingModalKYC({
    showModal,
    onClose,
    isWhite,
    textSub,
    inputBg,
    tabContainerBg,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    phone,
    setPhone,
    idType,
    setIdType,
    idNumber,
    setIdNumber,
    handleGenerateVirtualAccount
}) {
    if (!showModal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className={`${isWhite ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'} border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4`}>
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase text-amber-500 flex items-center gap-2">
                        <FiShield /> Instant Virtual Account KYC
                    </h3>
                    <button type="button" onClick={onClose} className={`${textSub} text-xs font-bold cursor-pointer`}>
                        ✕
                    </button>
                </div>
                <p className={`text-xs ${textSub}`}>
                    Verify with BVN or NIN to generate your permanent Naira funding account number.
                </p>
                <form onSubmit={handleGenerateVirtualAccount} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            placeholder="First Name"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className={`${inputBg} border rounded-xl px-3 py-2.5 text-xs outline-none`}
                        />
                        <input
                            type="text"
                            placeholder="Last Name"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className={`${inputBg} border rounded-xl px-3 py-2.5 text-xs outline-none`}
                        />
                    </div>
                    <input
                        type="tel"
                        placeholder="Phone Number"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full ${inputBg} border rounded-xl px-3 py-2.5 text-xs outline-none`}
                    />
                    <div className={`grid grid-cols-2 gap-2 p-1 ${tabContainerBg} rounded-xl border`}>
                        <button
                            type="button"
                            onClick={() => setIdType('bvn')}
                            className={`py-1.5 text-[11px] font-black uppercase rounded-lg cursor-pointer ${
                                idType === 'bvn' ? 'bg-amber-500 text-slate-950' : textSub
                            }`}
                        >
                            Use BVN
                        </button>
                        <button
                            type="button"
                            onClick={() => setIdType('nin')}
                            className={`py-1.5 text-[11px] font-black uppercase rounded-lg cursor-pointer ${
                                idType === 'nin' ? 'bg-amber-500 text-slate-950' : textSub
                            }`}
                        >
                            Use NIN
                        </button>
                    </div>
                    <input
                        type="text"
                        maxLength={11}
                        placeholder={`11-Digit ${idType.toUpperCase()} Number`}
                        required
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
                        className={`w-full ${inputBg} border rounded-xl px-3 py-2.5 text-xs font-mono outline-none`}
                    />
                    <button
                        type="submit"
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-xl cursor-pointer"
                    >
                        Verify &amp; Create Account
                    </button>
                </form>
            </div>
        </div>
    );
}
