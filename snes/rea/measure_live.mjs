// Measure the real binary WebSocket path for a short, automatically paused run.
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {StreamDecoder} from './public/transport.mjs';
const measureDecoder=new StreamDecoder();
const base=process.argv[2]??'http://127.0.0.1:8900',seconds=Number(process.argv[3]??10);
if(seconds<2||seconds>300)throw Error('Measurement duration must be 2..300 seconds');
const url=new URL(base),frames=[],costs=[],encoded=[],samples=[];let bytes=Buffer.alloc(0),upgraded=false,measuring=false;
async function get(route){return(await fetch(base+route)).json();}
const {token}=await get('/api/session');
async function command(action,extra={}){const r=await fetch(base+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify({action,...extra})});if(!r.ok)throw Error(await r.text());return r.json();}
const socket=net.connect(Number(url.port),url.hostname);
socket.on('connect',()=>socket.write(`GET /stream HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${base}\r\n\r\n`));
let resolveUpgrade,rejectUpgrade;const connected=new Promise((resolve,reject)=>{resolveUpgrade=resolve;rejectUpgrade=reject;});
socket.on('error',rejectUpgrade);
socket.on('data',chunk=>{
 bytes=Buffer.concat([bytes,chunk]);
 if(!upgraded){const i=bytes.indexOf('\r\n\r\n');if(i<0)return;if(!bytes.subarray(0,i).toString().startsWith('HTTP/1.1 101')){rejectUpgrade(Error('WebSocket upgrade failed'));return;}bytes=bytes.subarray(i+4);upgraded=true;resolveUpgrade();}
 while(bytes.length>=2){let n=bytes[1]&127,h=2;if(n===126){if(bytes.length<4)return;n=bytes.readUInt16BE(2);h=4;}else if(n===127){if(bytes.length<10)return;n=Number(bytes.readBigUInt64BE(2));h=10;}if(n>32*1024*1024)throw Error('Oversized frame');if(bytes.length<h+n)return;const b=bytes.subarray(h,h+n);bytes=bytes.subarray(h+n);const s=measureDecoder.decode(b);if(measuring&&!s.meta.paused){frames.push({id:s.meta.id,frame:s.meta.frame,generation:s.meta.raster?.generation,valid:s.meta.raster?.valid,renderFrame:s.meta.raster?.renderFrame,time:performance.now()});costs.push(s.meta.capture_ms);encoded.push(s.meta.encode_ms??0);}measureDecoder.release(s);}
});
try{
 await connected;await command('pause');const initial=await get('/api/snapshot'),statsBefore=await get('/api/metrics');
 await command('resume');const start=performance.now();measuring=true;
 for(let end=start+seconds*1000;performance.now()<end;){await new Promise(r=>setTimeout(r,Math.min(5000,end-performance.now())));samples.push({time:performance.now(),...await get('/api/metrics')});}measuring=false;await command('pause');
 const elapsed=(performance.now()-start)/1000,final=await get('/api/snapshot'),statsAfter=await get('/api/metrics');
 const ordered=[...costs].sort((a,b)=>a-b),intervals=frames.slice(1).map((f,i)=>f.time-frames[i].time).sort((a,b)=>a-b);
 const span=frames.length>1?(frames.at(-1).time-frames[0].time)/1000:elapsed,nominal=final.timing?.fps??0,sourceFps=frames.length>1?(frames.at(-1).frame-frames[0].frame)/span:0;
 const viewerReports=[];for(const viewer of samples[0]?.viewers??[]){const end=samples.at(-1).viewers?.find(v=>v.id===viewer.id);if(end&&end.at>viewer.at)viewerReports.push({id:viewer.id,duration_seconds:(end.at-viewer.at)/1000,displayed_per_second:(end.displayed-viewer.displayed)/((end.at-viewer.at)/1000),received_per_second:(end.received-viewer.received)/((end.at-viewer.at)/1000),replaced:end.replaced-viewer.replaced,last_rate:end.rate,last_p95_ms:end.p95,frozen:end.frozen});}
 const report={duration_seconds:elapsed,emulated_fps:sourceFps,wall_emulated_fps:(final.frame-initial.frame)/elapsed,nominal_fps:nominal,region:final.timing?.region,emulation_speed_percent:nominal?sourceFps/nominal*100:null,websocket_captures_per_second:(frames.length-1)/span,unique_ids:new Set(frames.map(f=>f.id)).size,captureEvery:final.captureEvery,capture_p95_ms:ordered[Math.floor(ordered.length*.95)],encode_p95_ms:encoded.sort((a,b)=>a-b)[Math.floor(encoded.length*.95)],transport_interval_p95_ms:intervals[Math.floor(intervals.length*.95)],server_drops:statsAfter.dropped-statsBefore.dropped,invalid_packets:statsAfter.invalid-statsBefore.invalid,invalid_native_frames:frames.filter(f=>!f.valid||f.renderFrame!==f.frame).length,source_gaps:frames.slice(1).reduce((n,f,i)=>n+Math.max(0,f.frame-frames[i].frame-final.captureEvery),0),duplicate_source_frames:frames.slice(1).filter((f,i)=>f.frame===frames[i].frame).length,stream_megabytes_per_second:(statsAfter.streamBytes-statsBefore.streamBytes)/elapsed/1e6,source_megabytes_per_second:(statsAfter.sourceBytes-statsBefore.sourceBytes)/elapsed/1e6,viewers:viewerReports,frames_received:frames.length,frame_start:initial.frame,frame_end:final.frame,samples};
 const windowRates=[];for(let at=frames[0]?.time;at+5000<=(frames.at(-1)?.time??0);at+=5000)windowRates.push(frames.filter(f=>f.time>=at&&f.time<at+5000).length/5);
 report.minimum_five_second_capture_rate=windowRates.length?Math.min(...windowRates):null;
 report.catalog_identity_packets=(statsAfter.identityFrames??0)-(statsBefore.identityFrames??0);
 report.catalog_identity_megabytes_per_second=((statsAfter.identityBytes??0)-(statsBefore.identityBytes??0))/elapsed/1e6;
 const viewerWindows=[];for(let i=1;i<samples.length;i++)for(const old of samples[i-1].viewers??[]){const v=samples[i].viewers?.find(v=>v.id===old.id);if(v&&v.at>old.at&&!v.frozen)viewerWindows.push((v.displayed-old.displayed)/((v.at-old.at)/1000));}
 report.minimum_five_second_viewer_rate=viewerWindows.length?Math.min(...viewerWindows):null;
 report.full_speed_pass=report.captureEvery===1&&report.emulation_speed_percent>=99&&report.emulation_speed_percent<=101&&report.websocket_captures_per_second>=nominal*.99&&!report.server_drops&&!report.invalid_packets&&!report.invalid_native_frames&&!report.source_gaps&&!report.duplicate_source_frames&&report.minimum_five_second_capture_rate>=nominal*.99&&report.viewers.some(v=>!v.frozen&&v.displayed_per_second>=Math.min(60,nominal)*.99)&&report.minimum_five_second_viewer_rate>=Math.min(60,nominal)*.99;
 const reportName=process.argv[4]??'performance-report.json';
 await writeFile(new URL('./test-output/'+reportName,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:report.samples.length},null,2));
 if(report.invalid_packets||!frames.length||process.argv.includes('--assert-full-speed')&&!report.full_speed_pass)process.exitCode=1;
}finally{measuring=false;await command('pause').catch(()=>{});socket.destroy();}


