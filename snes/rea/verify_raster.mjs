// Real PPU tests; switches ROMs inside one already-running BizHawk process.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {unpack,range,inspectPixel} from './protocol.mjs';
const base=process.argv[2]??'http://127.0.0.1:8900',out=new URL('./test-output/',import.meta.url);await mkdir(out,{recursive:true});
const checks=[];let snapshotId;
async function get(route){const r=await fetch(base+route,{signal:AbortSignal.timeout(30000)});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));return body;}
const {token}=await get('/api/session');
async function command(c){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(c),signal:AbortSignal.timeout(45000)});const b=await r.json();if(!r.ok||!b.ok)throw Error(JSON.stringify(b));if(b.result?.snapshot)snapshotId=b.result.snapshot;return b.result;}
async function snapshot(){for(let n=0;n<40;n++){try{const meta=await get('/api/snapshot?snapshot='+snapshotId);const r=await fetch(base+'/api/live?snapshot='+meta.id);return unpack(Buffer.from(await r.arrayBuffer()));}catch(e){if(n===39)throw e;await new Promise(r=>setTimeout(r,25));}}}
const pixel=(s,v,x,y)=>inspectPixel(s,v,x,y);
async function load(name,source='diagnostic',frames=80){await command({action:'load-rom',name,source});await command({action:'step',frames,buttons:{}});const s=await snapshot();assert.equal(s.meta.raster.valid,true,s.meta.raster.reason);assert(s.meta.atlas.panels.every(p=>p.supported));return s;}
function pass(check,extra={}){checks.push({check,pass:true,...extra});console.log(JSON.stringify(checks.at(-1)));}
async function save(s,name){await writeFile(new URL(name+'.bin',out),s.packet);const r=await fetch(base+'/api/image?snapshot='+s.meta.id);await writeFile(new URL(name+'.png',out),Buffer.from(await r.arrayBuffer()));}
const hash=b=>createHash('sha256').update(b).digest('hex');
function outputHash(s){const a=s.meta.atlas,p=a.panels[0],rows=[];for(let y=0;y<p.height;y++)rows.push(s.payload.subarray(a.offset+(y*a.width)*4,a.offset+(y*a.width+p.width)*4));return hash(Buffer.concat(rows));}
try{
 let s=await load('rea-raster.sfc');
 assert.deepEqual(pixel(s,'bg2',10,30).rgb,[255,0,0]);assert.deepEqual(pixel(s,'bg2',10,140).rgb,[0,0,115]);
 assert.deepEqual(pixel(s,'composite',10,140).rgb,[115,0,115]);
 assert.equal(range(s.meta,s.payload,'CGRAM',2,2).bytes.readUInt16LE(),0x7c00);
 pass('Raster-time palette/brightness retained despite different end-of-frame CGRAM; final color math remains in composite');
 assert.deepEqual(pixel(s,'bg1',33,30).rgb,[0,255,0]);assert.deepEqual(pixel(s,'bg1',1,140).rgb,[0,115,0]);assert.equal(pixel(s,'bg1',33,140).nativeSamples.present,false);
 assert.equal(pixel(s,'bg2',100,30).nativeSamples.present,false);assert.equal(pixel(s,'bg2',100,140).nativeSamples.present,true);assert.equal(pixel(s,'bg2',180,140).nativeSamples.present,false);
 pass('HDMA scroll and window clipping are captured at their actual scanlines');
 assert.equal(pixel(s,'obj',8,163).nativeSamples.present,true);assert.equal(pixel(s,'obj',230,163).nativeSamples.present,false);assert(s.meta.sprites.some(o=>o.index===39&&o.x===228));
 pass('OBJ panel respects the renderer sprite limit rather than drawing every OAM entry');await save(s,'raster-hdma-atlas');
 s=await load('rea-mode7.sfc');assert.equal(s.meta.mode,7);assert.deepEqual(pixel(s,'bg1',8,8).rgb,[255,0,0]);pass('Mode 7 samples come through the native renderer');await save(s,'raster-mode7-atlas');
 s=await load('rea-hires.sfc');assert.equal(s.meta.mode,5);assert.equal(s.meta.raster.width,512);assert.equal(pixel(s,'bg2',20,20).nativeSamples.selected,'sub');assert.equal(pixel(s,'bg2',21,20).nativeSamples.selected,'main');assert.deepEqual(pixel(s,'bg2',20,20).rgb,[255,0,0]);assert.deepEqual(pixel(s,'bg2',21,20).rgb,[255,0,0]);pass('512-pixel hires preserves alternating sub/main input samples');await save(s,'raster-hires-atlas');
 s=await load('rea-interlace.sfc');assert.equal(s.meta.raster.height,448);assert.equal(s.meta.raster.fieldMask,3);assert.deepEqual(pixel(s,'bg2',8,20).rgb,[255,0,0]);assert.deepEqual(pixel(s,'bg2',8,21).rgb,[255,0,0]);pass('Interlaced output and native layer buffers agree across both fields');await save(s,'raster-interlace-atlas');
 s=await load('rea-diagnostic.sfc', 'diagnostic',60);const checkpoint='raster-integrity-'+Date.now();await command({action:'checkpoint-save',name:checkpoint});
 await command({action:'step',frames:30,buttons:{'P1 Right':true}});const on=await snapshot(),onState=await command({action:'state-hash'});
 await command({action:'checkpoint-load',name:checkpoint});await command({action:'raster-enable',enabled:false});await command({action:'step',frames:30,buttons:{'P1 Right':true}});const off=await snapshot(),offState=await command({action:'state-hash'});
 assert.equal(off.meta.raster.valid,false);assert.equal(onState.sha256,offState.sha256);assert.equal(outputHash(on),outputHash(off));assert.deepEqual(range(on.meta,on.payload,'WRAM',0,4096).bytes,range(off.meta,off.payload,'WRAM',0,4096).bytes);
 pass('Capture on/off leaves complete core savestate and framebuffer hashes unchanged',{coreStateSha256:onState.sha256,outputSha256:outputHash(on)});
 await command({action:'raster-enable',enabled:true});
 s=await load('Contra IV - The Alien Wars (USA) (Beta).sfc','roms',240);await command({action:'step',frames:120,buttons:{'P1 Start':true}});await command({action:'step',frames:240,buttons:{}});s=await snapshot();assert.equal(s.meta.raster.valid,true);assert(s.meta.atlas.panels.every(p=>p.supported));await save(s,'contra-native-atlas');pass('User-provided Contra ROM produces one synchronized six-view native capture',{frame:s.meta.frame,mode:s.meta.mode,rom:s.meta.rom});
 await writeFile(new URL('raster-report.json',out),JSON.stringify({ok:true,checks},null,2));console.log('All native PPU checks passed.');
}catch(e){await command({action:'pause'}).catch(()=>{});await writeFile(new URL('raster-report.json',out),JSON.stringify({ok:false,checks,error:e.stack},null,2));console.error(e);process.exitCode=1;}
