// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createHomeButton } from '../src/renderer/editor/homeNavigation.js';
it('waits for a successful save before opening desktop library', async () => {
  let finish!: () => void;
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const open = vi.fn(), error = vi.fn();
  const button = createHomeButton({ save, open, error });
  button.click();
  expect(open).not.toHaveBeenCalled();
  finish(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(open).toHaveBeenCalledTimes(1);
});
it('keeps unsaved work in editor when saving or syncing fails', async () => {
  const open = vi.fn(), error = vi.fn();
  const button = createHomeButton({ save: async () => { throw new Error('Waiting for server'); }, open, error });
  button.click(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(open).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith('Waiting for server');
  expect(button.disabled).toBe(false);
});
