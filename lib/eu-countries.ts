/**
 * EU member states for the "Ships from EU / Outside EU" filter.
 *
 * The set holds ISO-3166-1 alpha-2 codes upper-cased. We also keep a small
 * lookup of common country *names* (English) so a free-text seller_country
 * like "France" still matches.
 */

export const EU_COUNTRY_CODES = new Set<string>([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const EU_COUNTRY_NAMES = new Set<string>([
  "AUSTRIA", "BELGIUM", "BULGARIA", "CROATIA", "CYPRUS", "CZECHIA",
  "CZECH REPUBLIC", "DENMARK", "ESTONIA", "FINLAND", "FRANCE",
  "GERMANY", "GREECE", "HUNGARY", "IRELAND", "ITALY", "LATVIA",
  "LITHUANIA", "LUXEMBOURG", "MALTA", "NETHERLANDS", "POLAND",
  "PORTUGAL", "ROMANIA", "SLOVAKIA", "SLOVENIA", "SPAIN", "SWEDEN",
]);

/**
 * Returns true when the given country (ISO-2 code OR English name) is an EU
 * member state. Returns false when the value is null, unknown, or matches
 * any non-EU country.
 */
export function isEuCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  const v = country.trim().toUpperCase();
  if (v.length === 2) return EU_COUNTRY_CODES.has(v);
  return EU_COUNTRY_NAMES.has(v);
}
