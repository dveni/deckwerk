/** Fade a contiguous paint-order group as ONE offscreen composited surface.
 * Children retain slide-space geometry; the full-slide wrapper adds no transform.
 * Refuse non-contiguous siblings rather than reorder intervening artwork.
 */
export function animateCompositeFade(nodes: HTMLElement[], duration: number): () => void {
  if (!nodes.length || duration <= 0 || !nodes[0].animate) return () => {};
  const parent = nodes[0].parentElement;
  if (!parent || nodes.some(node => node.parentElement !== parent)) throw new Error('Composite targets must be siblings');
  const selected = new Set(nodes);
  const ordered = [...parent.children].filter(node => selected.has(node as HTMLElement)) as HTMLElement[];
  const siblings = [...parent.children];
  const first = siblings.indexOf(ordered[0]);
  if (siblings.slice(first, first + ordered.length).some(node => !selected.has(node as HTMLElement))) {
    throw new Error('Composite targets must be contiguous in paint order');
  }
  const wrapper = document.createElement('div');
  wrapper.dataset.compositeBuild = 'true';
  Object.assign(wrapper.style, { position: 'absolute', inset: '0', isolation: 'isolate', zIndex: ordered[0].style.zIndex });
  parent.insertBefore(wrapper, ordered[0]);
  for (const node of ordered) wrapper.appendChild(node);
  const animation = wrapper.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'linear', fill: 'none' });
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    for (const node of ordered) wrapper.before(node);
    wrapper.remove();
  };
  void animation.finished.then(cleanup, cleanup);
  return () => { if (!cleaned) animation.finish(); cleanup(); };
}

