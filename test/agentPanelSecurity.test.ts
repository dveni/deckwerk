import { expect, it } from 'vitest';
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
  await writeDeckAccess(dir, { owner: 'admin@example.test', visibility: 'private', publicRole: 'edit', sharedWith: ['alice@example.test'] });
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
