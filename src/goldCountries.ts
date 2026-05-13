export type CountryConfig = {
  name: string;
  flag: string;
  currency: string;
  usdRate: number;  // local currency units per 1 USD (official/pegged rate)
  premium: number;  // multiplier above international spot (empirically derived from local souk prices)
};

// Premium factors derived from live 21K gram sell prices vs metals.live spot on May 13 2026.
// Formula: local_price / ((spot_USD / 31.1035) × (21/24) × usdRate)
// Sources: goldtrade.ae, MOCI Kuwait, bahraingoldprice.com, qatargoldprice.com,
//          goldpricez.com (Oman/Egypt/Lebanon/Iraq), xau.today (Morocco), goldrate24.com
export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  // Jordan — reference country; premium verified against royanews.tv live data
  JO: { name: 'Jordan',       flag: '🇯🇴', currency: 'JOD', usdRate: 0.7092,   premium: 1.021 },

  // UAE — Dubai Gold Souk official rate; no VAT on gold metal content (5% VAT on making charges only)
  AE: { name: 'UAE',          flag: '🇦🇪', currency: 'AED', usdRate: 3.6725,   premium: 1.038 },

  // Saudi Arabia — includes 15% VAT (applied to all gold items since July 2020 per ZATCA)
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR', usdRate: 3.7500,   premium: 1.153 },

  // Kuwait — MOCI (Ministry of Commerce) official reference price; no VAT in Kuwait
  KW: { name: 'Kuwait',       flag: '🇰🇼', currency: 'KWD', usdRate: 0.3083,   premium: 1.092 },

  // Bahrain — zero-rated under 10% VAT regime; trades near spot through GCC customs area
  BH: { name: 'Bahrain',      flag: '🇧🇭', currency: 'BHD', usdRate: 0.3760,   premium: 0.988 },

  // Qatar — no VAT implemented; Doha Gold Souq tracks spot with minimal markup
  QA: { name: 'Qatar',        flag: '🇶🇦', currency: 'QAR', usdRate: 3.6400,   premium: 0.985 },

  // Oman — 5% VAT on making charges only (gold content zero-rated); slight discount to Dubai
  OM: { name: 'Oman',         flag: '🇴🇲', currency: 'OMR', usdRate: 0.3845,   premium: 0.973 },

  // Egypt — effectively spot passthrough since 2024 EGP float; 14% VAT on making charges only
  EG: { name: 'Egypt',        flag: '🇪🇬', currency: 'EGP', usdRate: 52.935,   premium: 1.001 },

  // Lebanon — gold market is USD-denominated; ~2.9% premium (political risk margin)
  LB: { name: 'Lebanon',      flag: '🇱🇧', currency: 'USD', usdRate: 1.0000,   premium: 1.029 },

  // Iraq — official CBI rate basis; note: parallel market ~1,532 IQD/USD gives different picture
  IQ: { name: 'Iraq',         flag: '🇮🇶', currency: 'IQD', usdRate: 1310.52,  premium: 0.987 },

  // Morocco — managed float; 20% VAT on jewelry but quoted prices appear to be metal-only
  MA: { name: 'Morocco',      flag: '🇲🇦', currency: 'MAD', usdRate: 9.13,     premium: 1.017 },

  // Tunisia — managed float; 19% VAT + import controls (state-channelled gold imports)
  TN: { name: 'Tunisia',      flag: '🇹🇳', currency: 'TND', usdRate: 2.88,     premium: 1.016 },

  // Palestine — West Bank uses JOD; same syndicate pricing as Jordan
  PS: { name: 'Palestine',    flag: '🇵🇸', currency: 'JOD', usdRate: 0.7092,   premium: 1.021 },
};

export const DEFAULT_COUNTRY = 'JO';

// Returns the 8g English Pound coin price in the country's local currency.
export function spotUsdToCoin(spotUsd: number, countryCode: string): { gram21k: number; coin: number } {
  const config = COUNTRY_CONFIGS[countryCode] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
  const gram21k = (spotUsd / 31.1035) * (21 / 24) * config.usdRate * config.premium;
  return { gram21k, coin: gram21k * 8 };
}
