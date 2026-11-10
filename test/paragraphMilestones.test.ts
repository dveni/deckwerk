// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { emptyDeck, ActionSchema } from '../src/shared/deck.js';
import { expandTimeline, resolveState, stepCount } from '../src/shared/timeline.js';

it('interleaves explicitly addressed paragraphs at clicks 1, 2 and 4 without overlay text', () => {
  const slide = emptyDeck('test').slides[0];
  slide.elements = [{ id:'text', type:'text', html:'<ul><li>A</li><li>B</li><li>C</li></ul>', x:0,y:0,w:100,h:100,z:0,rot:0,opacity:1,class:[],style:{},align:'left',valign:'top' }];
  slide.timeline = [0,1,null,2].map((paragraph,i) => ({id:`e${i}`, trigger:{on:'click', ref:null, delay:0}, action: ActionSchema.parse(paragraph === null ? {type:'play',target:'video'} : {type:'appear',target:'text',paragraph})}));
  expect(stepCount(slide)).toBe(5);
  expect(expandTimeline(slide).map(e=>e.part)).toEqual([0,1,null,2]);
  expect([0,1,2,3,4].map(s=>resolveState(slide,s).parts.get('text'))).toEqual([0,1,2,2,3]);
  expect(resolveState(slide,1).parts.get('text')).toBe(1); // back/jump replay
  expect(resolveState(slide,0).visible.has('text')).toBe(false); // reset
});
