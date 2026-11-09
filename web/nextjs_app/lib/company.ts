export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidCompanyName(value: string): boolean {
  const normalized = normalizeCompanyName(value);
  const length = Array.from(normalized).length;
  return length >= 2 && length <= 160;
}
