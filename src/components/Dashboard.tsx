import React, { useState } from 'react';
import { useStore } from '../store';
import { formatCurrency, getTotalGoal, getExpectedSavings } from '../lib/utils';
import { Plus, Target, Coins, TrendingUp, TrendingDown, Users, RefreshCw, Minus, Clock, ArrowRightLeft } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';

export function Dashboard({ onSelect }: { onSelect: (id: string) => void }) {
  const { state, addBeneficiary, syncGoldPrice, isSyncing } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  
  // New member form
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [monthlyTarget, setMonthlyTarget] = useState('200');
  const [targetAge, setTargetAge] = useState('18');
  const [initialCash, setInitialCash] = useState('');
  const [initialGold, setInitialGold] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const colors = ['bg-indigo-500', 'bg-rose-500', 'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    addBeneficiary({
      name,
      birthDate,
      monthlyTarget: parseFloat(monthlyTarget),
      targetAge: parseInt(targetAge, 10),
      avatarColor: randomColor
    }, parseFloat(initialCash) || 0, parseFloat(initialGold) || 0);
    
    setName('');
    setInitialCash('');
    setInitialGold('');
    setShowAdd(false);
  };

  // Calculate totals
  const getTotalCash = (beneficiaryId: string) => {
    const deps = state.deposits.filter(d => d.beneficiaryId === beneficiaryId && d.status === 'completed');
    const invs = state.goldInvestments.filter(i => i.beneficiaryId === beneficiaryId);
    const cashIn = deps.reduce((sum, d) => sum + d.amount, 0);
    const cashSpent = invs.filter(i => !i.isExternal).reduce((sum, i) => sum + (i.quantity * i.purchasePricePerUnit), 0);
    return Math.max(0, cashIn - cashSpent);
  };

  const getGoldCoins = (beneficiaryId: string) => {
    return state.goldInvestments.filter(i => i.beneficiaryId === beneficiaryId).reduce((sum, i) => sum + i.quantity, 0);
  };

  const getTotalValue = (beneficiaryId: string) => {
    const cash = getTotalCash(beneficiaryId);
    const coins = getGoldCoins(beneficiaryId);
    return cash + (coins * state.currentGoldPricePerUnit);
  };

  const pendingDepositsRaw = state.deposits.filter(d => d.status === 'pending');
  // Deduplicate: If multiple pending exist for same plan/day (e.g. legacy data), only show one
  const pendingDeposits = pendingDepositsRaw.filter((d, index, self) => 
    index === self.findIndex((t) => (
      (t.recurringId && t.recurringId === d.recurringId && format(parseISO(t.date), 'yyyy-MM-dd') === format(parseISO(d.date), 'yyyy-MM-dd')) ||
      (!t.recurringId && t.id === d.id)
    ))
  );

  // Gold trend logic
  const currentPrice = state.currentGoldPricePerUnit;
  const previousPrice = state.previousGoldPricePerUnit;
  
  const getTrend = () => {
    if (!previousPrice || currentPrice === previousPrice) return <Minus className="w-3.5 h-3.5 text-stone-400" />;
    if (currentPrice > previousPrice) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    return <TrendingDown className="w-3.5 h-3.5 text-rose-500" />;
  };

  const trendColor = !previousPrice || currentPrice === previousPrice 
    ? 'text-stone-500' 
    : currentPrice > previousPrice ? 'text-emerald-600' : 'text-rose-600';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-semibold tracking-tight text-stone-900">Dashboard</h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {state.currentGoldPricePerUnit ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-2xl border border-amber-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Syndicate 21K Gram:</span>
                      <span className="text-sm font-bold text-amber-700">{formatCurrency(state.currentGoldPricePerUnit / 8, state.currency)}</span>
                    </div>

                    <div className="w-px h-3 bg-amber-200 hidden sm:block" />

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">English Lira (8g):</span>
                      <span className="text-md font-black text-amber-900">{formatCurrency(state.currentGoldPricePerUnit, state.currency)}</span>
                    </div>

                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${currentPrice > (previousPrice || 0) ? 'bg-emerald-100/50' : 'bg-rose-100/50'} ${trendColor} text-[10px] font-black tracking-widest`}>
                      {getTrend()}
                      {previousPrice && currentPrice !== previousPrice && (
                        <span>{Math.abs(((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2)}%</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500 font-medium">Overview of your family's savings.</p>
            )}
            
            <button 
              onClick={() => syncGoldPrice()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full transition-all border ${
                isSyncing 
                  ? 'bg-stone-50 text-stone-400 border-stone-200 cursor-not-allowed' 
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:border-stone-300'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Price'}
            </button>
            
            {state.lastSyncedAt && (
              <p className="text-[10px] text-stone-400 font-medium uppercase tracking-tight">
                Last updated: {format(new Date(state.lastSyncedAt), 'HH:mm')}
              </p>
            )}
          </div>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white px-5 py-2.5 rounded-full font-medium transition-all text-sm shadow-sm hover:shadow active:scale-95 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Member
        </button>
      </div>

      {pendingDeposits.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-display font-semibold text-rose-600 flex items-center gap-2">
              <Clock className="w-6 h-6" /> Action Required
            </h3>
            <span className="px-3 py-1 bg-rose-100 text-rose-600 text-[11px] font-bold rounded-full uppercase tracking-widest">
              {pendingDeposits.length} Pending
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingDeposits.map(d => {
              const b = state.beneficiaries.find(bx => bx.id === d.beneficiaryId);
              return (
                <div key={d.id} 
                  onClick={() => onSelect(d.beneficiaryId)}
                  className="group p-5 bg-white border border-rose-100 hover:border-rose-300 rounded-3xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:shadow-md backdrop-blur-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-inner ${b?.avatarColor || 'bg-rose-500'}`}>
                      {b?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                       <p className="font-semibold text-stone-900 group-hover:text-rose-600 transition-colors">{b?.name}'s Savings</p>
                       <p className="text-sm font-bold text-rose-600 tracking-tight">{formatCurrency(d.amount, state.currency)} due {format(parseISO(d.date), 'MMM dd')}</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-rose-300 group-hover:text-rose-500 transform group-hover:translate-x-1 transition-all" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                  placeholder="e.g. Alice"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <input 
                  type="date"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Age (Years)</label>
                <input 
                  type="number"
                  min="1"
                  value={targetAge}
                  onChange={e => setTargetAge(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Goal ({state.currency})</label>
                <input 
                  type="number" 
                  min="0"
                  step="any"
                  value={monthlyTarget}
                  onChange={e => setMonthlyTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 border-t pt-4 border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Cash Balance ({state.currency})</label>
                <input 
                  type="number" 
                  min="0"
                  step="any"
                  value={initialCash}
                  onChange={e => setInitialCash(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-gray-50 bg-opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (21K English Coins)</label>
                <input 
                  type="number" 
                  min="0"
                  step="any"
                  value={initialGold}
                  onChange={e => setInitialGold(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-amber-50 bg-opacity-50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button 
                type="button" 
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {state.beneficiaries.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No beneficiaries yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">Start tracking family savings by adding a family member above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {state.beneficiaries.map((b) => {
            const value = getTotalValue(b.id);
            const goalAmount = getTotalGoal(b);
            const expected = getExpectedSavings(b);
            const coins = getGoldCoins(b.id);
            const cash = getTotalCash(b.id);
            const goldValue = coins * state.currentGoldPricePerUnit;
            
            const cashProgress = goalAmount > 0 ? (cash / goalAmount) * 100 : 0;
            const goldProgress = goalAmount > 0 ? (goldValue / goalAmount) * 100 : 0;
            const totalProgress = Math.min(100, cashProgress + goldProgress);
            
            const renderCashPct = totalProgress > 0 ? (cashProgress / (cashProgress + goldProgress)) * totalProgress : 0;
            const renderGoldPct = totalProgress > 0 ? (goldProgress / (cashProgress + goldProgress)) * totalProgress : 0;

            return (
              <div 
                key={b.id} 
                onClick={() => onSelect(b.id)}
                className="group bg-white rounded-[24px] p-6 shadow-sm border border-stone-200/60 hover:shadow-lg hover:border-amber-200/60 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold ${b.avatarColor} shadow-inner relative`}>
                    {b.name.charAt(0).toUpperCase()}
                    {pendingDeposits.some(d => d.beneficiaryId === b.id) && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 border-2 border-white ring-2 ring-rose-500/20 shadow-sm" title="Pending deposits" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-stone-900 text-xl group-hover:text-amber-600 transition-colors">{b.name}</h3>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5 font-medium tracking-wide">
                      <Target className="w-3.5 h-3.5" /> Goal: {formatCurrency(goalAmount, state.currency)}
                    </p>
                  </div>
                </div>

                <div className="space-y-5 flex-1 flex flex-col justify-end">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-xs font-medium text-stone-500 uppercase tracking-widest">Total Value</span>
                      <span className="text-2xl font-light tracking-tight text-stone-900">{formatCurrency(value, state.currency)}</span>
                    </div>
                    <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full bg-emerald-500 transition-all duration-1000 ease-out`}
                        style={{ width: `${renderCashPct}%` }}
                        title="Cash"
                      />
                      <div 
                        className={`h-full bg-amber-500 transition-all duration-1000 ease-out`}
                        style={{ width: `${renderGoldPct}%` }}
                        title="Gold"
                      />
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="text-xs text-rose-500 font-medium">
                         {expected > value && `⚠️ Need ${formatCurrency(expected - value, state.currency)}`}
                      </div>
                      <p className="text-[11px] text-right text-stone-400 font-bold tracking-wider">{(cashProgress + goldProgress).toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-stone-100">
                    <div className="bg-stone-50/50 p-3 rounded-2xl border border-stone-100/50">
                      <p className="text-[11px] text-stone-500 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wider">
                        <Coins className="w-3.5 h-3.5 text-amber-500" /> 8g Coins
                      </p>
                      <p className="font-medium text-stone-900">{coins.toFixed(2)}</p>
                    </div>
                    <div className="bg-stone-50/50 p-3 rounded-2xl border border-stone-100/50">
                      <p className="text-[11px] text-stone-500 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wider">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Cash
                      </p>
                      <p className="font-medium text-stone-900">{formatCurrency(cash, state.currency)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
