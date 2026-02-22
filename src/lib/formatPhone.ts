/**
 * Format a phone number as (xxx) xxx-xxxx.
 * Handles: 10 raw digits, already-formatted, or partial formats.
 * Returns the original string if it can't extract 10 digits.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  // Strip everything except digits
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // 11 digits starting with 1 (country code)
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Can't format — return as-is
  return phone;
}
