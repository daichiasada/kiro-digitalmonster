import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Stage } from '@digital-monster/shared';

import { ChatPanel } from '../components/ChatPanel';

describe('ChatPanel', () => {
  beforeEach(() => {
    // Avoid real network if a test ever triggers send().
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('disables the input and send button for 幼年期 / BABY', () => {
    render(<ChatPanel stage={Stage.BABY} />);
    const input = screen.getByLabelText('メッセージ') as HTMLInputElement;
    const send = screen.getByRole('button', { name: '送信' }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(send.disabled).toBe(true);
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('enables the input for ROOKIE (conversation allowed)', () => {
    render(<ChatPanel stage={Stage.ROOKIE} />);
    const input = screen.getByLabelText('メッセージ') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('enables the input for CHAMPION and ULTIMATE', () => {
    const { rerender } = render(<ChatPanel stage={Stage.CHAMPION} />);
    expect((screen.getByLabelText('メッセージ') as HTMLInputElement).disabled).toBe(false);
    rerender(<ChatPanel stage={Stage.ULTIMATE} />);
    expect((screen.getByLabelText('メッセージ') as HTMLInputElement).disabled).toBe(false);
  });
});
