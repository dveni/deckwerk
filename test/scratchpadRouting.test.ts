import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCollabServer } from '../src/server/collabServer.js';
import { LocalAgentRegistry } from '../src/server/localAgents.js';
import { saveDeck } from '../src/main/deckStore.js';
import { emptyDeck } from '../src/shared/deck.js';
it('serializes every browser scratchpad URL as same-origin without changing desktop previews', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'scratchpad-routing-'));
  const registry = new LocalAgentRegistry();
  await saveDeck(join(rootDir, 'nested/demo'), emptyDeck('Scratchpad'));
  const server = await startCollabServer({ rootDir, host: '127.0.0.1', port: 0, localAgents: registry });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const raw = { draftId: 'draft', slideCount: 1,
      sourceUrl: `${base}/api/html-drafts/draft/source?deck=nested%2Fdemo`,
      importedUrl: `${base}/api/html-drafts/draft/imported?deck=nested%2Fdemo`,
      comparisonUrl: `${base}/api/html-drafts/draft/compare?deck=nested%2Fdemo`,
      sourceContactSheetUrl: `${base}/api/html-drafts/draft/source/contact-sheet.png?deck=nested%2Fdemo`,
      importedContactSheetUrl: `${base}/api/html-drafts/draft/imported/contact-sheet.png?deck=nested%2Fdemo` };
    registry.setScratchpad(join(rootDir, 'nested/demo'), 'participant-routing', raw);
    const response = await fetch(`${base}/api/agent-panel/state?deck=nested%2Fdemo&participant=participant-routing`);
    expect(response.status).toBe(200);
    const state = await response.json();
    for (const key of ['sourceUrl', 'importedUrl', 'comparisonUrl', 'sourceContactSheetUrl', 'importedContactSheetUrl']) {
      expect(state.scratchpad[key]).toBe(raw[key as keyof typeof raw].toString().slice(base.length));
      expect(new URL(state.scratchpad[key], 'https://remote.example:9443').origin).toBe('https://remote.example:9443');
    }
    expect((await registry.getState(join(rootDir, 'nested/demo'), 'participant-routing')).scratchpad).toEqual(raw);
  } finally { await server.close(); await rm(rootDir, { recursive: true, force: true }); }
});
