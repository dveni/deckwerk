// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
it('animates a downward wipe in local object coordinates for the exact source duration', async () => {
 const path='../src/renderer/player/nativeBuildEffects.js'; const mod=await import(path);
 expect(typeof mod.animateDirectionalWipe).toBe('function');
 const node=document.createElement('div'); node.style.transform='rotate(29.35deg)';
 const animate=vi.fn((_frames:Keyframe[] | PropertyIndexedKeyframes | null, _options?:number | KeyframeAnimationOptions)=>({finished:new Promise(()=>{}),finish:vi.fn()} as unknown as Animation)); node.animate=animate;
 const finish=mod.animateDirectionalWipe(node,'down',500);
 expect(animate.mock.calls[0]).toEqual([[{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:500,easing:'linear',fill:'none'}]);
 finish(); expect(node.style.transform).toBe('rotate(29.35deg)'); expect(node.style.clipPath).toBe('');
});
