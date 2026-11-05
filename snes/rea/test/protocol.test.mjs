import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Framer,unpack,range,inspectPixel} from '../protocol.mjs';
import {png,websocketFrame,start,streamPacket} from '../server.mjs';
import {WordRuns,expandWords,decodeStream,StreamDecoder} from '../public/transport.mjs';

const capture=()=>readFile(new URL('./fixtures/diagnostic-capture.bin.gz',import.meta.url)).then(gunzipSync).then(unpack);
test('Actual native capture survives byte-by-byte framing and coalesced packets',async()=>{
 const s=await capture(),length=Buffer.alloc(4);length.writeUInt32LE(s.packet.length);const bytes=Buffer.concat([length,s.packet]);const frames=[];const f=new Framer(s=>frames.push(s));
 for(let i=0;i<12;i++)f.push(bytes.subarray(i,i+1));f.push(bytes.subarray(12));f.push(Buffer.concat([bytes,bytes]));
 assert.equal(frames.length,3);for(const q of frames)assert.deepEqual(q.payload,s.payload);
});
test('Malformed packet lengths and memory boundaries fail closed',async()=>{
 const s=await capture();const f=new Framer(()=>{});assert.throws(()=>f.push(Buffer.from([255,255,255,255])));
 for(const [start,length]of [[-1,1],[131072,1],[0,4097],[0.5,1],[0,NaN]])assert.throws(()=>range(s.meta,s.payload,'WRAM',start,length));
 assert.equal(range(s.meta,s.payload,'WRAM',16,4).bytes.toString(),'REA1');
});
test('PNG exports and selected pixels use correct BGRA byte order',async()=>{
 const s=await capture();assert.deepEqual(inspectPixel(s,'bg2',8,8).rgb,[255,0,0]);assert.deepEqual(inspectPixel(s,'bg1',33,40).rgb,[0,255,0]);
 const image=png(s,'composite');assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image.readUInt32BE(16),256);assert.equal(image.readUInt32BE(20),224);
 assert.throws(()=>inspectPixel(s,'bg1',256,0));assert.throws(()=>png(s,'unknown'));
});
test('WebSocket headers preserve payload length across all framing sizes',()=>{
 for(const n of [5,125,126,65535,65536,2000000]){const data=Buffer.alloc(n,17),packet=websocketFrame(data);const header=n<126?2:n<65536?4:10;assert.equal(packet.length,header+n);assert.deepEqual(packet.subarray(header),data);}
});
test('Native samples retain raster colors, channel phases and absent layers',async()=>{
 const fixture=async name=>unpack(gunzipSync(await readFile(new URL('./fixtures/'+name+'.bin.gz',import.meta.url))));
 const hdma=await fixture('raster-hdma-atlas');
 const top=inspectPixel(hdma,'bg2',10,30),bottom=inspectPixel(hdma,'bg2',10,140);
 assert.equal(top.nativeSamples.generation,hdma.meta.raster.generation);
 assert.deepEqual(top.rgb,[255,0,0]);assert.deepEqual(bottom.rgb,[0,0,115]);
 assert.equal(top.nativeSamples.main.source,'BG2');
 const absent=inspectPixel(hdma,'bg4',10,30).nativeSamples;
 assert.equal(absent.selected,null);assert.equal(absent.present,false);assert.equal(absent.main.source,null);
 const hires=await fixture('raster-hires-atlas');
 assert.equal(inspectPixel(hires,'bg2',20,20).nativeSamples.selected,'sub');
 assert.equal(inspectPixel(hires,'bg2',21,20).nativeSamples.selected,'main');
});
test('HTTP history, retained evidence, diff and control origin/token checks',async()=>{
 const app=await start({port:0,streamPort:0});
 try{
  const original=await capture();app.publish(original);const base=`http://127.0.0.1:${app.port}`;
  const old=await(await fetch(base+'/api/snapshot')).json();
  for(let i=0;i<20;i++){const payload=Buffer.from(original.payload);const d=original.meta.domains.find(d=>d.name==='WRAM');payload[d.offset+16]=i;app.publish({...original,payload,meta:{...original.meta,id:'a'.repeat(32)+'-'+i,frame:200+i}});}
  const memory=await(await fetch(base+`/api/memory?snapshot=${old.id}&start=16&length=4`)).json();assert.equal(memory.hex,'52454131');
  const diff=await(await fetch(base+`/api/diff?from=${old.id}&start=16&length=4`)).json();assert.deepEqual(diff.changes,[{offset:16,before:82,after:19}]);
  assert.equal((await fetch(base+'/api/memory?length=99999')).status,400);
  assert.equal((await fetch(base+'/api/snapshot?snapshot=expired')).status,404);
  assert.equal((await fetch(base+'/api/session',{headers:{Origin:'https://example.org'}})).status,403);
  assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"resume"}'})).status,403);
  assert.equal(app.stats().retained,16);
 }finally{await app.close();}
});
test('Compact stream is lossless and leaves full native evidence intact',async()=>{
 const s=unpack(gunzipSync(await readFile(new URL('./fixtures/raster-hdma-atlas.bin.gz',import.meta.url)))),before=Buffer.from(s.packet);
 const packet=streamPacket(s),decoded=decodeStream(packet);
 assert.deepEqual(Buffer.from(decoded.bytes),s.payload.subarray(0,s.meta.raster.offset));
 const compactPixel=inspectPixel({meta:decoded.meta,payload:Buffer.from(decoded.bytes)},'bg2',10,30);assert.deepEqual(compactPixel.rgb,[255,0,0]);assert.equal(compactPixel.nativeSamples,null);
 assert.equal(decoded.meta.id,s.meta.id);assert.equal(decoded.meta.raster.length,0);assert.equal(decoded.meta.raster.streamed,false);
 assert.deepEqual(s.packet,before);assert(s.meta.raster.length>0);assert.equal(inspectPixel(s,'bg2',10,30).nativeSamples.main.source,'BG2');
 assert(packet.length<s.packet.length/2);
});
test('Word runs round-trip repeated, literal and adversarial payloads',()=>{
 const encoder=new WordRuns();
 for(const words of [[],[1],[1,1],[1,1,1],[0,0,0,1,2,3,4,4,4,4,5],Array.from({length:10000},(_,i)=>i),Array(10000).fill(0xffffffff)]){
  const data=Buffer.alloc(words.length*4);words.forEach((v,i)=>data.writeUInt32LE(v,i*4));
  const encoded=encoder.encode(data);assert.deepEqual(Buffer.from(encoded.codec==='raw'?encoded.bytes:expandWords(encoded.bytes,data.length)),data);
  assert(encoded.bytes.length<=data.length);
 }
 assert.throws(()=>expandWords(new Uint8Array([0,0,0,0]),4));
 assert.throws(()=>expandWords(new Uint8Array([1,0,0,128]),4));
 assert.throws(()=>expandWords(new Uint8Array([2,0,0,128,0,0,0,0]),4));
 assert.throws(()=>expandWords(new Uint8Array(),4));
});
test('Decoder leases isolate queued frames and reuse only released storage',async()=>{
 const s=await capture(),packet=streamPacket(s),decoder=new StreamDecoder();
 const a=decoder.decode(packet),b=decoder.decode(packet);assert.notEqual(a.bytes.buffer,b.bytes.buffer);
 const copy=Buffer.from(b.bytes);decoder.release(a);const c=decoder.decode(packet);
 assert.equal(c.bytes.buffer,a.bytes.buffer);assert.deepEqual(Buffer.from(b.bytes),copy);
 decoder.release(c);decoder.release(c);assert.equal(decoder.free.length,1);
 decoder.release(b);
});
