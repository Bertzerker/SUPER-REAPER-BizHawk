// Detached worker buffers must never mutate already-published evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {unpack} from './protocol.mjs';
const base=process.argv[2]??'http://127.0.0.1:8900';
const {token}=await(await fetch(base+'/api/session')).json();
async function command(action,extra={}){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify({action,...extra})});if(!r.ok)throw Error(await r.text());return (await r.json()).result;}
async function packet(id){const r=await fetch(base+'/api/live?snapshot='+id);assert(r.ok);return Buffer.from(await r.arrayBuffer());}
const hash=b=>createHash('sha256').update(b).digest('hex');
await command('pause');
const old=await(await fetch(base+'/api/snapshot')).json(),bytes=await packet(old.id),digest=hash(bytes);
try {
 assert(old.raster.valid);const result=await command('step',{frames:180,buttons:{}});
 for(let n=0;n<40;n++){
  const r=await fetch(base+'/api/snapshot?snapshot='+result.snapshot);if(r.ok)break;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 const fresh=unpack(await packet(result.snapshot));assert(fresh.meta.raster.valid);assert(fresh.meta.atlas.panels.every(p=>p.supported));assert.equal(fresh.meta.raster.renderFrame,fresh.meta.frame);
 assert.equal(hash(await packet(old.id)),digest);
 const report={ok:true,oldId:old.id,newId:fresh.meta.id,frames:fresh.meta.frame-old.frame,pinnedPacketSha256:digest};
 await writeFile(new URL('./test-output/pool-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await command('pause').catch(()=>{});}
