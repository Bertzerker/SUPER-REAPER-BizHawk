// SPDX-License-Identifier: MIT
// Run against the one REA BizHawk instance with the generated catalog diagnostic available.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {advanceFollow} from './public/catalog-follow.mjs';
import {start} from './server.mjs';
import {unpack} from './protocol.mjs';

const base=process.argv[2]??'http://127.0.0.1:8900',tag='catalog-'+randomUUID().slice(0,8);
const evidence='fastppu-sample-v1',sha=b=>createHash('sha256').update(b).digest('hex');
const out=new URL('./test-output/',import.meta.url);
const checks=[],runningObservations=[];
const {token}=await json(base,'/api/session');
async function json(host,route,options,expected=200){
 const response=await fetch(host+route,{signal:AbortSignal.timeout(95000),...options});
 assert.equal(response.status,expected,await response.clone().text());
 return response.json();
}
const get=route=>json(base,route);
const post=(route,body,status=200)=>json(base,route,{
 method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(body),
},status);
async function command(action,extra={}){
 const {result}=await post('/api/control',{action,...extra});
 if(action==='step'&&result.snapshot){
  const deadline=performance.now()+5000;
  for(;;){
   const response=await fetch(base+'/api/snapshot?snapshot='+result.snapshot);
   if(response.ok)break;
   if(performance.now()>deadline)throw Error('Stepped capture did not arrive');
   await new Promise(resolve=>setTimeout(resolve,25));
  }
 }
 return result;
}
async function latest(){
 const {snapshot}=await get('/api/catalog/current?live=1&evidence='+evidence);
 return get('/api/snapshot?snapshot='+snapshot);
}
const pick=(layer,x,y)=>({evidence,layer,x,y});
const pickAt=(snapshot,layer,x,y)=>get('/api/catalog/pick?'+new URLSearchParams({snapshot,layer,x,y}));
const view=(entry,frame,layer,instance)=>get('/api/catalog/view?'+new URLSearchParams({
 id:entry.id,revision:entry.revision,evidence,layer,snapshot:frame.id,...instance===undefined?{}:{instance},
}));
async function capture(id){
 const response=await fetch(base+'/api/live?'+new URLSearchParams({snapshot:id}));
 assert(response.ok);
 return unpack(Buffer.from(await response.arrayBuffer()));
}
function compareOutput(a,b){
 const output=s=>s.payload.subarray(s.meta.atlas.offset,s.meta.atlas.offset+s.meta.atlas.length);
 assert.equal(sha(output(a)),sha(output(b)));
}

async function renderedAfter(frame){
 const deadline=performance.now()+5000;
 for(;;){
  const response=await fetch(base+'/api/catalog/current?live=1&evidence='+evidence);
  if(response.ok){
   const {snapshot}=await response.json();
   const sample=await get('/api/snapshot?snapshot='+snapshot);
   if(!sample.paused&&sample.frame>frame)return sample;
  }
  if(performance.now()>deadline)throw Error('No later running catalog sample');
  await new Promise(resolve=>setTimeout(resolve,25));
 }
}

