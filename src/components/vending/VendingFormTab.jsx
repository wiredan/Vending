import React, { useEffect } from 'react';
import { FiPrinter } from 'react-icons/fi';

const hideVendor = (m) =>
    String(m || '')
        .replace(/pey(?:flex)?|pevf(?:lex)?/gi, 'Gateway')
        .replace(/\s+/g, ' ')
        .trim();

export default function VendingFormTab({
    cardBg,
    innerCardBg,
    textSub,
    inputBg,
    tabContainerBg,
    activeTab,
    setActiveTab,
    canPrintVouchers,
    selectedNetwork,
    selectedPackage,
    setSelectedPackage,
    loadingCatalog,
    filteredPackages,
    airtimeAmount,
    setAirtimeAmount,
    voucherType,
    setVoucherType,
    setSelectedVoucherPackage,
    selectedVoucherPackage,
    voucherDenominations,
    voucherQuantity,
    setVoucherQuantity,
    recipientPhone,
    setRecipientPhone,
    handlePurchase,
    vendingStatus,
    voucherListReceipts,
    voucherReceipt
}) {
    const isProcessing = vendingStatus?.startsWith('Processing');

    // Enforce airtime-only voucher mode whenever the Print E-PIN tab is active
    useEffect(() => {
        if (activeTab === 'voucher' && voucherType !== 'airtime') {
            setVoucherType('airtime');
            setSelectedVoucherPackage('');
        }
    }, [activeTab, voucherType, setVoucherType, setSelectedVoucherPackage]);

    return (
        <div className={`md:col-span-2 ${cardBg} border rounded-3xl p-5 shadow-xl`}>
            {/* Top Mode Tabs */}
            <div className={`grid ${canPrintVouchers ? 'grid-cols-3' : 'grid-cols-2'} p-1 ${tabContainerBg} rounded-xl mb-5 border`}>
                <button
                    type="button"
                    onClick={() => setActiveTab('data')}
                    className={`py-2 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                        activeTab === 'data' ? 'bg-amber-500 text-slate-950' : `${textSub} hover:text-amber-500`
                    }`}
                >
                    Data Bundles
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('airtime')}
                    className={`py-2 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                        activeTab === 'airtime' ? 'bg-amber-500 text-slate-950' : `${textSub} hover:text-amber-500`
                    }`}
                >
                    Airtime
                </button>
                {canPrintVouchers && (
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('voucher');
                            setVoucherType('airtime');
                        }}
                        className={`py-2 text-xs font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            activeTab === 'voucher' ? 'bg-emerald-500 text-slate-950' : 'text-emerald-500 hover:text-emerald-400'
                        }`}
                    >
                        <FiPrinter size={12} /> Print E-PIN
                    </button>
                )}
            </div>

            <form onSubmit={handlePurchase} className="space-y-4">
                {activeTab === 'data' && (
                    <div>
                        <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                            Select {selectedNetwork.toUpperCase()} Bundle
                        </label>
                        <select
                            value={selectedPackage}
                            onChange={(e) => setSelectedPackage(e.target.value)}
                            className={`w-full ${inputBg} border focus:border-amber-500 rounded-xl px-4 py-3 text-xs outline-none cursor-pointer`}
                        >
                            <option value="">
                                {loadingCatalog
                                    ? 'Loading live bundles...'
                                    : filteredPackages.length > 0
                                    ? '-- Choose Data Plan --'
                                    : '-- No plans available for this route --'}
                            </option>
                            {filteredPackages.map((pkg, idx) => (
                                <option key={`${pkg.productCode}-${idx}`} value={pkg.productCode}>
                                    {hideVendor(pkg.name)}{Number.isFinite(Number(pkg.retailPrice)) && Number(pkg.retailPrice) > 0 ? ` — ₦${Number(pkg.retailPrice).toLocaleString()}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {activeTab === 'airtime' && (
                    <div>
                        <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                            Airtime Amount (₦)
                        </label>
                        <input
                            type="number"
                            min="50"
                            placeholder="e.g. 500"
                            value={airtimeAmount}
                            onChange={(e) => setAirtimeAmount(e.target.value)}
                            className={`w-full ${inputBg} border focus:border-amber-500 rounded-xl px-4 py-3 text-xs outline-none`}
                        />
                    </div>
                )}

                {activeTab === 'voucher' && (
                    <div className={`space-y-3 p-3.5 ${innerCardBg} border border-emerald-500/20 rounded-2xl`}>
                        <div className="flex items-center justify-between gap-2 pb-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                                Airtime E-PIN Voucher Generator
                            </span>
                            <span className={`text-[10px] font-semibold ${textSub}`}>
                                Airtime Only
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                                    Select Airtime Voucher
                                </label>
                                <select
                                    value={selectedVoucherPackage}
                                    onChange={(e) => setSelectedVoucherPackage(e.target.value)}
                                    className={`w-full ${inputBg} border focus:border-emerald-500 rounded-xl px-3 py-2.5 text-xs outline-none cursor-pointer`}
                                >
                                    <option value="">-- Choose Denomination --</option>
                                    {voucherDenominations.map((v, idx) => (
                                        <option key={idx} value={v.productCode}>
                                            {hideVendor(v.name)}
                                        </option>
                                    ))}
                                    <option value="custom">Custom Amount (₦100 - ₦50,000)</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                                    Quantity (Cards)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={voucherQuantity}
                                    onChange={(e) => setVoucherQuantity(Math.max(1, Math.min(50, Number(e.target.value))))}
                                    className={`w-full ${inputBg} border focus:border-emerald-500 rounded-xl px-3 py-2.5 text-xs font-bold outline-none`}
                                />
                            </div>
                        </div>

                        {selectedVoucherPackage === 'custom' && (
                            <div>
                                <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                                    Custom Airtime Amount (₦)
                                </label>
                                <input
                                    type="number"
                                    min="100"
                                    max="50000"
                                    placeholder="e.g. 500"
                                    value={airtimeAmount}
                                    onChange={(e) => setAirtimeAmount(e.target.value)}
                                    className={`w-full ${inputBg} border focus:border-emerald-500 rounded-xl px-3 py-2.5 text-xs outline-none`}
                                />
                            </div>
                        )}
                    </div>
                )}

                {activeTab !== 'voucher' && (
                    <div>
                        <label className={`block text-[10px] font-bold uppercase ${textSub} mb-1`}>
                            Recipient Phone Number
                        </label>
                        <input
                            type="tel"
                            placeholder="08012345678"
                            value={recipientPhone}
                            onChange={(e) => setRecipientPhone(e.target.value)}
                            className={`w-full ${inputBg} border focus:border-amber-500 rounded-xl px-4 py-3 text-xs outline-none`}
                        />
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isProcessing}
                    className={`w-full bg-gradient-to-r ${
                        activeTab === 'voucher'
                            ? 'from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300'
                            : 'from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300'
                    } text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer shadow-lg`}
                >
                    {isProcessing
                        ? 'Processing...'
                        : activeTab === 'voucher'
                        ? `Generate & Print ${voucherQuantity} Airtime E-PIN Slip(s)`
                        : activeTab === 'data'
                        ? 'Buy Data Bundle Instantly'
                        : 'Top-Up Airtime Instantly'}
                </button>
            </form>

            {/* Printable Multi-Voucher Grid */}
            {voucherListReceipts.length > 0 && (
                <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-700/30 pb-2">
                        <span className="text-xs font-black uppercase text-emerald-500">
                            Generated Airtime E-PIN Slips ({voucherListReceipts.length})
                        </span>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="bg-emerald-500 text-slate-950 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                            <FiPrinter /> Print All Slips
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {voucherListReceipts.map((v, idx) => (
                            <div
                                key={idx}
                                className="p-4 bg-white text-slate-950 rounded-2xl border-2 border-dashed border-emerald-600 font-mono text-xs shadow-md"
                            >
                                <div className="flex justify-between items-center border-b border-slate-300 pb-1.5 mb-2">
                                    <span className="font-black text-xs text-emerald-800">{v.network} AIRTIME</span>
                                    <span className="font-black text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                                        {v.amount}
                                    </span>
                                </div>
                                <div className="text-center my-2 bg-slate-100 py-2 rounded-xl border border-slate-200">
                                    <span className="text-[9px] text-slate-500 block">RECHARGE PIN</span>
                                    <span className="text-sm font-black tracking-widest text-slate-950">{v.pin}</span>
                                </div>
                                <div className="text-[9px] text-slate-600 space-y-0.5">
                                    <div>
                                        <strong>Load:</strong> {v.dialCode}
                                    </div>
                                    <div>
                                        <strong>S/N:</strong> {v.serial}
                                    </div>
                                    <div>
                                        <strong>Ref:</strong> {v.reference}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legacy Single Printable Voucher Slip */}
            {voucherReceipt && voucherListReceipts.length === 0 && (
                <div className="mt-6 p-5 bg-white text-slate-950 rounded-2xl border-2 border-dashed border-slate-400 font-mono text-xs shadow-2xl">
                    <div className="text-center border-b border-slate-300 pb-3 mb-3">
                        <h4 className="font-black text-sm uppercase">Wiredan E-PIN Voucher</h4>
                        <p className="text-[10px] text-slate-500">{voucherReceipt.date}</p>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <span>Network:</span>
                            <span className="font-bold">{voucherReceipt.network}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Value:</span>
                            <span className="font-bold">{voucherReceipt.amount}</span>
                        </div>
                        <div className="my-2 p-2.5 bg-slate-100 rounded-xl text-center border border-slate-300">
                            <span className="text-[10px] text-slate-500 block">E-PIN / CODE</span>
                            <span className="text-base font-black tracking-widest">{voucherReceipt.pin}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>How to Load:</span>
                            <span className="font-bold">{voucherReceipt.dialCode}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Serial No:</span>
                            <span>{voucherReceipt.serial}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="mt-4 w-full py-2.5 bg-slate-900 text-white font-bold uppercase text-[11px] rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <FiPrinter /> Print Voucher Slip
                    </button>
                </div>
            )}
        </div>
    );
}
