import { beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_ID_KEY, getClientId } from '../lib/clientId';

describe('getClientId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates and persists an id on first use', () => {
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBeNull();
    const id = getClientId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBe(id);
  });

  it('reuses the same id across calls (reload simulation)', () => {
    const first = getClientId();
    const second = getClientId();
    expect(second).toBe(first);
  });

  it('reuses an already-stored id', () => {
    localStorage.setItem(CLIENT_ID_KEY, 'existing-id-123');
    expect(getClientId()).toBe('existing-id-123');
  });
});
