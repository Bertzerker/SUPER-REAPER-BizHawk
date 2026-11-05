import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SelectionRequest,memoryRange,comparisonReason,actionReason,checkpointReason} from '../public/model.mjs';
import {unpack} from '../protocol.mjs';
import {start} from '../server.mjs';
const fixture=async()=>unpack(gunzipSync(await readFile(new URL('./fixtures/diagnostic-capture.bin.gz',import.meta.url))));
test('Delayed pixel lookups cannot overwrite a newer pinned selection',async()=>{
 const model=new SelectionRequest(),context={meta:{id:'capture-A'}},pending=[];
 const lookup=(c,p)=>new Promise(resolve=>pending.push(()=>resolve({snapshot:c.meta.id,...p}))),pin=async()=>{};
 const a=model.select(context,{view:'bg1',x:1,y:2},pin,lookup);await Promise.resolve();
 const b=model.select(context,{view:'bg2',x:3,y:4},pin,lookup);await Promise.resolve();
 pending[1]();assert.equal((await b).point.view,'bg2');pending[0]();assert.equal(await a,null);
 const c=model.select(context,{view:'obj',x:1,y:1},pin,lookup);await Promise.resolve();model.invalidate();pending[2]();assert.equal(await c,null);
});
test('Memory ranges include final domain bytes and comparison rejects incompatible evidence',async()=>{
 const {meta}=await fixture();for(const space of ['OAM','CGRAM','WRAM']){const d=meta.domains.find(d=>d.name===space);assert.equal(memoryRange(meta,space,d.size-1,128).length,1);assert.throws(()=>memoryRange(meta,space,d.size,128));}
 assert.equal(comparisonReason(meta,meta,'WRAM'),'');assert.match(comparisonReason(meta,{...meta,rom:{hash:'different'}},'WRAM'),/Different ROM/);
 assert.match(comparisonReason(meta,{...meta,core:'different'},'WRAM'),/core/);
});
test('Execution availability distinguishes missing producer, recording, playback, pending and uncertain outcomes',()=>{
 const live={movie:{loaded:false}},state={server:true,producer:true,live};
 assert.match(actionReason('resume',{server:true}),/Waiting for emulator/);assert.equal(actionReason('resume',state),'');
 assert.match(actionReason('record',{...state,live:{movie:{loaded:true,mode:'RECORD'}}}),/Save and stop/);
 assert.match(actionReason('experiment',{...state,live:{movie:{loaded:true,readOnly:true}}}),/owns input/);
 assert.equal(actionReason('step',{...state,live:{movie:{loaded:true,readOnly:true}}}),'');
 assert.match(actionReason('resume',{...state,pending:'step'}),/pending/);assert.equal(actionReason('pause',{...state,pending:'step',uncertain:true}),'');assert.match(actionReason('step',{...state,uncertain:true}),/unknown/);
});
test('Server reports producer state accurately; leased evidence survives history eviction and rejects old pin generations',async()=>{
 const app=await start({port:0,streamPort:0}),base=`http://127.0.0.1:${app.port}`;let socket;
 try{
  const session=await(await fetch(base+'/api/session')).json();assert.equal(session.status.producerConnected,false);assert.equal(session.status.live,null);assert.equal(session.features.trace.support,'unsupported');
  socket=net.connect(app.streamPort,'127.0.0.1');await new Promise(r=>socket.once('connect',r));const s=await fixture(),prefix=Buffer.alloc(4);prefix.writeUInt32LE(s.packet.length);socket.write(Buffer.concat([prefix,s.packet]));
  let state;for(let i=0;i<100;i++){state=await(await fetch(base+'/api/session')).json();if(state.status.lastCapture)break;await new Promise(r=>setTimeout(r,10));}assert(state.status.producerConnected);assert(state.status.lastCapture.fromCurrentProducer);
  const owner='12345678-1234-1234-1234-123456789abc',post=body=>fetch(base+'/api/pin',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':session.token},body:JSON.stringify(body)});
  assert.equal((await post({owner,slot:'evidence',generation:2,snapshot:s.meta.id})).status,200);
  for(let i=0;i<50;i++)app.publish({...s,meta:{...s.meta,id:'c'.repeat(32)+'-'+i}});
  assert.equal((await fetch(base+'/api/snapshot?snapshot='+s.meta.id)).status,200);assert.equal((await post({owner,slot:'evidence',generation:1,snapshot:s.meta.id})).status,409);
  socket.end();for(let i=0;i<100;i++){state=await(await fetch(base+'/api/session')).json();if(!state.status.producerConnected)break;await new Promise(r=>setTimeout(r,10));}assert.equal(state.status.producerConnected,false);assert.equal(state.status.live,null);assert(state.status.lastCapture.stale);
 }finally{socket?.destroy();await app.close();}
});
test('Saved-to-saved memory comparison and exported ZIP verify independently after restart',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rea-workbench-'));let app=await start({port:0,streamPort:0,root});
 try{
  let base=`http://127.0.0.1:${app.port}`,token=(await(await fetch(base+'/api/session')).json()).token;
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(body)});assert(r.ok,await r.clone().text());return r.json();};
  const s=await fixture();s.meta.movie={loaded:false};app.publish(s);const a=await post('/api/annotations/capture',{snapshot:s.meta.id});
  const payload=Buffer.from(s.payload),d=s.meta.domains.find(d=>d.name==='WRAM');payload[d.offset+16]=7;const m={...s.meta,id:'e'.repeat(32)+'-1'},j=Buffer.from(JSON.stringify(m)),p=Buffer.alloc(4);p.writeUInt32LE(j.length);const next=unpack(Buffer.concat([p,j,payload]));app.publish(next);const b=await post('/api/annotations/capture',{snapshot:next.meta.id});
  await app.close();app=await start({port:0,streamPort:0,root});base=`http://127.0.0.1:${app.port}`;
  const diff=await(await fetch(base+`/api/compare?fromNote=${a.id}&toNote=${b.id}&space=WRAM&start=16&length=4`)).json();assert.equal(diff.changes.length,1);assert.equal(diff.changes[0].after,7);assert.equal(diff.from.id,a.snapshot.id);assert.equal(diff.to.id,b.snapshot.id);
  const response=await fetch(base+`/api/annotations/${b.id}/investigation.zip`);assert.equal(response.status,200);const file=path.join(root,'investigation.zip');await writeFile(file,Buffer.from(await response.arrayBuffer()));
  const python=process.env.REA_PYTHON,check=spawnSync(python,[fileURLToPath(new URL('../verify_bundle.py',import.meta.url)),file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);assert(JSON.parse(check.stdout).ok);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('Checkpoint compatibility is re-evaluated against the current machine identity',()=>{
 const live={rom:{hash:'rom'},core:'bsnes',version:'2.11.1',identity:{sync:'ntsc',native:'binary'}};
 const info={rom:'rom',core:'bsnes',version:'2.11.1',sync:'ntsc',native:'binary'};
 assert.equal(checkpointReason(info,live),'');
 assert.match(checkpointReason(info,{...live,identity:{...live.identity,sync:'pal'}}),/synchronization/);
 assert.match(checkpointReason({...info,native:'other'},live),/native core binary/);
 assert.match(checkpointReason(info,null),/Connect emulator/);
});
