import React, { createContext, useContext, useEffect, useState } from 'react';
import { isBefore, isSameDay, addWeeks, addMonths, addYears, parseISO } from 'date-fns';
import { 
  onSnapshot, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  updateDoc,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  db, 
  auth, 
  loginWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { AppState, Beneficiary, Deposit, GoldInvestment, RecurringConfig, DEFAULT_STATE } from './types';

interface StoreContextType {
  state: AppState;
  user: FirebaseUser | null;
  authReady: boolean;
  addBeneficiary: (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => void;
  addDeposit: (d: Omit<Deposit, 'id'>) => void;
  updateDepositStatus: (id: string, status: 'pending' | 'completed') => void;
  deleteDeposit: (id: string) => void;
  addRecurringConfig: (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => void;
  addGoldInvestment: (g: Omit<GoldInvestment, 'id'>) => void;
  updateGoldPrice: (price: number) => void;
  importData: (data: AppState) => void;
  deleteBeneficiary: (id: string) => void;
  login: () => void;
  logout: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [state, setState] = useState<AppState>(DEFAULT_STATE);

  // Validate Connection to Firestore (as required by instructions)
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  // Sync with Firestore
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const benColRef = collection(db, 'users', user.uid, 'beneficiaries');
    const depColRef = collection(db, 'users', user.uid, 'deposits');
    const recColRef = collection(db, 'users', user.uid, 'recurringConfigs');
    const goldColRef = collection(db, 'users', user.uid, 'goldInvestments');

    const unsubUser = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setState(prev => ({
          ...prev,
          currency: data.currency || prev.currency,
          currentGoldPricePerUnit: data.lastGoldPrice || prev.currentGoldPricePerUnit
        }));
      } else {
        // Init user doc
        setDoc(userDocRef, {
          currency: 'JOD',
          updatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    const unsubBen = onSnapshot(benColRef, (snap) => {
      const beneficiaries = snap.docs.map(d => ({ ...d.data(), id: d.id } as Beneficiary));
      setState(prev => ({ ...prev, beneficiaries }));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/beneficiaries`));

    const unsubDep = onSnapshot(depColRef, (snap) => {
      const deposits = snap.docs.map(d => ({ ...d.data(), id: d.id } as Deposit));
      setState(prev => ({ ...prev, deposits }));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/deposits`));

    const unsubRec = onSnapshot(recColRef, (snap) => {
      const recurringConfigs = snap.docs.map(d => ({ ...d.data(), id: d.id } as RecurringConfig));
      setState(prev => ({ ...prev, recurringConfigs }));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/recurringConfigs`));

    const unsubGold = onSnapshot(goldColRef, (snap) => {
      const goldInvestments = snap.docs.map(d => ({ ...d.data(), id: d.id } as GoldInvestment));
      setState(prev => ({ ...prev, goldInvestments }));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/goldInvestments`));

    return () => {
      unsubUser();
      unsubBen();
      unsubDep();
      unsubRec();
      unsubGold();
    };
  }, [user]);

  // Fetch real gold price
  useEffect(() => {
    async function fetchGoldPrice() {
      try {
        // Since we are moving to GitHub Pages, we can't use our own /api/gold-price backend.
        // We attempt to fetch directly. Note: Many finance APIs have CORS restrictions.
        // If Yahoo fails, we can try a fallback or just use the last stored price.
        
        // 1. Fetch USD to JOD exchange rate (usually CORS-friendly)
        const fxResponse = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!fxResponse.ok) throw new Error(`FX fetch failed: ${fxResponse.statusText}`);
        const fxData = await fxResponse.json();
        const usdToJod = fxData?.rates?.JOD;
        if (!usdToJod) throw new Error('Invalid FX data');

        // 2. Fetch Gold Spot Price (USD / Troy Ounce)
        // We'll try a CORS-friendly public API if possible, or stay with Yahoo and handle errors.
        // For demonstration/migration, we'll use a reliable public data source if Yahoo blocks browser.
        const goldResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F', {
          // Browser fetch to Yahoo usually gets BLOCKED by CORS.
          // In a real production static app, you'd use a service like GoldAPI.io (requires key)
          // or a Firebase Cloud Function for proxying.
        });

        if (goldResponse.ok) {
          const goldData = await goldResponse.json();
          const priceOzUsd = goldData?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (priceOzUsd) {
            const pricePerGramUsd = priceOzUsd / 31.1034768;
            const pricePerGram21kUsd = pricePerGramUsd * (21 / 24);
            const price8g21kUsd = pricePerGram21kUsd * 8;
            const price8g21kJod = price8g21kUsd * usdToJod;
            updateGoldPrice(price8g21kJod);
          }
        } else {
           // Fallback/Warning: If this fails in the browser, it confirms CORS is an issue.
           // In such case, the user will rely on manual updates or the last price from Firestore.
           console.warn("Direct Yahoo Finance fetch blocked by CORS. Consider using a dedicated gold price API key.");
        }
      } catch (error) {
        console.error("Could not fetch real gold price client-side:", error);
      }
    }
    
    if (user) {
      fetchGoldPrice();
      const interval = setInterval(fetchGoldPrice, 30 * 60 * 1000); // 30 mins
      return () => clearInterval(interval);
    }
  }, [user]);

  const addBeneficiary = async (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => {
    if (!user) return;
    const path = `users/${user.uid}/beneficiaries`;
    try {
      const id = crypto.randomUUID();
      const benRef = doc(db, 'users', user.uid, 'beneficiaries', id);
      await setDoc(benRef, {
        ...b,
        createdAt: serverTimestamp()
      });

      if (initialCash && initialCash > 0) {
        const depId = crypto.randomUUID();
        await setDoc(doc(db, 'users', user.uid, 'deposits', depId), {
          beneficiaryId: id,
          amount: initialCash,
          date: new Date().toISOString(),
          isRecurring: false,
          notes: 'Opening Cash Balance',
          status: 'completed',
          createdAt: serverTimestamp()
        });
      }

      if (initialGold && initialGold > 0) {
        const goldId = crypto.randomUUID();
        await setDoc(doc(db, 'users', user.uid, 'goldInvestments', goldId), {
          beneficiaryId: id,
          quantity: initialGold,
          purchasePricePerUnit: state.currentGoldPricePerUnit,
          date: new Date().toISOString(),
          isExternal: true,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const addDeposit = async (d: Omit<Deposit, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/deposits`;
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, path, id), {
        ...d,
        id, // keep it for local mapping if needed but usually doc ID is enough
        status: d.status || 'completed',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateDepositStatus = async (id: string, status: 'pending' | 'completed') => {
    if (!user) return;
    const path = `users/${user.uid}/deposits/${id}`;
    try {
      await updateDoc(doc(db, path), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const deleteDeposit = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/deposits/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addRecurringConfig = async (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => {
    if (!user) return;
    const path = `users/${user.uid}/recurringConfigs`;
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, path, id), {
        ...r,
        nextDate: r.startDate,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const addGoldInvestment = async (g: Omit<GoldInvestment, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/goldInvestments`;
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, path, id), {
        ...g,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateGoldPrice = async (price: number) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, path), { 
        lastGoldPrice: price,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      // Don't throw if just background update
      console.warn("Could not update gold price in Firestore:", err);
    }
  };

  const importData = async (data: AppState) => {
    // Migration logic could go here, but for now just console it
    console.log("Import not implemented for Firestore yet");
  };
  
  const deleteBeneficiary = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/beneficiaries/${id}`;
    try {
      await deleteDoc(doc(db, path));
      // Cleanup related (could be done via rules or cloud functions, but we do it manually here)
      // Note: In rules we can't delete related. Client should handle or we use batch.
      const depsToDelete = state.deposits.filter(d => d.beneficiaryId === id);
      const recsToDelete = state.recurringConfigs.filter(r => r.beneficiaryId === id);
      const goldsToDelete = state.goldInvestments.filter(g => g.beneficiaryId === id);

      for (const d of depsToDelete) await deleteDoc(doc(db, `users/${user.uid}/deposits/${d.id}`));
      for (const r of recsToDelete) await deleteDoc(doc(db, `users/${user.uid}/recurringConfigs/${r.id}`));
      for (const g of goldsToDelete) await deleteDoc(doc(db, `users/${user.uid}/goldInvestments/${g.id}`));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <StoreContext.Provider value={{
      state, user, authReady, addBeneficiary, addDeposit, updateDepositStatus, deleteDeposit, 
      addRecurringConfig, addGoldInvestment, updateGoldPrice, importData, deleteBeneficiary,
      login: loginWithGoogle, logout
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
