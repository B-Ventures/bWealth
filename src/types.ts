export type Beneficiary = {
  id: string;
  name: string;
  avatarColor: string;
  goalAmount?: number; // legacy
  birthDate?: string;
  monthlyTarget?: number;
  targetAge?: number;
};

export type Deposit = {
  id: string;
  beneficiaryId: string;
  amount: number;
  date: string; // ISO string
  isRecurring: boolean;
  recurringId?: string;
  notes?: string;
  status?: 'pending' | 'completed' | 'skipped';
};

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export type RecurringConfig = {
  id: string;
  beneficiaryId: string;
  amount: number;
  frequency: RecurringFrequency;
  startDate: string;
  nextDate: string;
  isManual?: boolean;
};

export type GoldInvestment = {
  id: string;
  beneficiaryId: string;
  quantity: number; 
  purchasePricePerUnit: number;
  date: string;
  isExternal?: boolean;
};

export type AppState = {
  beneficiaries: Beneficiary[];
  deposits: Deposit[];
  recurringConfigs: RecurringConfig[];
  goldInvestments: GoldInvestment[];
  currentGoldPricePerUnit: number;
  previousGoldPricePerUnit?: number;
  lastSyncedAt?: string;
  goldPriceCountry: string;
  currency: string;
};

export const DEFAULT_STATE: AppState = {
  beneficiaries: [],
  deposits: [],
  recurringConfigs: [],
  goldInvestments: [],
  currentGoldPricePerUnit: 840,
  goldPriceCountry: 'JO',
  currency: 'JOD',
};
