import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startCollabServer } from '../src/server/collabServer.js';
import { LocalAgentRegistry } from '../src/server/localAgents.js';
import { saveDeck } from '../src/main/deckStore.js';
import { emptyDeck } from '../src/shared/deck.js';
import { writeDeckAccess } from '../src/server/accessControl.js';
import { connectAgentBridge } from '../src/cli/agentConnect.js';

it('lists real bridge registrations separately from participants, filters access, and removes disconnects', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'active-bridges-'));
  const mirror = await mkdtemp(join(tmpdir(), 'active-mirror-'));
  for (const id of ['folder/demo', 'private']) {
    await saveDeck(join(rootDir, id), emptyDeck(id === 'private' ? 'Secret title' : 'Shared deck'));
    await writeDeckAccess(join(rootDir, id), { owner: 'admin@example.test', visibility: 'private', publicRole: 'edit', sharedWith: id === 'private' ? [] : [{ login: 'alice@example.test', role: 'view' }] });
  }
  const server = await startCollabServer({ rootDir, host: '127.0.0.1', port: 0, localAgents: new LocalAgentRegistry(), accessControl: { admin: 'admin@example.test' } });
  const base = `http://127.0.0.1:${server.port}`;
  const bridges: ReturnType<typeof connectAgentBridge>[] = [];
  const sockets: WebSocket[] = [];
  const list = async (login = 'admin@example.test') => {
    const response = await fetch(`${base}/api/bridges`, { headers: { 'tailscale-user-login': login } });
    expect(response.status).toBe(200);
    return response.json();
  };
  const peer = async (hello: object) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws?deck=folder%2Fdemo`);
    sockets.push(socket);
    await new Promise<void>(resolve => socket.once('open', resolve));
    socket.send(JSON.stringify({ kind: 'hello', version: 1, ...hello }));
    await new Promise<void>(resolve => socket.once('message', () => resolve()));
  };
  try {
    expect((await list()).bridges).toEqual([]);
    for (const id of ['folder/demo', 'private']) {
      const bridge = connectAgentBridge({ url: `${base}/?deck=${encodeURIComponent(id)}&agent=participant-${id === 'private' ? 'private' : 'shared'}`, dir: join(mirror, id.replace('/', '-')), io: { cwd: mirror, out: () => {}, err: () => {} } });
      bridges.push(bridge); await bridge.ready;
    }
    await peer({ participant: 'participant-browser-one', name: 'Browser one' });
    await peer({ participant: 'participant-browser-two', name: 'Browser two' });
    await peer({ agentFor: 'participant-legacy', name: 'Old agent' });
    const admin = await list();
    expect(admin.bridges).toHaveLength(2);
    const shared = admin.bridges.find((b: any) => b.deckId === 'folder/demo');
    expect(shared).toMatchObject({ title: 'Shared deck', mirrorPath: join(mirror, 'folder-demo'), status: 'connected', metadataSource: 'client-registration' });
    expect(shared.host).toBeTruthy();
    expect(shared.connectedAt).toBeTruthy();
    expect(shared.lastSeenAt).toBeTruthy();
    expect(admin.participants.find((p: any) => p.deckId === 'folder/demo')).toMatchObject({ browserParticipants: 2, legacyAgentConnections: 1 });
    const alice = await list('alice@example.test');
    expect(alice.bridges).toHaveLength(1);
    expect(JSON.stringify(alice)).not.toMatch(/Secret title|participant-private|token|commandArgs/);
    expect(JSON.stringify(alice)).not.toContain('participant-browser-one');
    const forbiddenPanel = await fetch(`${base}/api/agent-panel/state?deck=folder%2Fdemo&participant=participant-shared`, { headers: { 'tailscale-user-login': 'alice@example.test' } });
    expect(forbiddenPanel.status).toBe(403);
    const ownPanel = await fetch(`${base}/api/agent-panel/state?deck=folder%2Fdemo&participant=participant-alice`, { headers: { 'tailscale-user-login': 'alice@example.test' } });
    expect(ownPanel.status).toBe(200);
    const panel = await ownPanel.json();
    expect(panel.existingBridges).toHaveLength(1);
    expect(panel.messages).toEqual([]);
    expect(panel.connection).toBe('unavailable');
    await bridges[0].close();
    await new Promise(resolve => setTimeout(resolve, 40));
    expect((await list()).bridges).toHaveLength(1);
  } finally {
    for (const socket of sockets) socket.close();
    for (const bridge of bridges) await bridge.close();
    await server.close(); await rm(rootDir, { recursive: true, force: true }); await rm(mirror, { recursive: true, force: true });
  }
}, 30000);
