import React, { createContext, useContext, useEffect, useState } from 'react';
import { isBefore, isSameDay, addWeeks, addMonths, addYears, parseISO } from 'date-fns';
import { AppState, Beneficiary, Deposit, GoldInvestment, RecurringConfig, DEFAULT_STATE } from './types';

interface StoreContextType {
  state: AppState;
  addBeneficiary: (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => void;
  addDeposit: (d: Omit<Deposit, 'id'>) => void;
  updateDepositStatus: (id: string, status: 'pending' | 'completed') => void;
  deleteDeposit: (id: string) => void;
  addRecurringConfig: (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => void;
  addGoldInvestment: (g: Omit<GoldInvestment, 'id'>) => void;
  updateGoldPrice: (price: number) => void;
  importData: (data: AppState) => void;
  deleteBeneficiary: (id: string) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

const STORAGE_KEY = 'family_gold_savings_v1';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : DEFAULT_STATE;
    // Force currency to JOD if we just migrated from USD
    if (parsed.currency === 'USD') {
      parsed.currency = 'JOD';
    }
    return parsed;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Fetch real gold price
  useEffect(() => {
    async function fetchGoldPrice() {
      try {
        const response = await fetch('/api/gold-price');
        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            setState(prev => ({ 
              ...prev, 
              currentGoldPricePerUnit: data.price,
              ...(data.currency ? { currency: data.currency } : {})
            }));
          }
        }
      } catch (error) {
        console.error("Could not fetch real gold price:", error);
      }
    }
    
    fetchGoldPrice();
    // Poll every 15 minutes
    const interval = setInterval(fetchGoldPrice, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Process recurring deposits
  useEffect(() => {
    const now = new Date();
    let updatedNeeded = false;
    let newDeposits: Deposit[] = [];
    let updatedConfigs = [...state.recurringConfigs];

    updatedConfigs = updatedConfigs.map(config => {
      let nextDatePath = parseISO(config.nextDate);
      let localConfigUpdated = false;
      let iterations = 0;

      while ((isBefore(nextDatePath, now) || isSameDay(nextDatePath, now)) && iterations < 100) {
        newDeposits.push({
          id: crypto.randomUUID(),
          beneficiaryId: config.beneficiaryId,
          amount: config.amount,
          date: nextDatePath.toISOString(),
          isRecurring: true,
          recurringId: config.id,
          notes: config.isManual ? 'Manual recurring deposit' : 'Auto recurring deposit',
          status: config.isManual ? 'pending' : 'completed',
        });

        if (config.frequency === 'weekly') {
          nextDatePath = addWeeks(nextDatePath, 1);
        } else if (config.frequency === 'monthly') {
          nextDatePath = addMonths(nextDatePath, 1);
        } else if (config.frequency === 'yearly') {
          nextDatePath = addYears(nextDatePath, 1);
        }
        localConfigUpdated = true;
        iterations++;
      }

      if (localConfigUpdated) {
        updatedNeeded = true;
        return { ...config, nextDate: nextDatePath.toISOString() };
      }
      return config;
    });

    if (updatedNeeded) {
      setState(prev => ({
        ...prev,
        deposits: [...prev.deposits, ...newDeposits],
        recurringConfigs: updatedConfigs,
      }));
    }
  }, [state.recurringConfigs]);

  const addBeneficiary = (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    setState(prev => {
      const newState = {
        ...prev,
        beneficiaries: [...prev.beneficiaries, { ...b, id }]
      };
      
      if (initialCash && initialCash > 0) {
        newState.deposits = [...newState.deposits, {
          id: crypto.randomUUID(),
          beneficiaryId: id,
          amount: initialCash,
          date: now,
          isRecurring: false,
          notes: 'Opening Cash Balance'
        }];
      }
      
      if (initialGold && initialGold > 0) {
        newState.goldInvestments = [...newState.goldInvestments, {
          id: crypto.randomUUID(),
          beneficiaryId: id,
          quantity: initialGold,
          purchasePricePerUnit: prev.currentGoldPricePerUnit,
          date: now,
          isExternal: true
        }];
      }
      
      return newState;
    });
  };

  const addDeposit = (d: Omit<Deposit, 'id'>) => {
    setState(prev => ({
      ...prev,
      deposits: [...prev.deposits, { ...d, id: crypto.randomUUID(), status: d.status || 'completed' }]
    }));
  };

  const updateDepositStatus = (id: string, status: 'pending' | 'completed') => {
    setState(prev => ({
      ...prev,
      deposits: prev.deposits.map(d => d.id === id ? { ...d, status } : d)
    }));
  };

  const deleteDeposit = (id: string) => {
    setState(prev => ({
      ...prev,
      deposits: prev.deposits.filter(d => d.id !== id)
    }));
  };

  const addRecurringConfig = (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => {
    setState(prev => ({
      ...prev,
      recurringConfigs: [...prev.recurringConfigs, { 
        ...r, 
        id: crypto.randomUUID(),
        nextDate: r.startDate 
      }]
    }));
  };

  const addGoldInvestment = (g: Omit<GoldInvestment, 'id'>) => {
    setState(prev => ({
      ...prev,
      goldInvestments: [...prev.goldInvestments, { ...g, id: crypto.randomUUID() }]
    }));
  };

  const updateGoldPrice = (price: number) => {
    setState(prev => ({ ...prev, currentGoldPricePerUnit: price }));
  };

  const importData = (data: AppState) => {
    setState(data);
  };
  
  const deleteBeneficiary = (id: string) => {
    setState(prev => ({
      ...prev,
      beneficiaries: prev.beneficiaries.filter(b => b.id !== id),
      deposits: prev.deposits.filter(d => d.beneficiaryId !== id),
      recurringConfigs: prev.recurringConfigs.filter(r => r.beneficiaryId !== id),
      goldInvestments: prev.goldInvestments.filter(g => g.beneficiaryId !== id)
    }));
  };

  return (
    <StoreContext.Provider value={{
      state, addBeneficiary, addDeposit, updateDepositStatus, deleteDeposit, addRecurringConfig, 
      addGoldInvestment, updateGoldPrice, importData, deleteBeneficiary
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
