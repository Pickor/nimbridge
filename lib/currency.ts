/**
 * Currency formatting and EUR-anchored conversion.
 *
 * Catawiki always quotes lots in EUR; this module converts to the user's
 * preferred display currency (set in /settings, stored in user_settings).
 *
 * Rates are fixed constants — accuracy is not critical (the dashboard is
 * informational, not transactional). Update EUR_RATES when they drift
 * meaningfully (~5%+).
 */

// Fixed EUR exchange rates — update periodically
export const EUR_RATES: Record<string, number> = {
  EUR: 1.0,
  SEK: 10.9,
  USD: 1.10,
  GBP: 0.86,
};

export const CURRENCIES = ["EUR", "SEK", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  EUR: "Euro (€)",
  SEK: "Swedish Krona (kr)",
  USD: "US Dollar ($)",
  GBP: "British Pound (£)",
};

/** Convert a EUR amount to the user's currency and format it. */
export function fAmount(eur: number | null, currency: string): string {
  if (eur === null) return "—";
  const rate = EUR_RATES[currency] ?? EUR_RATES.SEK;
  const value = Math.round(eur * rate);
  const fmt = value.toLocaleString("sv-SE");
  switch (currency) {
    case "EUR": return "€ " + fmt;
    case "SEK": return fmt + " kr";
    case "USD": return "$ " + fmt;
    case "GBP": return "£ " + fmt;
    default:    return fmt;
  }
}

export const COUNTRIES: { code: string; label: string }[] = [
  { code: "se", label: "Sweden" },
  { code: "no", label: "Norway" },
  { code: "dk", label: "Denmark" },
  { code: "fi", label: "Finland" },
  { code: "de", label: "Germany" },
  { code: "gb", label: "United Kingdom" },
  { code: "fr", label: "France" },
  { code: "nl", label: "Netherlands" },
  { code: "be", label: "Belgium" },
  { code: "ch", label: "Switzerland" },
  { code: "at", label: "Austria" },
  { code: "es", label: "Spain" },
  { code: "it", label: "Italy" },
  { code: "pt", label: "Portugal" },
  { code: "us", label: "United States" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "jp", label: "Japan" },
  { code: "other", label: "Other" },
];
