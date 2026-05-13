import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { isBefore, isSameDay, addWeeks, addMonths, addYears, parseISO, format } from 'date-fns';
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
import { onAuthStateChanged, getRedirectResult, User as FirebaseUser } from 'firebase/auth';
import { 
  db, 
  auth, 
  loginWithGoogle, 
  loginWithGoogleRedirect,
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { AppState, Beneficiary, Deposit, GoldInvestment, RecurringConfig, DEFAULT_STATE } from './types';

interface StoreContextType {
  state: AppState;
  user: FirebaseUser | null;
  authReady: boolean;
  loginError: string | null;
  setLoginError: (error: string | null) => void;
  addBeneficiary: (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => void;
  addDeposit: (d: Omit<Deposit, 'id'>) => void;
  updateDepositStatus: (id: string, status: 'pending' | 'completed' | 'skipped') => void;
  deleteDeposit: (id: string) => void;
  addRecurringConfig: (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => void;
  addGoldInvestment: (g: Omit<GoldInvestment, 'id'>) => void;
  updateGoldPrice: (price: number) => void;
  updateGoldSourceUrl: (url: string) => void;
  importData: (data: AppState) => void;
  deleteBeneficiary: (id: string) => void;
  login: () => Promise<any>;
  loginRedirect: () => Promise<any>;
  logout: () => void;
  syncGoldPrice: () => Promise<void>;
  isSyncing: boolean;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Auth Listener + Redirect Result
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Logged in via redirect:", result.user.email);
        }
      } catch (err: any) {
        console.error("Redirect Result Error:", err);
        setLoginError(err.code ? `${err.code}: ${err.message}` : err.message);
      }
    };
    handleRedirect();

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
          currentGoldPricePerUnit: data.lastGoldPrice || prev.currentGoldPricePerUnit,
          previousGoldPricePerUnit: data.previousGoldPrice || prev.previousGoldPricePerUnit,
          lastSyncedAt: data.lastSyncedAt || prev.lastSyncedAt,
          goldSourceUrl: data.goldSourceUrl || prev.goldSourceUrl
        }));
      } else {
        // Init user doc
        setDoc(userDocRef, {
          currency: 'JOD',
          goldSourceUrl: 'https://jjsjo.com/',
          lastGoldPrice: 840,
          updatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    const unsubBen = onSnapshot(benColRef, (snap) => {
      const beneficiaries = snap.docs.map(d => ({ ...d.data(), id: d.id } as Beneficiary));
      setState(prev => ({ ...prev, beneficiaries }));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/beneficiaries`));

    const unsubDep = onSnapshot(depColRef, (snap) => {
      const allDeposits = snap.docs.map(d => ({ ...d.data(), id: d.id } as Deposit));
      setState(prev => ({ ...prev, deposits: allDeposits }));
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

  // Process Recurring Deposits
  const processingRef = useRef(false);
  useEffect(() => {
    if (!user || state.recurringConfigs.length === 0 || processingRef.current) return;

    const processRecurring = async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      
      const now = new Date();
      const recentlyProcessed = new Set<string>();

      try {
        for (const config of state.recurringConfigs) {
          let currentNextDate = parseISO(config.nextDate);
          let finalNextDate = currentNextDate;
          let hasChange = false;
          
          // Process all missed occurrences for this config
          while (isBefore(currentNextDate, now) || isSameDay(currentNextDate, now)) {
            const dateStr = currentNextDate.toISOString();
            const dateKey = dateStr.replace(/[:.]/g, '-');
            const depId = `rec_${config.id}_${dateKey}`;
            
            // Local safety check
            if (recentlyProcessed.has(depId)) {
               break; 
            }

            // Database check - use date string formatting for robust "same day" comparison
            const currentDayStr = format(currentNextDate, 'yyyy-MM-dd');
            const alreadyExists = state.deposits.some(d => 
              d.id === depId || 
              (d.recurringId === config.id && format(parseISO(d.date), 'yyyy-MM-dd') === currentDayStr)
            );
            
            if (!alreadyExists) {
              console.log(`Processing recurring deposit for config ${config.id}, due ${dateStr}`);
              const depData: Omit<Deposit, 'id'> = {
                beneficiaryId: config.beneficiaryId,
                amount: config.amount,
                date: dateStr,
                isRecurring: true,
                recurringId: config.id,
                notes: `${config.frequency.charAt(0).toUpperCase() + config.frequency.slice(1)} Recurring`,
                status: config.isManual ? 'pending' : 'completed'
              };

              await setDoc(doc(db, 'users', user.uid, 'deposits', depId), {
                ...depData,
                id: depId,
                createdAt: serverTimestamp()
              });
              recentlyProcessed.add(depId);
            }

            // Advance loop date
            let nextOcc: Date;
            if (config.frequency === 'weekly') nextOcc = addWeeks(currentNextDate, 1);
            else if (config.frequency === 'monthly') nextOcc = addMonths(currentNextDate, 1);
            else nextOcc = addYears(currentNextDate, 1);

            currentNextDate = nextOcc;
            finalNextDate = nextOcc;
            hasChange = true;
          }

          // Singular update per config
          if (hasChange && finalNextDate.toISOString() !== config.nextDate) {
            await updateDoc(doc(db, 'users', user.uid, 'recurringConfigs', config.id), {
              nextDate: finalNextDate.toISOString()
            });
          }
        }
      } catch (err) {
        console.error("Failed to process recurring deposit:", err);
      } finally {
        processingRef.current = false;
      }
    };

    processRecurring();
  }, [user, state.recurringConfigs, state.deposits]);

  // Fetch real gold price
  const syncGoldPrice = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    try {
      const targetUrl = state.goldSourceUrl || 'https://jjsjo.com/';
      
      // 1. Try our Express backend first (works in AI Studio and Docker)
      try {
        const goldResponse = await fetch('/api/gold-price' + (state.goldSourceUrl ? `?url=${encodeURIComponent(state.goldSourceUrl)}&t=${Date.now()}` : `?t=${Date.now()}`));
        if (goldResponse.ok) {
          const goldData = await goldResponse.json();
          if (goldData?.price) {
            await updateGoldPrice(goldData.price);
            return;
          }
        }
      } catch (e) {
        console.log('Backend /api/gold-price fetch failed, falling back to allorigins...', e);
      }

      // 2. Fallback for Static Deployments (GitHub Pages) via AllOrigins proxy
      console.log('Using AllOrigins CORS proxy for static site fallback...');
      const fallbackResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`);
      
      if (!fallbackResponse.ok) {
         throw new Error(`Fallback proxy failed: ${fallbackResponse.statusText}`);
      }
      
      const fallbackData = await fallbackResponse.json();
      const html = fallbackData.contents;
      
      // Scrape HTML
      const match21k = html.match(/21 K\s*<\/td>\s*<td>([\d.]+)<\/td>/i);
      if (match21k && match21k[1]) {
         const localGramPrice21kJod = parseFloat(match21k[1]);
         if (!isNaN(localGramPrice21kJod)) {
            const finalCoinPriceJod = localGramPrice21kJod * 8;
            await updateGoldPrice(finalCoinPriceJod);
            return;
         }
      }
      
      throw new Error("Failed to extract price using fallback proxy.");
    } catch (error) {
      console.error("Could not fetch real gold price:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (user) {
      syncGoldPrice();
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

  const updateDepositStatus = async (id: string, status: 'pending' | 'completed' | 'skipped') => {
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
      const updates: any = {
        lastGoldPrice: price,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      };
      
      // Store previous price if it's different to show trend
      if (state.currentGoldPricePerUnit !== price) {
        updates.previousGoldPrice = state.currentGoldPricePerUnit;
      }

      await updateDoc(doc(db, path), updates);
    } catch (err) {
      // Don't throw if just background update
      console.warn("Could not update gold price in Firestore:", err);
    }
  };

  const updateGoldSourceUrl = async (url: string) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, path), {
        goldSourceUrl: url,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
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
      state, user, authReady, loginError, setLoginError,
      addBeneficiary, addDeposit, updateDepositStatus, deleteDeposit, 
      addRecurringConfig, addGoldInvestment, updateGoldPrice, updateGoldSourceUrl, importData, deleteBeneficiary,
      syncGoldPrice, isSyncing,
      login: async () => {
        return loginWithGoogle();
      },
      loginRedirect: async () => {
        return loginWithGoogleRedirect();
      },
      logout
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
