// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { emptyDeck, ActionSchema } from '../src/shared/deck.js';
import { resolveState, stepCount } from '../src/shared/timeline.js';

 it('fades overlapping children as one composited wrapper and unwraps exactly on finish', async () => {
 const path = '../src/renderer/player/nativeBuildEffects.js';
 const mod = await import(path);
 expect(typeof mod.animateCompositeFade).toBe('function');
 const root=document.createElement('div');
 root.innerHTML='<div data-element-id="a" style="position:absolute;z-index:3"></div><div data-element-id="b" style="position:absolute;z-index:4"></div>';
 const children=[...root.children];
 const animate=vi.fn((_frames:Keyframe[] | PropertyIndexedKeyframes | null, _options?:number | KeyframeAnimationOptions)=>({finished:new Promise(()=>{}),finish:vi.fn()} as unknown as Animation));
 HTMLElement.prototype.animate=animate;
 const finish=mod.animateCompositeFade(children,500);
 expect(animate).toHaveBeenCalledTimes(1);
 expect(animate.mock.instances[0]).toBe(root.firstElementChild);
 expect(root.firstElementChild!.children.length).toBe(2);
 expect((root.firstElementChild as HTMLElement).style.isolation).toBe('isolate');
 expect(animate.mock.calls[0][0]).toEqual([{opacity:0},{opacity:1}]);
 finish(); finish();
 expect([...root.children]).toEqual(children);
 });

it('keeps a grouped visibility build one click and restores all children on forward/back/jump/reset', () => {
 const slide=emptyDeck('group').slides[0];
 slide.elements=['a','b'].map((id,z)=>({id,type:'text',html:id,x:0,y:0,w:10,h:10,z,rot:0,opacity:1,class:[],style:{},align:'left',valign:'top'}));
 slide.timeline=[{id:'group',trigger:{on:'click',ref:null,delay:0},action:ActionSchema.parse({type:'appear',target:'a',targets:['a','b'],value:'dissolve',duration:500})}];
 expect(stepCount(slide)).toBe(2);
 expect([...resolveState(slide,0).visible]).toEqual([]);
 expect([...resolveState(slide,1).visible]).toEqual(['a','b']);
 expect([...resolveState(slide,99).visible]).toEqual(['a','b']);
 expect([...resolveState(slide,0).visible]).toEqual([]);
});
