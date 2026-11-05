import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {unpack} from './protocol.mjs';
const base='http://127.0.0.1:8900',token=(await(await fetch(base+'/api/session')).json()).token,name='contra-native-'+Date.now();let id;
async function c(body){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const b=await r.json();if(!r.ok)throw Error(JSON.stringify(b));if(b.result?.snapshot)id=b.result.snapshot;return b.result;}
async function snapshot(){for(let i=0;i<40;i++){const r=await fetch(base+'/api/live?snapshot='+id);if(r.ok)return unpack(Buffer.from(await r.arrayBuffer()));await new Promise(r=>setTimeout(r,25));}throw Error('Capture unavailable');}
const hash=b=>createHash('sha256').update(b).digest('hex');
function digest(s){const a=s.meta.atlas,p=a.panels[0],ram=s.meta.domains.find(d=>d.name==='WRAM'),rows=[];for(let y=0;y<p.height;y++)rows.push(s.payload.subarray(a.offset+y*a.width*4,a.offset+(y*a.width+p.width)*4));return {frame:s.meta.frame,wram:hash(s.payload.subarray(ram.offset,ram.offset+ram.size)),output:hash(Buffer.concat(rows))};}
try{
 await c({action:'load-rom',source:'roms',name:'Contra IV - The Alien Wars (USA) (Beta).sfc'});await c({action:'record',name,start:'poweron'});
 const inputs=[{frames:240,buttons:{}},{frames:120,buttons:{'P1 Start':true}},{frames:240,buttons:{}}],recorded=[],replayed=[];let capture;
 for(const input of inputs){await c({action:'step',...input});capture=await snapshot();assert(capture.meta.raster.valid);recorded.push(digest(capture));}
 await c({action:'movie-save'});await c({action:'movie-stop'});await c({action:'play',name});
 for(const input of inputs){await c({action:'step',frames:input.frames});capture=await snapshot();replayed.push(digest(capture));}
 assert.deepEqual(replayed,recorded);assert(capture.meta.atlas.panels.every(p=>p.supported));
 await writeFile(new URL('./test-output/contra-native-atlas.bin',import.meta.url),capture.packet);
 const png=await fetch(base+'/api/image?snapshot='+capture.meta.id);await writeFile(new URL('./test-output/contra-native-atlas.png',import.meta.url),Buffer.from(await png.arrayBuffer()));
 await c({action:'movie-stop'});const report={ok:true,name,frames:600,recorded,replayed,rom:capture.meta.rom};await writeFile(new URL('./test-output/contra-movie-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await c({action:'pause'}).catch(()=>{});console.error(e);process.exitCode=1;}
