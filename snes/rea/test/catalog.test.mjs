// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {unpack} from '../protocol.mjs';
import {start,streamPacket} from '../server.mjs';
import {decodeStream} from '../public/transport.mjs';
import {advanceFollow} from '../public/catalog-follow.mjs';

const evidence='fastppu-sample-v1';
const pick=(layer,x,y)=>({evidence,layer,x,y});

// The existing original diagnostic provides a real atlas and memory packet.
// Inject known identity words to exercise the wire format and API independently of BizHawk.
async function capture(frame=110,sequence=110,address=96){
 const base=unpack(gunzipSync(await readFile(new URL('./fixtures/diagnostic-capture.bin.gz',import.meta.url))));
 const meta=structuredClone(base.meta),n=meta.raster.width*meta.raster.height;
 const payload=Buffer.concat([base.payload,Buffer.alloc(n*80)]);
 meta.frame=frame;meta.id=meta.session+'-'+sequence;meta.sequence=sequence;
 meta.catalogContext={epoch:1,rasterEpoch:2,enabled:true,available:true};
 meta.sampleIdentity={schema:1,status:'captured',offset:base.payload.length,length:n*80,interval:4};
 meta.movie={...meta.movie,filename:'diagnostic.bk2',timelineFrame:frame,mode:'PLAY'};
 function sample(plane,x,y,pattern,locator,palette){
  const i=y*256+x;
  payload.writeUInt32LE(0x8001,meta.raster.offset+((plane+1)*n+i)*4);
  const start=meta.sampleIdentity.offset+(plane*n+i)*8;
  payload.writeUInt32LE(pattern/2|(locator<<15),start);
  payload.writeUInt32LE((0x80000000|palette|(4<<8)|(1<<14))>>>0,start+4);
 }
 sample(8,65,51,address,0,128);sample(8,145,51,address,1,128);
 sample(0,33,40,32,0x10a4,0);sample(0,97,40,32,0x10ac,0);
 const json=Buffer.from(JSON.stringify(meta)),size=Buffer.alloc(4);
 size.writeUInt32LE(json.length);
 return unpack(Buffer.concat([size,json,payload]));
}

test('Catalog writes are revision checked, scoped, restart safe, and independent of attached evidence',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rea-catalog-'));
 let app;
 try{
  app=await start({port:0,streamPort:0,root});
  let base='http://127.0.0.1:'+app.port;
  const get=async(route,status=200)=>{
   const r=await fetch(base+route);
   assert.equal(r.status,status,await r.clone().text());
   return r.json();
  };
  const post=async(route,input,status=200)=>{
   const {token}=await get('/api/session');
   const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(input)});
   assert.equal(r.status,status,await r.clone().text());
   return r.json();
  };
  const first=await capture(),next=await capture(114,114,128);
  app.publish(first);
  assert.equal(decodeStream(streamPacket(first)).bytes.length,first.meta.raster.offset);
  const original=await post('/api/catalog',{action:'create',revision:0,snapshot:first.meta.id,name:'Two blue objects',kind:'sprite',pick:pick('obj',65,51)});
  const id=original.entry.id;
  await post('/api/catalog',{action:'edit',revision:0,id,snapshot:first.meta.id,name:'Stale'},409);
  app.publish(next);
  const appended=await post('/api/catalog',{action:'append',revision:1,id,snapshot:next.meta.id,pick:pick('obj',65,51),paletteVariants:true});
  assert.deepEqual(appended.entry.selectors.map(s=>[s.address,s.palette]),[[96,128],[128,null]]);
  const sprite=await get('/api/catalog/view?'+new URLSearchParams({id,revision:2,evidence,layer:'obj',snapshot:next.meta.id}));
  assert.deepEqual(sprite.candidates.map(s=>s.id),['0','1']);
  assert.equal(sprite.matched,2);
  const tile=await post('/api/catalog',{action:'create',revision:2,snapshot:next.meta.id,name:'Repeated tile',kind:'tile',pick:pick('bg1',33,40)});
  const tileView=await get('/api/catalog/view?'+new URLSearchParams({id:tile.entry.id,evidence,layer:'bg1',snapshot:next.meta.id}));
  assert.deepEqual(tileView.candidates.map(s=>s.locator),[0x10a4,0x10ac]);
  const note=await post('/api/annotations/capture',{snapshot:next.meta.id,catalog:{id,revision:2,evidence,layer:'obj',instance:'0'}},201);
  assert.equal(note.catalog.snapshot,next.meta.id);
  assert.equal(note.catalog.movie.previousInputRow,113);
  assert.deepEqual(note.catalog.bounds.map(s=>s.id),['0']);
  await post('/api/catalog',{action:'edit',revision:3,id,snapshot:next.meta.id,name:'Renamed'});
  const wrong=await capture(118,118);
  wrong.meta.rom={...wrong.meta.rom,hash:'0'.repeat(40)};
  app.publish(wrong);
  await get('/api/catalog/view?'+new URLSearchParams({id,evidence,layer:'obj',snapshot:wrong.meta.id}),404);
  await app.close();app=await start({port:0,streamPort:0,root});base='http://127.0.0.1:'+app.port;
  const saved=await get('/api/annotations/'+note.id+'/catalog.json');
  assert.equal(saved.entry.name,'Two blue objects');
  assert.equal(saved.entry.revision,2);
  assert.equal((await get('/api/catalog?Note='+note.id)).entries.find(e=>e.id===id).name,'Renamed');
  const zip=await fetch(base+'/api/annotations/'+note.id+'/investigation.zip');
  assert.equal(zip.status,200);
  const output=path.join(root,'investigation.zip');
  await writeFile(output,Buffer.from(await zip.arrayBuffer()));
  const verifier=fileURLToPath(new URL('../verify_bundle.py',import.meta.url));
  const checked=spawnSync(process.env.REA_PYTHON,[verifier,output],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
  assert.equal(JSON.parse(checked.stdout).files,11);
 }finally{
  if(app)await app.close();
  await rm(root,{recursive:true,force:true});
 }
});

test('Follow retains the chosen locator through motion and stops on absence, ambiguity or seeks',()=>{
 const object={id:'0',x:60,y:48,width:8,height:8,mode:1,bpp:4,hflip:false,vflip:false};
 const track={status:'following',context:'current',revision:2,frame:4,generation:20,candidate:object};
 const next={context:'current',revision:2,frame:8,generation:24,candidates:[{...object,x:64},{...object,id:'1',x:144}]};
 assert.equal(advanceFollow(track,next).candidate.x,64);
 const missing=advanceFollow(track,{...next,candidates:next.candidates.slice(1)});
 assert.equal(missing.status,'missing');
 assert.equal(advanceFollow(missing,next).status,'missing');
 assert.equal(advanceFollow(track,{...next,candidates:[{...object,x:140}]}).status,'lost');
 assert.equal(advanceFollow(track,{...next,candidates:[...next.candidates,{...object,id:'2',x:62}]}).status,'ambiguous');
 assert.equal(advanceFollow(track,{...next,generation:21}).status,'discontinuity');
 assert.equal(advanceFollow(track,{...next,context:'reset'}).status,'discontinuity');
});
