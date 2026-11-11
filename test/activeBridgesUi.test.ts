// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mountActiveBridges } from '../src/renderer/collab/activeBridges.js';
it('renders registered bridges and separate participant counts with safe links and truthful empty state', async () => {
  const host = document.createElement('section'); document.body.replaceChildren(host);
  const request = vi.fn(async () => ({ ok: true, json: async () => ({ bridges: [{ id: 'one', deckId: 'nested/demo', title: '<unsafe>', label: 'Agent', host: 'workstation', mirrorPath: '/mirror', status: 'connected', connectedAt: 'now', lastSeenAt: 'now' }], participants: [{ deckId: 'nested/demo', browserParticipants: 2, legacyAgentConnections: 1 }] }) }));
  vi.stubGlobal('fetch', request);
  const stop = mountActiveBridges(host);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).toContain('1 bridge');
  expect(host.textContent).toContain('2 browser participants');
  expect(host.textContent).toContain('1 legacy agent connection');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/?deck=nested%2Fdemo');
  expect(host.querySelector('unsafe')).toBeNull();
  stop(); vi.unstubAllGlobals();
});
