// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { emptyDeck, type Deck, type SlideElement } from '../src/shared/deck.js';
import { Player } from '../src/renderer/player/player.js';
let player:Player;
let host:HTMLElement;
const entry=(id:string,on:string,type:string,target:string,extra={})=>({id,trigger:{on,ref:on==='objectClick'?target:null,delay:0},action:{type,target,value:null,...extra}} as any);
const text=(id:string,z=0)=>({id,type:'text',html:id,x:0,y:0,w:100,h:50,z,rot:0,opacity:1,class:[],style:{},align:'left',valign:'top'} as SlideElement);
function makeDeck():Deck {
 const deck=emptyDeck('native lifecycle');
 deck.slides[0].elements=[{...text('video'),type:'video',src:'assets/test.mp4',autoplay:false,loop:false,muted:true,controls:false,start:0,end:null,poster:null,fit:'contain'} as any,text('caption',1)];
 return deck;
}
beforeEach(()=>{
 document.body.replaceChildren();
 vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
 if(!globalThis.CSS) vi.stubGlobal('CSS',{});
 CSS.escape=(s)=>s;
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(this:HTMLMediaElement){Object.defineProperty(this,'paused',{value:false,configurable:true});return Promise.resolve();});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){Object.defineProperty(this,'paused',{value:true,configurable:true});});
 vi.spyOn(HTMLMediaElement.prototype,'readyState','get').mockReturnValue(4);
 host=document.createElement('div');document.body.append(host);
});
afterEach(()=>{player?.destroy();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('consumes authored seeks once during forward builds but replays them on back, jump and reset',()=>{
 const deck=makeDeck(); deck.slides[0].timeline=[entry('seek','click','seek','video',{value:2}),entry('play','withPrev','play','video'),entry('caption','click','appear','caption'),entry('seek-again','click','seek','video',{value:2})];
 player=new Player({deck,container:host,resolveSrc:s=>s});
 player.next(); let video=host.querySelector('video')!;
 expect(video.currentTime).toBe(2); video.currentTime=3.5;
 player.next(); expect(video.currentTime).toBe(3.5);
 player.next(); expect(video.currentTime).toBe(2); // distinct command, same value
 player.prev(); video=host.querySelector('video')!; expect(video.currentTime).toBe(2);
 player.goTo({slide:0,step:1}); expect(host.querySelector('video')!.currentTime).toBe(2);
 player.goToSlide(0); expect(host.querySelector('video')!.currentTime).toBe(0);
});

it('object-click toggles do not advance milestones, survive later builds, and clear on jump/reset',()=>{
 const deck=makeDeck(); deck.slides[0].timeline=[entry('play','withPrev','play','video'),entry('toggle','objectClick','togglePause','video'),entry('caption','click','appear','caption')];
 player=new Player({deck,container:host,resolveSrc:s=>s});
 let video=host.querySelector('video')!; expect(video.paused).toBe(false);
 const bubbled=vi.fn();host.addEventListener('click',bubbled);
 video.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 expect(video.paused).toBe(true);expect(player.getCursor().step).toBe(0);expect(bubbled).not.toHaveBeenCalled();
 player.next();expect(video.paused).toBe(true); // later build must not override user pause
 video.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(video.paused).toBe(false);
 player.prev();video=host.querySelector('video')!;expect(video.paused).toBe(false);
 video.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(video.paused).toBe(true);
 player.goToSlide(0);expect(host.querySelector('video')!.paused).toBe(false);
});

it('does not restart a naturally finished clip on the next unrelated build',()=>{
 const deck=makeDeck();deck.slides[0].timeline=[entry('play','withPrev','play','video'),entry('caption','click','appear','caption')];
 player=new Player({deck,container:host,resolveSrc:s=>s});const video=host.querySelector('video')!;
 Object.defineProperty(video,'ended',{value:true,configurable:true});Object.defineProperty(video,'paused',{value:true,configurable:true});
 const play=vi.spyOn(video,'play');play.mockClear();player.next();
 expect(play).not.toHaveBeenCalled();expect(video.paused).toBe(true);
});

it('still allows an explicit later play command to restart a finished clip',()=>{
 const deck=makeDeck();deck.slides[0].timeline=[entry('entry-play','withPrev','play','video'),entry('replay','click','play','video')];
 player=new Player({deck,container:host,resolveSrc:s=>s});const video=host.querySelector('video')!;let ended=true;let time=6;
 Object.defineProperty(video,'ended',{get:()=>ended,configurable:true});Object.defineProperty(video,'paused',{value:true,configurable:true});
 Object.defineProperty(video,'currentTime',{get:()=>time,set:value=>{time=value;ended=false;},configurable:true});
 const play=vi.spyOn(video,'play');play.mockClear();player.next();
 expect(play).toHaveBeenCalledTimes(1);expect(video.currentTime).toBe(0);
});

it('object-click can replay a naturally ended clip without adding a main click milestone',()=>{
 const deck=makeDeck();deck.slides[0].timeline=[entry('entry-play','withPrev','play','video'),entry('toggle','objectClick','togglePause','video')];
 player=new Player({deck,container:host,resolveSrc:s=>s});const video=host.querySelector('video')!;let ended=true;let time=6;
 Object.defineProperty(video,'ended',{get:()=>ended,configurable:true});Object.defineProperty(video,'paused',{value:true,configurable:true});
 Object.defineProperty(video,'currentTime',{get:()=>time,set:value=>{time=value;ended=false;},configurable:true});
 video.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 expect(video.paused).toBe(false);expect(video.currentTime).toBe(0);expect(player.getCursor().step).toBe(0);
});
