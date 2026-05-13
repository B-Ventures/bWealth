export type CountryConfig = {
  name: string;
  flag: string;
  currency: string;
  usdRate: number;  // local currency units per 1 USD
  premium: number;  // multiplier above international spot (dealer sell-side markup)
};

// usdRate sources: official pegs for GCC currencies, approximate for EGP.
// premium for Jordan (JO) is empirically derived from royanews.tv vs metals.live spot.
// GCC premiums are approximate (~1%) and may be tuned once local data is available.
export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  JO: { name: 'Jordan',        flag: '🇯🇴', currency: 'JOD', usdRate: 0.7092, premium: 1.021 },
  AE: { name: 'UAE',           flag: '🇦🇪', currency: 'AED', usdRate: 3.6725, premium: 1.010 },
  SA: { name: 'Saudi Arabia',  flag: '🇸🇦', currency: 'SAR', usdRate: 3.7500, premium: 1.010 },
  KW: { name: 'Kuwait',        flag: '🇰🇼', currency: 'KWD', usdRate: 0.3077, premium: 1.010 },
  BH: { name: 'Bahrain',       flag: '🇧🇭', currency: 'BHD', usdRate: 0.3760, premium: 1.010 },
  QA: { name: 'Qatar',         flag: '🇶🇦', currency: 'QAR', usdRate: 3.6400, premium: 1.010 },
  OM: { name: 'Oman',          flag: '🇴🇲', currency: 'OMR', usdRate: 0.3845, premium: 1.010 },
  EG: { name: 'Egypt',         flag: '🇪🇬', currency: 'EGP', usdRate: 50.90,  premium: 1.050 },
};

export const DEFAULT_COUNTRY = 'JO';

// Returns the 8g English Pound coin price in the country's local currency.
export function spotUsdToCoin(spotUsd: number, countryCode: string): { gram21k: number; coin: number } {
  const config = COUNTRY_CONFIGS[countryCode] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
  const gram21k = (spotUsd / 31.1035) * (21 / 24) * config.usdRate * config.premium;
  return { gram21k, coin: gram21k * 8 };
}
