export const PATTERNS = {
  username: /^[a-zA-Z][a-zA-Z0-9._-]{2,49}$/,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/,
  phone: /^\+?[0-9]{8,15}$/,
  // Singapore local mobile/landline: exactly 8 digits, no country code/+65.
  phoneSG: /^[0-9]{8}$/,
  // 6-digit numeric login PIN.
  pin: /^[0-9]{6}$/,
  name: /^[a-zA-Z][a-zA-Z\s'-]{0,49}$/,
  accountNumber: /^[0-9]{10,20}$/,
};

export function formatMoney(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d.replace(' ', 'T')) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 16).replace('T', ' ');
}
