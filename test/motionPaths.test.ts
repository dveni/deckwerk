import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseDeck } from '../src/shared/deck.js';
import { resolveState, applyAction } from '../src/shared/timeline.js';
import { Player } from '../src/renderer/player/player.js';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>',{pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','HTMLVideoElement','HTMLImageElement','HTMLMediaElement','SVGElement','Element','Node','NodeFilter','getComputedStyle','Image','DOMParser']) (globalThis as any)[k]=(dom.window as any)[k];
(globalThis as any).ResizeObserver=class{observe(){}disconnect(){}};
(globalThis as any).CSS={escape:(s:string)=>s};
class Clock {
 now=0;seq=0; jobs=new Map<number,{at:number,fn:()=>void}>();
 install(){
  (globalThis as any).performance={now:()=>this.now};
  (globalThis as any).setTimeout=(fn:()=>void,ms=0)=>{const id=++this.seq;this.jobs.set(id,{at:this.now+ms,fn});return id};
  (globalThis as any).clearTimeout=(id:number)=>this.jobs.delete(id);
  (globalThis as any).requestAnimationFrame=(fn:(t:number)=>void)=>setTimeout(()=>fn(this.now),16);
  (globalThis as any).cancelAnimationFrame=(id:number)=>clearTimeout(id);
 }
 tick(ms:number){const end=this.now+ms;for(;;){const q=[...this.jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!q)break;this.now=q[1].at;this.jobs.delete(q[0]);q[1].fn();}this.now=end;}
}
function player(d=deck()){const c=new Clock();c.install();const host=document.createElement('div');document.body.append(host);const p=new Player({deck:d,container:host,resolveSrc:s=>s});return {p,c,host,node:(id='a')=>host.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!};}
test('native live motion interpolates with OOXML acceleration and finishes; jump/back restores layout',()=>{
 const {p,c,node}=player();const rot=node().style.transform;
 p.next();c.tick(256);
 // 0.5 accel + 0.5 decel: displacement = 2*t*t in the first half.
 assert.ok(parseFloat(node().style.left)>20 && parseFloat(node().style.left)<25);
 assert.equal(node().style.left,node('b').style.left);
 assert.equal(node().style.transform,rot);
 p.next(); // finish old motion, start the next path at 100, not at zero
 assert.equal(node().style.left,'110px');c.tick(1200);assert.equal(node().style.left,'160px');
 p.prev();assert.equal(node().style.left,'110px');
 p.goToSlide(0);assert.equal(node().style.left,'10px');c.tick(2000);assert.equal(node().style.left,'10px');
 p.destroy();
});
test('group visibility is atomic and declared one-ms sets pace the native motion scheduler',()=>{
 const d=deck();const s=d.slides[0];
 s.timeline=[{id:'in',trigger:{on:'click',ref:null,delay:0},action:{type:'appear',target:'a',targets:['a','b'],duration:1,value:null}},
 {...s.timeline[0],trigger:{on:'afterPrev',ref:null,delay:0}},
 {id:'out',trigger:{on:'afterPrev',ref:null,delay:0},action:{type:'disappear',target:'a',targets:['a','b'],duration:1,value:null}}] as any;
 const {p,c,node}=player(d);assert.equal(node('b').style.visibility,'hidden');p.next();
 assert.equal(node('b').style.visibility,'visible');assert.equal(node().style.left,'10px');
 c.tick(1000);assert.equal(node().style.visibility,'visible');c.tick(1);
 assert.equal(node().style.visibility,'hidden');assert.equal(node('b').style.visibility,'hidden');
 assert.equal(node().style.left,'110px');p.destroy();
});
import { animateMotion, motionProgress } from '../src/renderer/player/motion.js';
test('motion uses scheduled start time rather than independent dispatch clocks; source acceleration is exact',()=>{
 const {p,c,host,node}=player();c.now=500;
 const finish=animateMotion(host,deck().slides[0],deck().slides[0].timeline[0],1000,0);
 assert.equal(node().style.left,'60px');c.tick(500);assert.equal(node().style.left,'110px');finish();
 assert.equal(motionProgress(.25,.5,.5),.125);assert.equal(motionProgress(.75,.5,.5),.875);
 assert.equal(motionProgress(.25,0,0),.25);p.destroy();
});
const motion = (id:string, end:number, start=0) => ({id,trigger:{on:'click',ref:null,delay:0},action:{type:'motion',target:'a',targets:['a','b'],duration:1000,motion:{from:{x:start,y:0},to:{x:end,y:0},accel:.5,decel:.5}}});
const deck = () => parseDeck({version:1,slides:[{id:'s',elements:['a','b'].map(id=>({id,type:'shape',shape:'rect',x:10,y:20,w:20,h:20,rot:32})),timeline:[motion('m1',100),motion('m2',150,100)]}]});
test('motion endpoints replay for repeated layout paths; back/reset does not double-count',()=>{
 const s=deck().slides[0];
 assert.deepEqual(resolveState(s,1).motion?.get('a'),{x:100,y:0});
 assert.deepEqual(resolveState(s,2).motion?.get('a'),{x:150,y:0});
 assert.deepEqual(resolveState(s,2).motion?.get('b'),{x:150,y:0});
 assert.equal(resolveState(s,0).motion?.size,0);
 assert.deepEqual(resolveState(s,1).motion?.get('a'),{x:100,y:0});
 const state=resolveState(s,0);for(const e of s.timeline)applyAction(state,e,s);
 assert.deepEqual(state.motion,resolveState(s,2).motion);
});
