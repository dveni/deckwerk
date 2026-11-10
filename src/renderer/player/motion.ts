import type { Slide, TimelineEntry } from '@shared/deck.js';

// Keep endpoint reconciliation from snapping a live build to its final position
// when a simultaneous visibility/media action reconciles the rest of the slide.
const moving = new WeakSet<HTMLElement>();
export function motionOwnsPosition(node: HTMLElement): boolean { return moving.has(node); }

/** OOXML acceleration/deceleration is piecewise constant acceleration, not CSS ease-in-out. */
export function motionProgress(t: number, accel: number, decel: number): number {
  t = Math.max(0, Math.min(1, t));
  const velocity = 1 / (1 - (accel + decel) / 2);
  if (accel > 0 && t < accel) return velocity * t * t / (2 * accel);
  if (decel > 0 && t > 1 - decel) return 1 - velocity * (1 - t) ** 2 / (2 * decel);
  return velocity * (t - accel / 2);
}

/** One RAF and fallback per source group: every flattened member samples one clock. */
export function animateMotion(stage: ParentNode, slide: Slide, entry: TimelineEntry, duration: number, start = performance.now()): () => void {
  const motion = entry.action.motion;
  if (!motion) return () => {};
  const ids = new Set(entry.action.targets ?? [entry.action.target]);
  const nodes = new Map([...stage.querySelectorAll<HTMLElement>('[data-element-id]')]
    .filter(node => ids.has(node.dataset.elementId ?? ''))
    .map(node => [node.dataset.elementId!, node]));
  const members = slide.elements.filter(el => nodes.has(el.id));
  for (const node of nodes.values()) moving.add(node);
  let done = false, frame = 0;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const paint = (t: number): void => {
    const p = motionProgress(t, motion.accel, motion.decel);
    const x = motion.from.x + (motion.to.x - motion.from.x) * p;
    const y = motion.from.y + (motion.to.y - motion.from.y) * p;
    for (const el of members) {
      const node = nodes.get(el.id)!;
      node.style.left = `${el.x + x}px`;
      node.style.top = `${el.y + y}px`;
    }
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    if (fallback !== undefined) clearTimeout(fallback);
    paint(1);
    for (const node of nodes.values()) moving.delete(node);
  };
  if (duration <= 0) { finish(); return finish; }
  const tick = (now: number): void => {
    if (done) return;
    const t = (now - start) / duration;
    if (t >= 1) finish();
    else { paint(t); frame = requestAnimationFrame(tick); }
  };
  const elapsed = performance.now() - start;
  if (elapsed >= duration) { finish(); return finish; }
  paint(elapsed / duration);
  frame = requestAnimationFrame(tick);
  fallback = setTimeout(finish, Math.max(0, duration - elapsed));
  return finish;
}
