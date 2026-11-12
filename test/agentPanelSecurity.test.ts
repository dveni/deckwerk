import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCollabServer } from '../src/server/collabServer.js';
import { LocalAgentRegistry } from '../src/server/localAgents.js';
import { saveDeck } from '../src/main/deckStore.js';
import { emptyDeck } from '../src/shared/deck.js';
import { writeDeckAccess } from '../src/server/accessControl.js';

const admin = { 'tailscale-user-login': 'admin@example.test' };
const alice = { 'tailscale-user-login': 'alice@example.test' };
async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'panel-security-'));
  const dir = join(rootDir, 'nested/demo');
  const registry = new LocalAgentRegistry();
  await saveDeck(dir, emptyDeck('Security fixture'));
  await writeDeckAccess(dir, { owner: 'admin@example.test', visibility: 'private', publicRole: 'edit', sharedWith: [{ login: 'alice@example.test', role: 'edit' }] });
  const server = await startCollabServer({ rootDir, host: '127.0.0.1', port: 0, localAgents: registry, accessControl: { admin: 'admin@example.test' } });
  const base = `http://127.0.0.1:${server.port}`;
  return { dir, registry, base, close: async () => { await server.close(); await rm(rootDir, { recursive: true, force: true }); } };
}

it.each(['state', 'events'])('authorizes the consumed participant on real HTTP %s for conflicting identifier URL forms', async route => {
  const f = await fixture();
  try {
    const claimed = await fetch(`${f.base}/api/agent-panel/state?deck=nested%2Fdemo&participant=participant-victim`, { headers: admin });
    expect(claimed.status).toBe(200);
    await claimed.json();
    f.registry.event(f.dir, 'participant-victim', { text: 'PRIVATE victim message' });
    const variants = [
      'participant=participant-victim',
      'participant=participant-victim&agentSession=participant-attacker',
      'agentSession=participant-attacker&participant=participant-victim',
      'participant=participant-%76ictim&agent%53ession=participant-attacker',
      'participant=participant-victim&participant=participant-attacker&agentSession=participant-attacker',
      'participant=participant-victim&agentSession=invalid',
      'participant=participant-victim&agentSession=',
    ];
    const results = [];
    for (const query of variants) {
      for (const path of [`/api/agent-panel/${route}`, `/api/agent%2Dpanel/${route}`]) {
        const response = await fetch(`${f.base}${path}?deck=nested%2Fdemo&${query}`, { headers: alice });
        // Cancel an incorrectly admitted SSE without waiting for its endless body.
        const status = response.status;
        const body = status === 403 ? await response.text() : '';
        if (status !== 403) await response.body?.cancel();
        results.push({ query, path, status, privateData: body.includes('PRIVATE') });
      }
    }
    expect(results).toEqual(results.map(row => ({ ...row, status: 403, privateData: false })));
  } finally { await f.close(); }
});

it.each(['share revoked', 'visibility private', 'owner transferred', 'role demoted', 'sidecar revoked', 'deck removed'])('closes existing real SSE on %s without subsequent private activity or bridge metadata', async change => {
  const f = await fixture();
  const controller = new AbortController();
  let socket: WebSocket | undefined;
  try {
    const access = { owner: 'admin@example.test', visibility: 'private' as const, publicRole: 'edit' as const, sharedWith: [{ login: 'alice@example.test', role: 'edit' as const }] };
    if (change === 'visibility private') await writeDeckAccess(f.dir, { ...access, visibility: 'public', sharedWith: [] });
    if (change === 'owner transferred') await writeDeckAccess(f.dir, { ...access, owner: 'alice@example.test', sharedWith: [] });
    const response = await fetch(`${f.base}/api/agent-panel/events?deck=nested%2Fdemo&participant=participant-alice`, { headers: alice, signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let received = '', closed = false;
    const pumping = (async () => {
      try { while (true) { const row = await reader.read(); if (row.done) break; received += new TextDecoder().decode(row.value); } }
      catch (error) { if (!controller.signal.aborted) throw error; }
      finally { closed = true; }
    })();
    const waitFor = async (predicate: () => boolean) => {
      for (let n = 0; n < 100 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 10));
      return predicate();
    };
    expect(await waitFor(() => received.includes('data:'))).toBe(true);
    f.registry.event(f.dir, 'participant-alice', { text: 'authorized own update' });
    expect(await waitFor(() => received.includes('authorized own update'))).toBe(true);
    f.registry.event(f.dir, 'participant-victim', { text: 'OTHER-PARTICIPANT-PRIVATE' });
    const before = received;
    if (change === 'sidecar revoked') await writeDeckAccess(f.dir, { ...access, sharedWith: [] });
    else if (change === 'deck removed') await rm(f.dir, { recursive: true, force: true });
    else {
      const payload = change === 'role demoted' ? { sharedWith: [{ login: 'alice@example.test', role: 'view' }] }
        : change === 'owner transferred' ? { owner: 'admin@example.test' }
        : { visibility: 'private', sharedWith: [] };
      const update = await fetch(`${f.base}/api/access?deck=nested%2Fdemo`, { method: 'PUT', headers: admin, body: JSON.stringify(payload) });
      expect(update.status).toBe(200); await update.json();
    }
    if (change !== 'deck removed') {
      const state = await fetch(`${f.base}/api/agent-panel/state?deck=nested%2Fdemo&participant=participant-alice`, { headers: alice });
      expect(state.status).toBe(change === 'role demoted' ? 200 : 403); await state.text();
    }
    if (change !== 'deck removed') {
      socket = new WebSocket(`${f.base.replace('http:', 'ws:')}/ws?deck=nested%2Fdemo`, { headers: admin });
      await new Promise<void>(resolve => socket!.once('open', resolve));
      socket.send(JSON.stringify({ kind: 'hello', version: 1, agentFor: 'participant-admin', filesystemBridge: { id: '00000000-0000-4000-8000-000000000002', host: 'POST-REVOKE-HOST', mirrorPath: '/POST-REVOKE-MIRROR' } }));
      await new Promise<void>(resolve => socket!.once('message', () => resolve()));
    }
    f.registry.event(f.dir, 'participant-alice', { text: 'POST-REVOKE-PRIVATE' });
    expect(await waitFor(() => closed)).toBe(true);
    expect(received).toBe(before);
    expect(received).not.toMatch(/POST-REVOKE/);
    await pumping;
  } finally { controller.abort(); socket?.terminate(); await f.close(); }
});
