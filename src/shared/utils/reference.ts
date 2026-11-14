/**
 * Business Document Reference Utilities (Client & Server Safe)
 *
 * Provides pure formatting and UUID detection helpers to guarantee that
 * no raw database UUIDs are ever presented to the user as business references.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_UUID_REGEX = /^[0-9a-f]{32}$/i;

// Regex to capture canonical SaleFlow document numbers from descriptions/narrations as a resilient fallback
export const DOC_PATTERN_REGEX = /\b(BILL-\d{6}-\d{4}|BILL-\d{4}-\d+|ORD-\d{4}-\d+|INV-\d{4}-\d+|PR-\d{6}-\d{4}|PR-\d{4}-\d+|SR-\d{6}-\d{4}|SR-\d{4}-\d+|PV-\d{6}-\d{4}|PV-\d{4}-\d+|CR-\d{6}-\d{4}|CR-\d{4}-\d+|EXP-\d{6}-\d{4}|EXP-\d{4}-\d+|ADJ-\d{4}-\d+|JE-\d{6}-\d{4}|JE-\d{4}-\d+|JV-[A-Z0-9-]+)\b/i;

/**
 * Checks if a given string is a raw database UUID
 */
export function isUuid(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return UUID_REGEX.test(trimmed) || COMPACT_UUID_REGEX.test(trimmed);
}

/**
 * Cleanly formats a reference on the client or server, guaranteeing that NO raw UUID is exposed
 *
 * Strict Fallback Order:
 * 1. Actual source document / business number (e.g. BILL-202610-0001, ORD-2026-51614)
 * 2. Extracted document pattern from narration if available
 * 3. Journal entry number if no business document exists (e.g. JE-202610-0003)
 * 4. Safe short technical reference ONLY as absolute last fallback (e.g. REF-7FA91C65)
 * 5. '—' if empty
 */
export function formatBusinessReference(
  rawRef: string | null | undefined,
  entryNumber?: string | null,
  description?: string | null
): string {
  if (!rawRef && !entryNumber && !description) return '—';

  // 1. If rawRef is already a human-readable document number (non-UUID), return it
  if (rawRef && !isUuid(rawRef)) {
    return rawRef.trim();
  }

  // 2. If rawRef is a UUID or missing, try extracting canonical doc pattern from description
  if (description) {
    const match = description.match(DOC_PATTERN_REGEX);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  // 3. If entry number exists (e.g., JE-202610-0003), use it
  if (entryNumber && !isUuid(entryNumber)) {
    return entryNumber.trim();
  }

  // 4. Last resort safe technical fallback (short reference without exposing raw UUID)
  if (rawRef && isUuid(rawRef)) {
    return `REF-${rawRef.slice(0, 8).toUpperCase()}`;
  }

  return '—';
}
