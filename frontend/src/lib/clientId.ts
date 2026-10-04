/**
 * Client identity for the "no auth: one browser = one monster" model.
 *
 * A UUID is generated once and persisted in localStorage. The same id is
 * reused on every reload and sent to the backend as the DynamoDB partition key.
 */

/** localStorage key under which the client id is stored. */
export const CLIENT_ID_KEY = 'digital-monster:clientId';

function generateUuid(): string {
  // Prefer the standard crypto UUID when available (browsers + Node 19+).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the persisted client id, creating and storing a new one on first
 * use. Subsequent calls return the same id for the lifetime of the browser's
 * localStorage.
 */
export function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }
  const created = generateUuid();
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}
