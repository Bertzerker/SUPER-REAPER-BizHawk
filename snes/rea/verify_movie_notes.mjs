// Integration test against the existing single BizHawk process.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'http://127.0.0.1:8900',name='comment-test-'+Date.now();
async function get(route){const r=await fetch(base+route);if(!r.ok)throw Error(await r.text());return r.json();}
const {token}=await get('/api/session');
async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-REA-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(await r.text());return r.json();}
const c=async(action,extra={})=>(await post('/api/control',{action,...extra})).result;
const hash=b=>createHash('sha256').update(b).digest('hex');
const checks=[];
try{
 await c('load-rom',{source:'diagnostic',name:'rea-diagnostic.sfc'});await c('record',{name,start:'poweron'});await c('step',{frames:60,buttons:{'P1 Right':true}});
 const note=await post('/api/annotations/capture',{});assert.equal(note.snapshot.frame,60);assert.equal(note.movie.timelineFrame,60);assert.equal(note.movie.previousInputRow,59);assert(note.movie.archived);assert(note.snapshot.native);
 const memory=await get(`/api/annotations/${note.id}/memory?space=WRAM&start=16&length=4`);assert.equal(memory.hex,'52454131');checks.push('Capture pauses, saves movie, and binds native render + memory to movie frame 60 / input row 59');
 const body='# Frame 60\n\n**Input observation**\n\n```json\n{"button":"P1 Right","frames":60}\n```\n\n```mermaid\nflowchart LR\n Input --> Movement\n Movement --> Render\n```';
 const markdown=await post('/api/annotations/'+note.id,{revision:1,title:'Test: frame-linked movie note',format:'markdown',body});assert.equal(markdown.revision,2);
 const json=await post('/api/annotations/'+note.id,{revision:2,title:'Test: frame-linked movie note',format:'json',body:'{"observed":true,"frame":60}'});assert.equal(json.revision,3);
 const mermaid=await post('/api/annotations/'+note.id,{revision:3,title:'Test: frame-linked movie note',format:'mermaid',body:'flowchart LR\n Input --> Render'});assert.equal(mermaid.revision,4);
 await post('/api/annotations/'+note.id,{revision:4,title:'Test: frame-linked movie note',format:'markdown',body});checks.push('Markdown, JSON and Mermaid notes save with revision protection');
 await c('step',{frames:120,buttons:{}});assert.equal((await get(`/api/annotations/${note.id}/memory?space=WRAM&start=16&length=4`)).hex,'52454131');
 const archiveResponse=await fetch(base+`/api/annotations/${note.id}/movie.bk2`);assert.equal(archiveResponse.status,200);const archive=Buffer.from(await archiveResponse.arrayBuffer());assert.equal(hash(archive),note.movie.sha256);checks.push('Archived BK2 hash and persistent evidence survive later frames');
 await c('movie-stop');await c('play',{name});await c('speed',{percent:25});await c('resume');await new Promise(r=>setTimeout(r,1000));await c('pause');
 const slow=await get('/api/snapshot');assert.equal(slow.playback.speedPercent,25);assert(slow.frame>=7&&slow.frame<=30,'Quarter speed should advance about 15 frames per second');
 await c('play',{name});await c('speed',{percent:100});await c('resume');await new Promise(r=>setTimeout(r,500));await c('pause');
 const normal=await get('/api/snapshot');assert(normal.frame>slow.frame);assert.equal(normal.playback.speedPercent,100);checks.push('Play, pause, readonly restart and quarter-speed playback work');
 await c('movie-stop');await c('record',{name:name+'-state',start:'checkpoint'});await c('step',{frames:5,buttons:{}});
 const stateNote=await post('/api/annotations/capture',{});assert.equal(stateNote.movie.timelineFrame,5);assert.equal(stateNote.movie.previousInputRow,4);assert(stateNote.movie.startsFromCheckpoint);checks.push('Savestate-anchored movies use their own frame numbering');
 await c('movie-stop');await c('load-rom',{source:'roms',name:'Contra IV - The Alien Wars (USA) (Beta).sfc'});await c('step',{frames:240,buttons:{}});await c('step',{frames:120,buttons:{'P1 Start':true}});await c('step',{frames:1200,buttons:{}});
 await writeFile(new URL('./test-output/movie-notes-report.json',import.meta.url),JSON.stringify({ok:true,name,noteId:note.id,stateNoteId:stateNote.id,quarterSpeedFrames:slow.frame,normalSpeedFrames:normal.frame,checks},null,2));console.log(JSON.stringify({ok:true,name,noteId:note.id,stateNoteId:stateNote.id,checks}));
}catch(e){console.error(e);await writeFile(new URL('./test-output/movie-notes-report.json',import.meta.url),JSON.stringify({ok:false,error:e.stack,checks},null,2));process.exitCode=1;}
finally{await c('pause').catch(()=>{});await c('speed',{percent:100}).catch(()=>{});}
