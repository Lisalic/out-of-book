/**
 * Identifier for a locally created record. `crypto.randomUUID` is absent in a few
 * non-secure or older contexts, so the prefixed timestamp keeps ids unique enough
 * for one device's store while staying readable in logs.
 */
export function createId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
