export interface ActiveBridge {
  id: string; deckId: string; title: string; label: string;
  host: string; mirrorPath: string; connectedAt: string; lastSeenAt: string;
  status: 'connected'; metadataSource: 'client-registration';
}
export interface ActiveBridgesState {
  bridges: ActiveBridge[];
  participants: Array<{ deckId: string; browserParticipants: number; legacyAgentConnections: number }>;
}
/** Poll only while mounted; never retain stale private metadata on an error. */
export function mountActiveBridges(host: HTMLElement): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async (): Promise<void> => {
    if (stopped || !host.isConnected) return;
    try {
      const response = await fetch('/api/bridges', { cache: 'no-store' });
      if (!response.ok) throw new Error('Bridge status unavailable');
      const state = await response.json() as ActiveBridgesState;
      if (stopped || !host.isConnected) return;
      const title = document.createElement('h3');
      title.textContent = `Active bridges · ${state.bridges.length} bridge${state.bridges.length === 1 ? '' : 's'}`;
      const nodes: HTMLElement[] = [title];
      if (!state.bridges.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No registered filesystem bridges connected to your authorized decks.';
        nodes.push(empty);
      }
      for (const bridge of state.bridges) {
        const row = document.createElement('p');
        const link = document.createElement('a');
        link.href = `/?deck=${encodeURIComponent(bridge.deckId)}`;
        link.textContent = bridge.title;
        const details = document.createElement('span');
        details.textContent = ` — ${bridge.label} · ${bridge.host} · ${bridge.mirrorPath} · connected · last seen ${new Date(bridge.lastSeenAt).toLocaleTimeString()}`;
        row.append(link, details); nodes.push(row);
      }
      const summary = document.createElement('p');
      const browserCount = state.participants.reduce((n, p) => n + p.browserParticipants, 0);
      const legacyCount = state.participants.reduce((n, p) => n + p.legacyAgentConnections, 0);
      summary.textContent = `${browserCount} browser participants across authorized decks (not a count of agent processes). ${legacyCount} legacy agent connection${legacyCount === 1 ? '' : 's'} without bridge metadata. Host and mirror are client-reported; shell wrappers and additional collaborators sharing a mirror are not separately detected.`;
      nodes.push(summary); host.replaceChildren(...nodes);
    } catch {
      if (!stopped) host.textContent = 'Bridge status unavailable — previous results cleared.';
    }
    if (!stopped && host.isConnected) timer = setTimeout(() => void poll(), 2000);
  };
  void poll();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
