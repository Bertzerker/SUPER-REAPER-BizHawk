// Profile the same running emulator, never launch a second instance.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.argv[2]??'http://127.0.0.1:8900',tag=process.argv[3]??'profile';
const {token}=await (await fetch(base+'/api/session')).json();
const original=await(await fetch(base+'/api/snapshot')).json();
async function control(action,extra={}){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify({action,...extra})});if(!r.ok)throw Error(await r.text());return r.json();}
const reports=[];
try {
 await control('pause');
 for(const scenario of [{name:'observer-only',enabled:true,every:60},{name:'disabled',enabled:false,every:60},{name:'six-views-half-rate',enabled:true,every:2},{name:'six-views-full-rate',enabled:true,every:1}]){
  await control('raster-enable',{enabled:scenario.enabled});await control('capture-rate',{every:scenario.every});
  await control('resume');await new Promise(r=>setTimeout(r,2000));await control('pause');
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[fileURLToPath(new URL('./measure_live.mjs',import.meta.url)),base,'10'],{stdio:'inherit'});p.on('exit',c=>c?reject(Error('Measurement failed')):resolve());p.on('error',reject);});
  const result=JSON.parse(await readFile(new URL('./test-output/performance-report.json',import.meta.url)));reports.push({...scenario,...result});
  await writeFile(new URL('./test-output/'+tag+'-scenarios.json',import.meta.url),JSON.stringify(reports,null,2));
 }
}finally{await control('pause').catch(()=>{});await control('raster-enable',{enabled:original.raster?.reason!=='Native capture disabled'}).catch(()=>{});await control('capture-rate',{every:original.captureEvery??1}).catch(()=>{});}