async function attachWhileRunning(phase,sprite,tile,movieHash=null){
 const sources=[
  {entry:sprite,layer:'obj',instance:'0'},
  {entry:tile,layer:'bg1',instance:'4260:32'},
 ];
 const owner=randomUUID();
 let pinned=false;
 await command('speed',{percent:25});
 try{
  const startFrame=(await get('/api/session')).status.live.frame;
  await command('resume');
  const first=await renderedAfter(startFrame);
  const initial=await Promise.all(sources.map(s=>view(s.entry,first,s.layer)));
  const next=await renderedAfter(first.frame);
  assert.equal(next.movie.loaded,phase==='replay');
  if(phase==='replay'){
   assert.equal(next.movie.mode,'PLAY');
   assert.equal(next.movie.readOnly,true);
   assert.equal(next.movie.loadedSha256,movieHash);
  }
  const tracked=await Promise.all(sources.map(async(s,i)=>{
   const candidate=initial[i].candidates.find(c=>c.id===s.instance);
   assert(candidate,'Could not pick '+s.layer+' occurrence');
   const current=await view(s.entry,next,s.layer,s.instance);
   const result=advanceFollow({
    candidate,status:'following',context:initial[i].context,frame:first.frame,
    generation:initial[i].generation,revision:s.entry.revision,
   },current);
   assert.equal(result.status,'following',phase+' '+s.layer);
   assert.equal(current.snapshot,next.id);
   return current;
  }));
  await post('/api/pin',{owner,slot:'catalog',generation:1,snapshot:next.id});
  pinned=true;
  const digest=sha((await capture(next.id)).packet);
  const later=await renderedAfter(next.frame);
  assert(later.frame>next.frame);
  for(let i=0;i<sources.length;i++){
   const {entry,layer,instance}=sources[i],result=tracked[i];
   const note=await post('/api/annotations/capture',{
    snapshot:next.id,catalog:{id:entry.id,revision:entry.revision,evidence,layer,instance},
   },201);
   assert.equal(note.catalog.snapshot,result.snapshot);
   assert.equal(note.files.capture.sha256,digest);
   assert.equal(note.catalog.bounds[0].id,instance);
   assert.equal(note.catalog.movie.loadedSha256,movieHash);
   assert.equal(note.catalog.movie.archiveSha256,movieHash);
   assert.equal(note.catalog.movie.previousInputRow,phase==='replay'?next.movie.timelineFrame-1:null);
   const title=tag+' '+phase+' '+entry.kind;
   const documented=await post('/api/annotations/'+note.id,{
    revision:note.revision,title,format:'markdown',category:'observation',
    body:'Followed '+layer.toUpperCase()+' occurrence '+instance+' and pinned frame '+next.frame+' while '+phase+' continued.',
   });
   assert.equal(documented.catalog.snapshot,next.id);
   const machine=(await get('/api/session')).status.live;
   assert.equal(machine.paused,false);
   assert(machine.frame>note.snapshot.frame);
   runningObservations.push({
    phase,kind:entry.kind,id:note.id,title,entryId:entry.id,revision:entry.revision,name:entry.name,
    snapshot:next.id,frame:next.frame,frameAfterAttachment:machine.frame,captureSha256:digest,
    selectorSha256:note.catalog.selectorSha256,movieFrame:note.catalog.movie.timelineFrame,
    previousInputRow:note.catalog.movie.previousInputRow,movieSha256:movieHash,
   });
  }
 }finally{
  await command('pause');
  if(pinned)await post('/api/unpin',{owner,slot:'catalog',generation:2});
  await command('speed',{percent:100});
 }
}

