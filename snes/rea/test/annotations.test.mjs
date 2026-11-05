import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Annotations} from '../annotations.mjs';
import {unpack} from '../protocol.mjs';
import {png,start} from '../server.mjs';
const fixture=async()=>unpack(gunzipSync(await readFile(new URL('./fixtures/diagnostic-capture.bin.gz',import.meta.url))));
test('Frame comments preserve render, complete memory, movie position and immutable capture across restart',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rea-notes-'));
 try{
  const store=new Annotations(root,png),s=await fixture();s.meta.movie.timelineFrame=s.meta.frame;
  const movie=Buffer.from('archived movie input bytes'),note=await store.capture(s,movie);
  assert.equal(note.snapshot.frame,s.meta.frame);assert.equal(note.movie.timelineFrame,s.meta.frame);assert.equal(note.movie.previousInputRow,s.meta.frame-1);
  assert.deepEqual(await store.file(note.id,'capture.bin'),s.packet);assert.deepEqual(await store.file(note.id,'memory.bin'),s.payload.subarray(0,s.meta.atlas.offset));
  assert.deepEqual(await store.file(note.id,'atlas.png'),png(s));assert.deepEqual(await store.file(note.id,'movie.bk2'),movie);
  const edited=await store.update(note.id,{revision:1,title:'Movement hypothesis',format:'markdown',body:'# Observation\n```json\n{"x":64}\n```\n```mermaid\nflowchart LR\n A --> B\n```'});
  assert.equal(edited.revision,2);assert.equal(edited.files.capture.sha256,note.files.capture.sha256);
  assert.match((await store.file(note.id,'comment.md')).toString(),new RegExp('movie_frame: '+s.meta.frame));
  await assert.rejects(store.update(note.id,{revision:1,body:'stale'}),/changed in another tab/);
  await assert.rejects(store.update(note.id,{revision:2,format:'json',body:'{broken'}));
  const restarted=new Annotations(root,png);assert.equal((await restarted.list())[0].body,edited.body);assert.deepEqual((await restarted.snapshot(note.id)).packet,s.packet);
  await assert.rejects(restarted.file(note.id,'../../outside'));await assert.rejects(restarted.get('../outside'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Comment HTTP API requires a token and reloads saved memory after live evidence expires',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rea-note-http-'));let app=await start({port:0,streamPort:0,root});
 try{
  const original=await fixture(),s={...original,meta:{...original.meta,movie:{loaded:false}}};app.publish(s);
  let base=`http://127.0.0.1:${app.port}`;const session=await(await fetch(base+'/api/session')).json();
  const post=async(route,body,token=session.token)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(body)});
  assert.equal((await post('/api/annotations/capture',{snapshot:s.meta.id},'wrong')).status,403);
  const response=await post('/api/annotations/capture',{snapshot:s.meta.id});assert.equal(response.status,201);const note=await response.json();
  assert.equal((await post('/api/annotations/'+note.id,{revision:1,format:'json',body:'{"observed":true}'})).status,200);
  for(let i=0;i<40;i++)app.publish({...s,meta:{...s.meta,id:'b'.repeat(32)+'-'+i}});
  await app.close();app=await start({port:0,streamPort:0,root});base=`http://127.0.0.1:${app.port}`;
  const list=await(await fetch(base+'/api/annotations')).json();assert.equal(list.length,1);assert.equal(list[0].id,note.id);
  const memory=await(await fetch(base+`/api/annotations/${note.id}/memory?space=WRAM&start=16&length=4`)).json();assert.equal(memory.hex,'52454131');
  const packet=Buffer.from(await(await fetch(base+`/api/annotations/${note.id}/capture.bin`)).arrayBuffer());assert.deepEqual(packet,s.packet);
  assert.equal((await fetch(base+`/api/annotations/${note.id}/atlas.png`)).headers.get('content-type'),'image/png');
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
