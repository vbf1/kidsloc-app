export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidCompanyName(value: string): boolean {
  const normalized = normalizeCompanyName(value);
  return normalized.length >= 2 && normalized.length <= 160;
}
