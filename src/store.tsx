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
  getDocFromServer,
  writeBatch,
  getDocs,
  getDoc
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
import { CountryConfig, COUNTRY_CONFIGS, DEFAULT_COUNTRY, spotUsdToCoin } from './goldCountries';

interface StoreContextType {
  state: AppState;
  user: FirebaseUser | null;
  authReady: boolean;
  loginError: string | null;
  setLoginError: (error: string | null) => void;
  availableCountries: Record<string, CountryConfig>;
  addBeneficiary: (b: Omit<Beneficiary, 'id'>, initialCash?: number, initialGold?: number) => void;
  addDeposit: (d: Omit<Deposit, 'id'>) => void;
  updateDepositStatus: (id: string, status: 'pending' | 'completed' | 'skipped') => void;
  deleteDeposit: (id: string) => void;
  addRecurringConfig: (r: Omit<RecurringConfig, 'id' | 'nextDate'>) => void;
  addGoldInvestment: (g: Omit<GoldInvestment, 'id'>) => void;
  updateGoldPrice: (price: number) => void;
  updateGoldPriceCountry: (countryCode: string) => Promise<void>;
  deleteBeneficiary: (id: string) => void;
  login: () => Promise<any>;
  loginRedirect: () => Promise<any>;
  logout: () => void;
  syncGoldPrice: () => Promise<void>;
  isSyncing: boolean;
  syncError: string | null;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [availableCountries, setAvailableCountries] = useState<Record<string, CountryConfig>>(COUNTRY_CONFIGS);

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

  // Load country configs from Firestore (falls back to hardcoded if collection is empty)
  useEffect(() => {
    getDocs(collection(db, 'goldCountries'))
      .then(snap => {
        if (snap.empty) return;
        const fromDb: Record<string, CountryConfig> = {};
        snap.docs.forEach(d => { fromDb[d.id] = d.data() as CountryConfig; });
        setAvailableCountries(fromDb);
      })
      .catch(err => console.warn('Could not load goldCountries from Firestore, using defaults:', err));
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
          goldPriceCountry: data.goldPriceCountry || prev.goldPriceCountry,
        }));
      } else {
        // Init user doc
        setDoc(userDocRef, {
          currency: 'JOD',
          goldPriceCountry: DEFAULT_COUNTRY,
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

  const applySpotToPrice = async (spotUsd: number) => {
    const countryCode = state.goldPriceCountry || DEFAULT_COUNTRY;
    const countryConfig = availableCountries[countryCode] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
    const { coin } = spotUsdToCoin(spotUsd, countryCode);
    // Keep currency in sync with selected country
    if (countryConfig.currency !== state.currency) {
      await updateDoc(doc(db, 'users', user!.uid), { currency: countryConfig.currency, updatedAt: serverTimestamp() });
    }
    await updateGoldPrice(coin);
  };

  const GOLDAPI_URL = 'https://www.goldapi.io/api/XAU/USD';
  const MAX_PRICE_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

  const syncGoldPrice = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      // 1. Firestore goldPrice/latest — written by scheduled GitHub Actions job (no CORS, no client key)
      try {
        const priceSnap = await getDoc(doc(db, 'goldPrice', 'latest'));
        if (priceSnap.exists()) {
          const d = priceSnap.data();
          const spotUsd: number = d?.spotUsd;
          const ts: string = d?.timestamp;
          const ageMs = ts ? Date.now() - new Date(ts).getTime() : Infinity;
          if (typeof spotUsd === 'number' && spotUsd > 0 && ageMs < MAX_PRICE_AGE_MS) {
            await applySpotToPrice(spotUsd);
            return;
          }
          if (ageMs >= MAX_PRICE_AGE_MS) console.warn(`goldPrice/latest is stale (${Math.round(ageMs / 60000)}min old)`);
        } else {
          console.warn('goldPrice/latest document does not exist in Firestore.');
        }
      } catch (e: any) {
        console.error('Firestore goldPrice/latest read failed:', e?.code ?? e?.message ?? e);
      }

      // 2. Express backend (Docker/local deployment)
      try {
        const res = await fetch(`/api/gold-price?t=${Date.now()}`);
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          const data = await res.json();
          if (typeof data?.spotUsd === 'number' && data.spotUsd > 0) {
            await applySpotToPrice(data.spotUsd);
            return;
          }
        }
      } catch (e) {
        console.log('Backend /api/gold-price unavailable:', e);
      }

      // 3. goldapi.io direct — works if CORS allowed and VITE_GOLD_API_KEY is set at build time
      const clientKey = import.meta.env.VITE_GOLD_API_KEY as string | undefined;
      if (clientKey) {
        const gaRes = await fetch(GOLDAPI_URL, {
          headers: { 'x-access-token': clientKey, 'Content-Type': 'application/json' }
        });
        if (gaRes.ok) {
          const gaData = await gaRes.json();
          const spotUsd: number = (gaData as any)?.price;
          if (typeof spotUsd === 'number' && spotUsd > 0) {
            await applySpotToPrice(spotUsd);
            return;
          }
        }
      }

      throw new Error('Price data unavailable or stale. Check GitHub Actions workflow.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown sync error.';
      console.error('Could not fetch gold spot price:', error);
      setSyncError(msg);
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

  const updateGoldPriceCountry = async (countryCode: string) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      const config = availableCountries[countryCode] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
      await updateDoc(doc(db, path), {
        goldPriceCountry: countryCode,
        currency: config.currency,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const deleteBeneficiary = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/beneficiaries/${id}`;
    try {
      const batch = writeBatch(db);

      batch.delete(doc(db, path));

      state.deposits
        .filter(d => d.beneficiaryId === id)
        .forEach(d => batch.delete(doc(db, `users/${user.uid}/deposits/${d.id}`)));

      state.recurringConfigs
        .filter(r => r.beneficiaryId === id)
        .forEach(r => batch.delete(doc(db, `users/${user.uid}/recurringConfigs/${r.id}`)));

      state.goldInvestments
        .filter(g => g.beneficiaryId === id)
        .forEach(g => batch.delete(doc(db, `users/${user.uid}/goldInvestments/${g.id}`)));

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <StoreContext.Provider value={{
      state, user, authReady, loginError, setLoginError,
      availableCountries,
      addBeneficiary, addDeposit, updateDepositStatus, deleteDeposit,
      addRecurringConfig, addGoldInvestment, updateGoldPrice, updateGoldPriceCountry, deleteBeneficiary,
      syncGoldPrice, isSyncing, syncError,
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
