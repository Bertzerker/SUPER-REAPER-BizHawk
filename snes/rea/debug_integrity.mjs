import {readFile,writeFile,readdir} from 'node:fs/promises';
import {unpack} from './protocol.mjs';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:8900',token=(await(await fetch(base+'/api/session')).json()).token;
async function c(x){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(x)});const b=await r.json();if(!r.ok)throw Error(JSON.stringify(b));return b.result;}
const files=await readdir(new URL('./checkpoints/',import.meta.url));const anchor=files.filter(f=>f.startsWith('raster-integrity-')&&f.endsWith('.State')).sort().at(-1).slice(0,-6),tag=Date.now();
for(const enabled of [true,false,true]){
 await c({action:'checkpoint-load',name:anchor});await c({action:'raster-enable',enabled});await c({action:'step',frames:30,buttons:{'P1 Right':true}});
 const phase=enabled?'on':'off',unique=phase+'-'+Date.now();const s=unpack(Buffer.from(await(await fetch(base+'/api/live')).arrayBuffer()));
 await writeFile(new URL('./test-output/integrity-'+unique+'.bin',import.meta.url),s.packet);
 await c({action:'checkpoint-save',name:'integrity-'+unique});console.log({phase,frame:s.meta.frame,hash:await c({action:'state-hash'}),wram:createHash('sha256').update(s.payload.subarray(s.meta.domains.find(d=>d.name==='WRAM').offset,s.meta.domains.find(d=>d.name==='WRAM').offset+131072)).digest('hex')});
}
