import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseDeck } from '../src/shared/deck.js';
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
test('timed navigation waits for final build; clickAdvance=false still permits builds; jump/reset cancels',async()=>{
 const d=deck();(d.slides[0] as any).autoAdvanceMs=17000;(d.slides[0] as any).clickAdvance=false;
 d.slides.push({...d.slides[0],id:'next',timeline:[],autoAdvanceMs:undefined} as any);
 const parsed=parseDeck(d);assert.equal((parsed.slides[0] as any).autoAdvanceMs,17000);
 const {p,c}=player(parsed);p.goToSlide(0,{play:true});c.tick(18000);await Promise.resolve();assert.equal(p.getCursor().slide,0);
 p.next();c.tick(1000);p.next();c.tick(1000);await Promise.resolve();
 p.next();assert.equal(p.getCursor().slide,0);c.tick(16999);assert.equal(p.getCursor().slide,0);c.tick(1);assert.equal(p.getCursor().slide,1);
 p.goToSlide(0,{play:true});p.next();p.next();c.tick(1000);await Promise.resolve();p.goToSlide(0);c.tick(18000);await Promise.resolve();assert.equal(p.getCursor().slide,0);
 p.destroy();
});
const motion = (id:string, end:number, start=0) => ({id,trigger:{on:'click',ref:null,delay:0},action:{type:'motion',target:'a',targets:['a','b'],duration:1000,motion:{from:{x:start,y:0},to:{x:end,y:0},accel:.5,decel:.5}}});
const deck = () => parseDeck({version:1,slides:[{id:'s',elements:['a','b'].map(id=>({id,type:'shape',shape:'rect',x:10,y:20,w:20,h:20,rot:32})),timeline:[motion('m1',100),motion('m2',150,100)]}]});
