import type { Slide } from '@shared/deck.js';
import { motionOwnsPosition } from './motion.js';
import { applyParagraphVisibility } from '@shared/paragraphs.js';
import type { SlideState } from '@shared/timeline.js';
import { curvedShadowClasses } from '@shared/shapeShadow.js';
import { applyTermStates } from './equationBuilds.js';
import { applyCodeLineState } from './codeRender.js';

/**
 * Apply the resolved, motion-free endpoint of one build state.
 *
 * The player, presenter preview, and PDF renderer use this same function. This
 * keeps visibility, paragraph builds, and build classes identical everywhere.
 */
export function applyStaticSlideState(
  stage: ParentNode,
  slide: Slide,
  state: SlideState,
): void {
  applyParagraphVisibility(stage, state);
  applyTermStates(stage, slide, state);
  applyCodeLineState(stage, slide, state);
  const nodes = new Map(
    [...stage.querySelectorAll<HTMLElement>('[data-element-id]')]
      .map((node) => [node.dataset.elementId ?? '', node] as const),
  );
  for (const element of slide.elements) {
    const node = nodes.get(element.id);
    if (!node) continue;
    if (!motionOwnsPosition(node)) {
      const offset = state.motion?.get(element.id);
      node.style.left = `${element.x + (offset?.x ?? 0)}px`;
      node.style.top = `${element.y + (offset?.y ?? 0)}px`;
    }
    const visible = state.visible.has(element.id);
    node.style.visibility = visible ? 'visible' : 'hidden';
    node.style.pointerEvents = visible ? '' : 'none';
    node.className = [
      'element',
      `element-${element.type}`,
      ...(state.classes.get(element.id) ?? element.class),
      ...curvedShadowClasses(element.style),
    ].join(' ');
  }
}
