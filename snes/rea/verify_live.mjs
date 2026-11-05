// Actual emulator integration checks. Does not launch another emulator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {unpack,range,inspectPixel} from './protocol.mjs';
const base=process.argv[2]??'http://127.0.0.1:8900';
const out=path.join(path.dirname(fileURLToPath(import.meta.url)),'test-output');await mkdir(out,{recursive:true});
const checks=[],name='diagnostic-'+Date.now();
let commandSnapshot;
async function json(route,options){const r=await fetch(base+route,{signal:AbortSignal.timeout(30000),...options});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));return body;}
const {token}=await json('/api/session');
async function command(c){const r=await json('/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(c)});assert.equal(r.ok,true);if(r.result?.snapshot)commandSnapshot=r.result.snapshot;return r.result;}
async function snapshot(frame){
 for(let i=0;i<30;i++){
  let meta;try{meta=await json('/api/snapshot'+(commandSnapshot?'?snapshot='+commandSnapshot:''));}catch(e){if(i===29)throw e;await new Promise(r=>setTimeout(r,25));continue;}
  if(frame===undefined||meta.frame===frame){const r=await fetch(base+'/api/live?snapshot='+meta.id);assert.equal(r.status,200);return unpack(Buffer.from(await r.arrayBuffer()));}
  await new Promise(r=>setTimeout(r,25));
 }
 throw Error('Snapshot did not reach expected frame '+frame);
}
function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function digest(s){const ram=s.meta.domains.find(d=>d.name==='WRAM'),a=s.meta.atlas,p=a.panels[0];const rows=[];for(let y=0;y<p.height;y++)rows.push(s.payload.subarray(a.offset+((p.y+y)*a.width+p.x)*4,a.offset+((p.y+y)*a.width+p.x+p.width)*4));return {frame:s.meta.frame,wram:hash(s.payload.subarray(ram.offset,ram.offset+ram.size)),output:hash(Buffer.concat(rows)),playerX:range(s.meta,s.payload,'WRAM',32,1).bytes[0]};}
function pass(n,data){checks.push({check:n,pass:true,...data});console.log(JSON.stringify(checks.at(-1)));}
try{
 await command({action:'load-rom',source:'diagnostic',name:'rea-diagnostic.sfc'});
 await command({action:'pause'});
 let s=await snapshot();assert.match(s.meta.rom.name,/diagnostic/i);assert.equal(s.meta.version,'2.11.1');assert.equal(s.meta.raster.available,true);pass('Single diagnostic bridge with native PPU capture interface');
 await command({action:'record',name,start:'poweron'});
 s=await snapshot(0);assert.equal(s.meta.movie.mode,'RECORD');
 const segments=[{frames:60,buttons:{}},{frames:30,buttons:{'P1 Right':true}},{frames:15,buttons:{'P1 Left':true}},{frames:5,buttons:{}}];
 const recorded=[];let frame=0;
 for(const seg of segments){frame+=seg.frames;await command({action:'step',...seg});s=await snapshot(frame);recorded.push(digest(s));}
 const sentinel=range(s.meta,s.payload,'WRAM',16,4).bytes.toString();assert.equal(sentinel,'REA1');
 assert(recorded[1].playerX>recorded[0].playerX,'Right input must move the diagnostic object');assert(recorded[2].playerX<recorded[1].playerX,'Left input must move the diagnostic object');
 pass('Bounded input steps affect actual SNES RAM',{recorded});
 const pixels=[['composite',8,8,[255,0,0]],['bg2',8,8,[255,0,0]],['bg1',33,40,[0,255,0]],['obj',recorded.at(-1).playerX+1,49,[0,0,255]]];
 for(const [view,x,y,rgb]of pixels)assert.deepEqual(inspectPixel(s,view,x,y).rgb,rgb,view+' expected color');
 assert.equal(s.meta.atlas.panels.length,6);assert(s.meta.atlas.panels.every(p=>p.supported));assert.equal(inspectPixel(s,'bg4',8,8).nativeSamples.present,false);pass('Six native views, with absent BG4 samples captured as transparent');
 await command({action:'movie-save'});
 const inputs=await command({action:'movie-inputs',start:0,length:110});assert.equal(inputs.length,110);for(let i=0;i<110;i++){assert.equal(inputs[i].buttons['P1 Right'],i>=60&&i<90);assert.equal(inputs[i].buttons['P1 Left'],i>=90&&i<105);}pass('Movie input log contains exact requested buttons for every frame');
 await writeFile(path.join(out,name+'-inputs.json'),JSON.stringify(inputs,null,2));
 await writeFile(path.join(out,'diagnostic-capture.bin'),s.packet);
 const image=await fetch(base+'/api/image?snapshot='+s.meta.id);await writeFile(path.join(out,'diagnostic-atlas.png'),Buffer.from(await image.arrayBuffer()));
 await command({action:'movie-stop'});
 const replays=[];
 for(let replay=0;replay<2;replay++){
  await command({action:'play',name});await snapshot(0);await assert.rejects(command({action:'step',frames:1,buttons:{'P1 Right':true}}),/Read-only movie playback/);const observed=[];let frame=0;
  for(const seg of segments){frame+=seg.frames;await command({action:'step',frames:seg.frames});const q=await snapshot(frame);observed.push(digest(q));}
  assert.deepEqual(observed,recorded,'Replay '+(replay+1)+' must match all recorded WRAM/framebuffer hashes');replays.push(observed);
  await command({action:'movie-stop'});
 }
 pass('Saved BK2 replays twice with matching RAM and output hashes',{replays:2});
 const checkpoint=name+'-checkpoint';await command({action:'checkpoint-save',name:checkpoint});const saved=digest(await snapshot(110));
 await command({action:'step',frames:12,buttons:{'P1 Right':true}});const moved=digest(await snapshot(122));assert.notEqual(moved.playerX,saved.playerX);
 await command({action:'checkpoint-load',name:checkpoint});const restored=await snapshot(110);assert.deepEqual(digest(restored),saved);assert.equal(restored.meta.raster.valid,false);pass('Checkpoint restores state/output and invalidates stale native layer evidence');
 await command({action:'record',name:name+'-state',start:'checkpoint'});s=await snapshot();assert.equal(s.meta.movie.startsFromCheckpoint,true);const anchor=s.meta.frame;
 await command({action:'step',frames:12,buttons:{'P1 Right':true}});const stateRecorded=digest(await snapshot(anchor+12));await command({action:'movie-save'});await command({action:'movie-stop'});
 await command({action:'play',name:name+'-state'});const replayAnchor=(await snapshot()).meta.frame;await command({action:'step',frames:12});const stateReplay=digest(await snapshot(replayAnchor+12));assert.deepEqual(stateReplay,stateRecorded);await command({action:'movie-stop'});pass('Movie anchored to current state records and replays');
 const pendingStep=command({action:'step',frames:300,buttons:{'P1 Right':true}}).then(result=>({result}),error=>({error}));await new Promise(r=>setTimeout(r,200));await command({action:'pause'});const interrupted=await pendingStep;assert.match(interrupted.error?.message??'',/interrupted by pause/);assert.equal((await snapshot()).meta.paused,true);pass('Pause interrupts a bounded AI input run');
 const report={ok:true,base,name,checks,recorded,replays};await writeFile(path.join(out,'integration-report.json'),JSON.stringify(report,null,2));console.log('All live checks passed.');
}catch(e){await command({action:'pause'}).catch(()=>{});await writeFile(path.join(out,'integration-report.json'),JSON.stringify({ok:false,name,checks,error:e.stack},null,2));console.error(e);process.exitCode=1;}