try{
 await command('pause');
 await command('load-rom',{source:'diagnostic',name:'rea-catalog.sfc'});
 await command('step',{frames:80,buttons:{}});
 await command('checkpoint-save',{name:tag});
 const off=await command('step',{frames:20,buttons:{'P1 Right':true}});
 const offFrame=await capture(off.snapshot),offState=await command('state-hash');
 await command('checkpoint-load',{name:tag});
 await command('catalog-capture',{enabled:true});
 const on=await command('step',{frames:20,buttons:{'P1 Right':true}});
 const onFrame=await capture(on.snapshot),onState=await command('state-hash');
 assert.equal(offState.sha256,onState.sha256,'Native catalog sampling changed the raw savestate');
 compareOutput(offFrame,onFrame);
 checks.push('Tracking off/on produces identical core savestate and atlas hashes');

 await command('record',{name:tag,start:'poweron'});
 await command('step',{frames:80,buttons:{}});
 const frames=[];
 for(let i=0;i<5;i++){
  const frame=await latest(),data=await pickAt(frame.id,'obj',67,52);
  const object=data.choices.find(s=>s.locator===0);
  assert(object);
  if(!frames.some(f=>f.object.address===object.address))frames.push({frame,object});
  if(frames.length===2)break;
  await command('step',{frames:4,buttons:{}});
 }
 assert.deepEqual(frames.map(f=>f.object.address).sort((a,b)=>a-b),[96,128]);
 const document=await get('/api/catalog?snapshot='+frames[0].frame.id);
 const created=await post('/api/catalog',{
  action:'create',revision:document.revision,kind:'sprite',name:tag+' moving sprite',snapshot:frames[0].frame.id,pick:pick('obj',67,52),
 });
 const appended=await post('/api/catalog',{
  action:'append',revision:created.document.revision,id:created.entry.id,snapshot:frames[1].frame.id,
  pick:pick('obj',67,52),paletteVariants:true,
 });
 const entry=appended.entry;
 const tile=await post('/api/catalog',{
  action:'create',revision:appended.document.revision,kind:'tile',name:tag+' repeated tile',
  snapshot:frames[1].frame.id,pick:pick('bg1',33,40),
 });
 const tileView=await view(tile.entry,frames[1].frame,'bg1');
 assert.deepEqual(tileView.candidates.map(c=>c.locator),[0x10a4,0x10ac]);
 const all=await view(entry,frames[1].frame,'obj');
 assert.deepEqual(all.candidates.map(c=>c.id),['0','1']);
 checks.push('Native tile addresses, animation alternatives, OAM slots and repeated map words match the diagnostic');

 let track={candidate:all.candidates[0],status:'following',context:all.context,frame:all.frame,generation:all.generation,revision:entry.revision};
 await command('step',{frames:8,buttons:{'P1 Right':true}});
 const movedFrame=await latest(),moved=await view(entry,movedFrame,'obj','0');
 const recordedMoved=await capture(movedFrame.id);
 track=advanceFollow(track,moved);
 assert.equal(track.status,'following');
 assert(moved.frame>all.frame&&track.candidate.x>all.candidates[0].x,
  JSON.stringify({before:all.candidates[0],after:track.candidate,frames:[all.frame,moved.frame]}));
 await command('step',{frames:4,buttons:{'P1 B':true}});
 const hidden=await view(entry,await latest(),'obj','0');
 assert.equal(advanceFollow(track,hidden).status,'missing');
 assert.equal(hidden.candidates[0].id,'1');
 await command('step',{frames:4,buttons:{'P1 Y':true}});
 const paletteFrame=await latest();
 assert.equal((await pickAt(paletteFrame.id,'obj',147,52)).choices[0].palette,144);
 checks.push('Follow retains the moving slot and stops when it is hidden; palette change is captured');

 await command('step',{frames:180,buttons:{}});
 await command('movie-save');
 const file=new URL('./movies/'+tag+'.bk2',import.meta.url);
 const movieHash=sha(await readFile(file));
 await command('movie-stop');
 await attachWhileRunning('live',entry,tile.entry);
 await command('play',{name:tag});
 await command('catalog-capture',{enabled:true});
 const replayStep=await command('step',{frames:movedFrame.frame});
 compareOutput(recordedMoved,await capture(replayStep.snapshot));
 const replayFrame=await latest();
 const replay=await view(entry,replayFrame,'obj');
 assert.equal(replayFrame.movie.loadedSha256,movieHash);
 assert.equal(replay.context===all.context,false);
 const note=await post('/api/annotations/capture',{
  snapshot:replayFrame.id,catalog:{id:entry.id,revision:entry.revision,evidence,layer:'obj',instance:'0'},
 },201);
 assert.equal(note.catalog.movie.loadedSha256,movieHash);
 assert.equal(note.catalog.movie.archiveSha256,movieHash);
 assert.equal(note.catalog.movie.previousInputRow,replayFrame.movie.timelineFrame-1);
 // Advance past the deliberate hide and palette-change input segments.
 await command('step',{frames:48});
 await attachWhileRunning('replay',entry,tile.entry,movieHash);
 assert.equal(sha(await readFile(file)),movieHash);
 let current=await get('/api/catalog?Note='+note.id);
 for(const e of [entry,tile.entry]){
  const edit=await post('/api/catalog',{action:'edit',revision:current.revision,annotation:note.id,id:e.id,name:e.name+' edited'});
  current=edit.document;
 }
 const reopened=await start({port:0,streamPort:0});
 try{
  const savedBase='http://127.0.0.1:'+reopened.port;
  const saved=await json(savedBase,'/api/annotations/'+note.id+'/catalog.json');
  assert.equal(saved.entry.name,entry.name);
  assert.equal(saved.snapshot,replayFrame.id);
  const bundle=await fetch(savedBase+'/api/annotations/'+note.id+'/investigation.zip');
  assert(bundle.ok);
  await writeFile(new URL('catalog-native-investigation.zip',out),Buffer.from(await bundle.arrayBuffer()));
  for(const expected of runningObservations){
   const route='/api/annotations/'+expected.id;
   const stored=await json(savedBase,route+'/catalog.json');
   assert.equal(stored.entry.name,expected.name);
   assert.equal(stored.entry.revision,expected.revision);
   assert.equal(stored.snapshot,expected.snapshot);
   assert.equal(stored.selectorSha256,expected.selectorSha256);
   assert.equal(stored.movie.loadedSha256,expected.movieSha256);
   const packet=await fetch(savedBase+route+'/capture.bin');
   assert(packet.ok);
   assert.equal(sha(Buffer.from(await packet.arrayBuffer())),expected.captureSha256);
   const zip=await fetch(savedBase+route+'/investigation.zip');
   assert(zip.ok);
   await writeFile(new URL('catalog-'+expected.phase+'-'+expected.kind+'.zip',out),Buffer.from(await zip.arrayBuffer()));
  }
 }finally{await reopened.close();}
 checks.push('BK2 bytes unchanged; saved replay observation and bundle retain original revision after catalog edit');
 checks.push('Sprite and BG tile follow attachments verified while ordinary play and read-only replay continued');
 const report={ok:true,checks,noteId:note.id,movieHash,runningObservations};
 console.log(JSON.stringify(report,null,2));
 await writeFile(new URL('catalog-native-report.json',out),JSON.stringify(report,null,2));
}finally{
 await command('pause').catch(()=>{});
 await command('movie-stop').catch(()=>{});
 await command('catalog-capture',{enabled:false}).catch(()=>{});
}
