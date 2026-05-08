import React, { useState } from 'react';
import { useStore } from '../store';
import { formatCurrency, getTotalGoal, getExpectedSavings } from '../lib/utils';
import { ArrowLeft, Target, Coins, TrendingUp, Plus, Calendar, Clock, ArrowRightLeft, Trash2 } from 'lucide-react';
import { format, parseISO, compareAsc } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export function BeneficiaryDetail({ id, onBack }: { id: string, onBack: () => void }) {
  const { state, addDeposit, updateDepositStatus, deleteDeposit, addRecurringConfig, addGoldInvestment, deleteBeneficiary } = useStore();
  const beneficiary = state.beneficiaries.find(b => b.id === id);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'add_gold' | 'convert'>('overview');
  
  // Deposit Form State
  const [depAmount, setDepAmount] = useState('');
  const [calcMode, setCalcMode] = useState<'amount' | 'balance'>('amount');
  const [newBalance, setNewBalance] = useState('');
  const [depType, setDepType] = useState<'once' | 'recurring'>('once');
  const [depFreq, setDepFreq] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [depMode, setDepMode] = useState<'auto' | 'manual'>('auto');
  const [depDate, setDepDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Add Gold Form State
  const [goldAmount, setGoldAmount] = useState(''); // in 8g coins
  const [goldDate, setGoldDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Convert Form State
  const [convAmount, setConvAmount] = useState(''); // in coins
  const [convDate, setConvDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  if (!beneficiary) return <div>Not found</div>;

  const pendingDeposits = state.deposits.filter(d => d.beneficiaryId === id && d.status === 'pending');
  const completedDeps = state.deposits.filter(d => d.beneficiaryId === id && d.status === 'completed');
  const historyDeps = state.deposits.filter(d => d.beneficiaryId === id && d.status !== 'pending');
  const invs = state.goldInvestments.filter(i => i.beneficiaryId === id);
  const recs = state.recurringConfigs.filter(r => r.beneficiaryId === id);

  const cashIn = completedDeps.reduce((sum, d) => sum + d.amount, 0);
  const cashSpent = invs.filter(i => !i.isExternal).reduce((sum, i) => sum + (i.quantity * i.purchasePricePerUnit), 0);
  const totalCash = Math.max(0, cashIn - cashSpent);
  const totalCoins = invs.reduce((sum, i) => sum + i.quantity, 0);
  const goldValue = totalCoins * state.currentGoldPricePerUnit;
  const totalValue = totalCash + goldValue;
  
  const goalAmount = getTotalGoal(beneficiary);
  const expectedSavings = getExpectedSavings(beneficiary);

  const cashProgress = goalAmount > 0 ? (totalCash / goalAmount) * 100 : 0;
  const goldProgress = goalAmount > 0 ? (goldValue / goalAmount) * 100 : 0;
  const totalProgress = Math.min(100, cashProgress + goldProgress);
  
  const renderCashPct = totalProgress > 0 ? (cashProgress / (cashProgress + goldProgress)) * totalProgress : 0;
  const renderGoldPct = totalProgress > 0 ? (goldProgress / (cashProgress + goldProgress)) * totalProgress : 0;


  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    let amt = parseFloat(depAmount);
    
    if (calcMode === 'balance') {
      const targetBalance = parseFloat(newBalance);
      if (isNaN(targetBalance)) return;
      amt = targetBalance - totalCash;
    }

    if (isNaN(amt) || amt <= 0) return;

    if (depType === 'once') {
      addDeposit({
        beneficiaryId: id,
        amount: amt,
        date: new Date(depDate).toISOString(),
        isRecurring: false,
        notes: calcMode === 'balance' ? 'Balance adjustment' : 'Manual deposit',
        status: 'completed'
      });
    } else {
      addRecurringConfig({
        beneficiaryId: id,
        amount: amt,
        frequency: depFreq,
        startDate: new Date(depDate).toISOString(),
        isManual: depMode === 'manual'
      });
    }
    setDepAmount('');
    setNewBalance('');
    setActiveTab('overview');
  };

  const handleAddGold = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(goldAmount);
    if (isNaN(qty) || qty <= 0) return;

    addGoldInvestment({
      beneficiaryId: id,
      quantity: qty,
      purchasePricePerUnit: state.currentGoldPricePerUnit,
      date: new Date(goldDate).toISOString(),
      isExternal: true
    });
    
    setGoldAmount('');
    setActiveTab('overview');
  };

  const handleConvert = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(convAmount);
    if (isNaN(qty) || qty <= 0) return;
    
    // Calculate if they have enough cash based on current target price
    const cost = qty * state.currentGoldPricePerUnit;
    if (totalCash < cost) {
      alert(`Not enough cash. You need ${formatCurrency(cost, state.currency)} but have ${formatCurrency(totalCash, state.currency)}`);
      return;
    }

    addGoldInvestment({
      beneficiaryId: id,
      quantity: qty,
      purchasePricePerUnit: state.currentGoldPricePerUnit,
      date: new Date(convDate).toISOString()
    });
    setConvAmount('');
    setActiveTab('overview');
  };

  // Build Chart Data
  // We need a timeline of value. For simplicity, we create cumulative events.
  const chartEvents = [
    ...completedDeps.map(d => ({ date: parseISO(d.date), type: 'dep', val: d.amount, isExternal: false })),
    ...invs.map(i => ({ date: parseISO(i.date), type: 'inv', val: i.quantity, isExternal: i.isExternal }))
  ].sort((a, b) => compareAsc(a.date, b.date));

  let runningCash = 0;
  let runningCoins = 0;
  
  const chartData = chartEvents.map(evt => {
    if (evt.type === 'dep') runningCash += evt.val;
    else if (evt.type === 'inv') {
      if (!evt.isExternal) {
        runningCash -= (evt.val * state.currentGoldPricePerUnit); // approximation using current price
      }
      runningCoins += evt.val;
    }
    const goldVal = runningCoins * state.currentGoldPricePerUnit;
    const totalVal = runningCash + goldVal;
    return {
      date: format(evt.date, 'MMM dd, yyyy'),
      timestamp: evt.date.getTime(),
      Value: totalVal,
      Cash: runningCash,
      Gold: goldVal
    };
  });

  // Ensure there's at least one data point or start from 0
  if (chartData.length > 0) {
    chartData.unshift({ date: 'Start', timestamp: 0, Value: 0, Cash: 0, Gold: 0 });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[32px] p-6 md:p-10 shadow-sm border border-stone-200/60 overflow-hidden relative">
        <div className="flex flex-col md:flex-row gap-8 md:items-center justify-between pb-10 border-b border-stone-100 relative z-10">
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 rounded-[20px] flex items-center justify-center text-white text-3xl font-display font-bold shadow-inner ${beneficiary.avatarColor}`}>
              {beneficiary.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-stone-900">{beneficiary.name}'s Vault</h2>
              <div className="flex items-center gap-3 mt-2 text-sm font-medium text-stone-500 tracking-wide">
                <span className="flex items-center gap-1.5"><Target className="w-4 h-4 text-stone-400" /> Goal: {formatCurrency(goalAmount, state.currency)}</span>
                {beneficiary.monthlyTarget && (
                  <span className="hidden md:inline px-3 py-1 bg-stone-100 rounded-full text-xs uppercase tracking-widest font-bold">
                    {formatCurrency(beneficiary.monthlyTarget, state.currency)} / mo. to age {beneficiary.targetAge}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex bg-stone-100/80 p-1.5 rounded-2xl self-start w-full md:w-auto overflow-x-auto shadow-inner">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-white text-stone-900 shadow border border-stone-200/50' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('deposit')}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'deposit' ? 'bg-white text-emerald-700 shadow border border-stone-200/50' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Add Cash
            </button>
            <button 
              onClick={() => setActiveTab('add_gold')}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'add_gold' ? 'bg-white text-amber-700 shadow border border-stone-200/50' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Add Gold
            </button>
            <button 
              onClick={() => setActiveTab('convert')}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'convert' ? 'bg-white text-amber-600 shadow border border-stone-200/50' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Convert to Gold
            </button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="mt-10 space-y-10 animate-in fade-in duration-300 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-stone-50/80 rounded-[28px] p-6 border border-stone-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Total Value</p>
                <p className="text-4xl font-light tracking-tight text-stone-900">{formatCurrency(totalValue, state.currency)}</p>
                <div className="mt-6 flex flex-col gap-1.5">
                  <div className="flex w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${renderCashPct}%` }} title="Cash" />
                    <div className="h-full bg-amber-500" style={{ width: `${renderGoldPct}%` }} title="Gold" />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{(cashProgress + goldProgress).toFixed(1)}% of Goal</span>
                  </div>
                </div>
                {expectedSavings > 0 && expectedSavings > totalValue && (
                  <div className="mt-5 p-3.5 bg-rose-50/80 rounded-[20px] border border-rose-100/50 backdrop-blur-sm">
                    <p className="text-xs text-rose-800 font-bold uppercase tracking-wider">⚠️ Behind Schedule</p>
                    <p className="text-xs text-rose-700/80 mt-1 font-medium leading-relaxed">Short of your <strong>{formatCurrency(expectedSavings, state.currency)}</strong> target. Try adding <strong>{formatCurrency(expectedSavings - totalValue, state.currency)}</strong>!</p>
                  </div>
                )}
                {expectedSavings > 0 && totalValue >= expectedSavings && (
                  <div className="mt-5 p-3.5 bg-emerald-50/80 rounded-[20px] border border-emerald-100/50 backdrop-blur-sm">
                    <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">✨ On Track</p>
                    <p className="text-xs text-emerald-700/80 mt-1 font-medium leading-relaxed">You have reached your target of <strong>{formatCurrency(expectedSavings, state.currency)}</strong>.</p>
                  </div>
                )}
              </div>
              
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-[28px] p-6 border border-amber-100/50 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-28 h-28 bg-amber-400/10 rounded-full blur-2xl group-hover:bg-amber-400/20 transition-all duration-700" />
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-xs font-bold text-amber-800/70 uppercase tracking-widest mb-1">21K English Coins (8g)</p>
                    <p className="text-5xl font-display font-semibold tracking-tighter text-amber-700">{totalCoins.toFixed(2)}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center">
                    <Coins className="w-6 h-6" />
                  </div>
                </div>
                <div className="relative z-10 mt-6">
                  <p className="text-sm font-semibold text-amber-900/80">≈ {formatCurrency(totalCoins * state.currentGoldPricePerUnit, state.currency)} <span className="text-amber-700/50 font-normal">market value</span></p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[28px] p-6 border border-emerald-100/50 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl group-hover:bg-emerald-400/20 transition-all duration-700" />
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-xs font-bold text-emerald-800/70 uppercase tracking-widest mb-1">Available Cash</p>
                    <p className="text-4xl font-light tracking-tight text-emerald-700">{formatCurrency(totalCash, state.currency)}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>
                <div className="relative z-10 mt-6">
                  <p className="text-xs font-medium text-emerald-800/60 leading-relaxed max-w-[180px]">Ready to convert when your target coin price is reached.</p>
                </div>
              </div>
            </div>

            {pendingDeposits.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-display font-semibold text-rose-600 flex items-center gap-2">
                    <Clock className="w-6 h-6" /> Action Required
                  </h3>
                  <span className="px-3 py-1 bg-rose-100 text-rose-600 text-[11px] font-bold rounded-full uppercase tracking-widest">
                    {pendingDeposits.length} Pending
                  </span>
                </div>
                <div className="space-y-4">
                  {pendingDeposits.map(d => (
                    <div key={d.id} className="p-6 bg-rose-50/50 border border-rose-100 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:border-rose-200">
                      <div>
                         <p className="font-semibold text-rose-900 text-xl tracking-tight">{formatCurrency(d.amount, state.currency)} Recurring Deposit</p>
                         <p className="text-sm text-rose-700/70 mt-1 font-medium italic flex items-center gap-1.5">
                           <Calendar className="w-3.5 h-3.5" /> Due {format(parseISO(d.date), 'MMMM dd, yyyy')}
                         </p>
                      </div>
                      <div className="flex gap-3 w-full md:w-auto">
                         <button 
                            onClick={() => updateDepositStatus(d.id, 'completed')} 
                            className="flex-1 md:flex-none px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
                         >
                            <TrendingUp className="w-4 h-4" /> Deposit Now
                         </button>
                         <button 
                            onClick={() => updateDepositStatus(d.id, 'skipped')} 
                            className="flex-1 md:flex-none px-8 py-3 bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-2xl text-sm font-bold transition-all active:scale-95"
                         >
                            Skip
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {chartData.length > 1 && (
              <div className="pt-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-display font-semibold text-stone-900">Progress Timeline</h3>
                </div>
                <div className="h-[340px] w-full bg-stone-50/50 rounded-[24px] p-6 border border-stone-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                      <XAxis dataKey="date" tick={{fontSize: 11, fontWeight: 500, fill: '#78716c'}} tickLine={false} axisLine={false} dy={14} minTickGap={30} />
                      <YAxis tickFormatter={(val) => `$${val}`} tick={{fontSize: 11, fontWeight: 500, fill: '#78716c'}} tickLine={false} axisLine={false} dx={-14} />
                      <Tooltip 
                        cursor={{ stroke: '#stone-200', strokeWidth: 1, strokeDasharray: '4 4' }}
                        contentStyle={{ borderRadius: '16px', border: '1px solid #e7e5e4', padding: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)' }}
                        formatter={(val: number, name: string) => [formatCurrency(val, state.currency), name]}
                      />
                      <ReferenceLine y={goalAmount} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'top', value: 'TARGET', fill: '#10b981', fontSize: 10, fontWeight: 700 }} />
                      <Area type="monotone" stackId="1" dataKey="Cash" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCash)" />
                      <Area type="monotone" stackId="1" dataKey="Gold" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorGold)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="pt-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-display font-semibold text-stone-900 mb-5 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-stone-400" /> Recent Activity
                </h3>
                {historyDeps.length === 0 && invs.length === 0 ? (
                  <p className="text-sm text-stone-400 italic bg-stone-50/50 p-5 rounded-[20px] text-center">No activity recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {[
                      ...historyDeps.map(d => ({ ...d, _type: 'dep' })),
                      ...invs.map(i => ({ ...i, _type: 'inv' }))
                    ]
                    .sort((a, b) => compareAsc(parseISO(b.date), parseISO(a.date)))
                    .slice(0, 5)
                    .map((item: any) => (
                      <div key={item.id} className="group flex items-center justify-between p-4 border border-stone-100 rounded-[20px] bg-white shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-[14px] ${
                            item._type === 'dep' 
                              ? (item.status === 'skipped' ? 'bg-stone-100 text-stone-400' : 'bg-emerald-50 text-emerald-600') 
                              : 'bg-amber-50 text-amber-600'
                          }`}>
                            {item._type === 'dep' ? (item.status === 'skipped' ? <ArrowRightLeft className="w-4 h-4" /> : <Plus className="w-4 h-4" />) : <Coins className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${item.status === 'skipped' ? 'text-stone-400' : 'text-stone-900'}`}>
                              {item._type === 'dep' ? (item.status === 'skipped' ? 'Skipped Deposit' : 'Deposit') : 'Bought Gold'}
                              {item.isRecurring && <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${item.status === 'skipped' ? 'bg-stone-100 text-stone-400' : 'bg-emerald-100/50 text-emerald-700'}`}>Auto</span>}
                            </p>
                            <p className="text-xs text-stone-500 font-medium tracking-wide mt-0.5">{format(parseISO(item.date), 'MMM dd, yyyy')} {item.notes ? `• ${item.notes}` : ''}</p>
                          </div>
                        </div>
                        <p className={`font-semibold tracking-tight ${item.status === 'skipped' ? 'text-stone-300 line-through' : (item._type === 'dep' ? 'text-emerald-600' : 'text-stone-900')}`}>
                          {item._type === 'dep' ? (item.status === 'skipped' ? '' : '+') : '-'}{formatCurrency(item._type === 'dep' ? item.amount : item.quantity * item.purchasePricePerUnit, state.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-display font-semibold text-stone-900 mb-5 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-stone-400" /> Recurring Plans
                </h3>
                {recs.length === 0 ? (
                  <p className="text-sm text-stone-400 italic bg-stone-50/50 p-5 rounded-[20px] text-center">No active recurring deposits.</p>
                ) : (
                  <div className="space-y-3">
                    {recs.map((r) => (
                      <div key={r.id} className="p-5 border border-stone-100 rounded-[20px] bg-white shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-semibold text-stone-900 capitalize flex items-center gap-2">
                              {r.frequency} Deposit
                              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${r.isManual ? 'bg-amber-100/50 text-amber-700' : 'bg-emerald-100/50 text-emerald-700'}`}>
                                {r.isManual ? 'Manual' : 'Auto'}
                              </span>
                            </p>
                            <p className="text-xs text-stone-500 font-medium tracking-wide mt-1">Next: {format(parseISO(r.nextDate), 'MMM dd, yyyy')}</p>
                          </div>
                          <p className="font-semibold text-emerald-600 tracking-tight">+{formatCurrency(r.amount, state.currency)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="pt-8 mt-8 border-t border-red-100">
              {showConfirmDelete ? (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2">
                  <p className="text-sm text-red-800 font-medium mb-3">Are you sure you want to delete this beneficiary and all their tracked savings? This is permanent.</p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        deleteBeneficiary(id);
                        onBack();
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button 
                      onClick={() => setShowConfirmDelete(false)}
                      className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowConfirmDelete(true)}
                  className="text-sm font-medium flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                  <Trash2 className="w-4 h-4" /> Delete Beneficiary
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'deposit' && (
          <div className="mt-8 max-w-xl mx-auto animate-in fade-in duration-300">
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-4 text-emerald-800">
              <div className="p-2 bg-emerald-100 rounded-full mt-0.5">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold">Add Funds</h4>
                <p className="text-sm mt-1 opacity-90">Deposit cash that can later be converted into gold coins when the price target is met.</p>
              </div>
            </div>

            <form onSubmit={handleDeposit} className="space-y-5">
              {depType === 'once' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Input Mode</label>
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                      type="button"
                      onClick={() => setCalcMode('amount')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${calcMode === 'amount' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500'}`}
                    >
                      Deposit Amount
                    </button>
                    <button 
                      type="button"
                      onClick={() => setCalcMode('balance')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${calcMode === 'balance' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500'}`}
                    >
                      Current Bank Balance
                    </button>
                  </div>
                </div>
              )}

              {calcMode === 'amount' || depType === 'recurring' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({state.currency})</label>
                  <input 
                    type="number" 
                    autoFocus
                    required min="0.01" step="any"
                    value={depAmount} onChange={e => setDepAmount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-lg"
                    placeholder="500.00"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual Bank Account Balance ({state.currency})</label>
                  <input 
                    type="number" 
                    autoFocus
                    required step="any"
                    value={newBalance} onChange={e => setNewBalance(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-lg"
                    placeholder="e.g. 1500.00"
                  />
                  {newBalance && (
                    <div className={`mt-3 p-3 rounded-lg text-sm font-medium flex items-center justify-between ${parseFloat(newBalance) - totalCash > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      <span>Calculated Increase:</span>
                      <span className="font-bold">{formatCurrency(Math.max(0, parseFloat(newBalance) - totalCash), state.currency)}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deposit Type</label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex flex-col items-center justify-center p-4 border rounded-xl cursor-pointer transition-all ${depType === 'once' ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                    <input type="radio" name="type" className="hidden" checked={depType === 'once'} onChange={() => setDepType('once')} />
                    <span className="font-medium text-sm">One-Time Deposit</span>
                  </label>
                  <label className={`flex-1 flex flex-col items-center justify-center p-4 border rounded-xl cursor-pointer transition-all ${depType === 'recurring' ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                    <input type="radio" name="type" className="hidden" checked={depType === 'recurring'} onChange={() => setDepType('recurring')} />
                    <span className="font-medium text-sm">Recurring Setup</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({state.currency})</label>
                <input 
                  type="number" 
                  autoFocus
                  required min="0.01" step="any"
                  value={depAmount} onChange={e => setDepAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-lg"
                  placeholder="500.00"
                />
              </div>

              {depType === 'recurring' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select 
                      value={depFreq} onChange={e => setDepFreq(e.target.value as any)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Processing Mode</label>
                    <div className="flex gap-4">
                      <label className={`flex-1 flex flex-col items-center justify-center p-4 border rounded-xl cursor-pointer transition-all ${depMode === 'auto' ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                        <input type="radio" name="mode" className="hidden" checked={depMode === 'auto'} onChange={() => setDepMode('auto')} />
                        <span className="font-medium text-sm">Automatic</span>
                        <span className="text-xs text-center mt-1 opacity-80">Deposits added automatically on schedule</span>
                      </label>
                      <label className={`flex-1 flex flex-col items-center justify-center p-4 border rounded-xl cursor-pointer transition-all ${depMode === 'manual' ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                        <input type="radio" name="mode" className="hidden" checked={depMode === 'manual'} onChange={() => setDepMode('manual')} />
                        <span className="font-medium text-sm">Manual Setup</span>
                        <span className="text-xs text-center mt-1 opacity-80">Get reminded to confirm each deposit</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{depType === 'once' ? 'Deposit Date' : 'Start Date'}</label>
                <input 
                  type="date" 
                  required
                  value={depDate} onChange={e => setDepDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button type="submit" className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors shadow-sm text-lg">
                  {depType === 'once' ? (calcMode === 'balance' ? 'Set Balance & Add Difference' : 'Add Deposit') : 'Create Recurring Plan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'add_gold' && (
          <div className="mt-8 max-w-xl mx-auto animate-in fade-in duration-300">
            <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-4 text-amber-800">
              <div className="p-2 bg-amber-100 rounded-full mt-0.5">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold">Add External Gold</h4>
                <p className="text-sm mt-1 opacity-90">Log gold coins bought outside the app's tracked cash. This will not deduct from your tracked cash balance.</p>
              </div>
            </div>

            <form onSubmit={handleAddGold} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of 21K English Coins (fractions allowed)</label>
                <input 
                  type="number" 
                  autoFocus
                  required min="0.01" step="any"
                  value={goldAmount} onChange={e => setGoldAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-lg"
                  placeholder="e.g. 1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  required
                  value={goldDate} onChange={e => setGoldDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button type="submit" className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm text-lg">
                  Add Gold Investment
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'convert' && (
          <div className="mt-8 max-w-xl mx-auto animate-in fade-in duration-300">
            <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-4 text-amber-800">
              <div className="p-2 bg-amber-100 rounded-full mt-0.5">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold">Convert to 21K English Coin Value</h4>
                <p className="text-sm mt-1 opacity-90">Convert available cash into 21K English Coins at the current market price of <strong>{formatCurrency(state.currentGoldPricePerUnit, state.currency)}</strong> per coin.</p>
              </div>
            </div>

            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
              <span className="text-sm font-medium text-gray-500">Available Cash</span>
              <span className={`text-lg font-bold ${totalCash > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {formatCurrency(totalCash, state.currency)}
              </span>
            </div>

            <form onSubmit={handleConvert} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of 21K English Coins (fractions allowed)</label>
                <input 
                  type="number" 
                  autoFocus
                  required min="0.01" step="any"
                  value={convAmount} onChange={e => setConvAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-lg"
                  placeholder="e.g. 1"
                />
                
                {convAmount && !isNaN(parseFloat(convAmount)) && (
                  <p className={`text-sm mt-2 font-medium ${(parseFloat(convAmount) * state.currentGoldPricePerUnit) > totalCash ? 'text-red-500' : 'text-gray-500'}`}>
                    Required Cash: {formatCurrency(parseFloat(convAmount) * state.currentGoldPricePerUnit, state.currency)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Purchase</label>
                <input 
                  type="date" 
                  required
                  value={convDate} onChange={e => setConvDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors shadow-sm text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!!(convAmount && parseFloat(convAmount) * state.currentGoldPricePerUnit > totalCash)}
                >
                  Convert
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
