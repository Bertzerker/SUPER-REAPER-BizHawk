// SPDX-License-Identifier: MIT
import {advanceFollow} from './catalog-follow.mjs';

const native='fastppu-sample-v1',oam='oam-vram-diagnostic',vram='vram-tile-diagnostic';
const descriptions={
 [native]:'FastPPU admitted samples', [oam]:'OAM and VRAM diagnostic', [vram]:'VRAM tile-grid diagnostic',
};
const messages={
 missing:'Missing or occluded. Pick again to resume.',
 ambiguous:'Ambiguous matches. Pick again to resume.',
 lost:'Locator moved or changed beyond the follow limits. Pick again.',
 discontinuity:'Capture continuity changed. Pick again.',
};
const scope=c=>c?JSON.stringify([c.meta.rom.hash,c.meta.core,c.meta.version,c.meta.identity?.sync]):'';
const reference=c=>c.saved?{annotation:c.saved}:{snapshot:c.meta.id};
const params=c=>c.saved?{Note:c.saved}:{snapshot:c.meta.id};
const hex=n=>'$'+n.toString(16).toUpperCase().padStart(4,'0');

export function setupCatalog({api,post,context,live,selection,holdDisplayed,holdSeed,inspectFrame,returnLive,control,attach}){
 const $=id=>document.getElementById('catalog-'+id);
 const set=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
 let doc=null,documentScope='',seed=null,choices=[],view=null,follow=null,active=false;
 let serial=0,ticking=false,working=false,displayed=null;
 const selected=()=>(doc?.entries??[]).find(e=>e.id===$('entry').value);
 const viewSource=()=>{
  if(!$('view').value)return null;
  const [evidence,layer]=$('view').value.split('/');
  return {evidence,layer,screen:$('screen').value};
 };
 const status=text=>set('status',text);
 const resultStatus=text=>set('result',text);

 function updateButtons(){
  const c=context(),l=live(),entry=selected(),source=viewSource();
  $('enable').disabled=working||!l?.catalogContext?.available;
  $('enable').textContent=l?.catalogContext?.enabled?'Disable native catalog sampling':'Enable native catalog sampling';
  $('latest').disabled=working||!l?.catalogContext?.enabled;
  $('live').disabled=!c||c.kind==='live';
  $('reload').disabled=!c||working;
  $('pick').disabled=!c||working;
  $('add').disabled=working||!seed||!doc||!$('name').value.trim();
  $('append').disabled=working||!seed||!entry||entry.kind!==$('kind').value;
  $('edit').disabled=working||!entry;
  $('import').disabled=working||!c||!doc;
  $('export').disabled=!doc;
  $('all').disabled=working||!entry||!source;
  $('screen').disabled=source?.evidence!==native&&$('source').value!==native;
  $('follow').disabled=working||c?.kind!=='live'||!view||view.truncated||
   source?.evidence!==native||!$('instance').value;
  $('pin').disabled=working||!view?.matched||displayed?.kind!=='live';
  $('attach').disabled=working||!view?.matched||!!(follow&&(follow.status!=='following'||view.instance!==follow.candidate.id));
 }

 function clearResult(){
  serial++;view=null;follow=null;displayed=null;
  const canvas=$('image');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  $('instance').replaceChildren(new Option('Choose one occurrence',''));
  resultStatus('Choose an entry and show its matches.');
 }

 function clearSeed(){
  seed=null;choices=[];
  $('choice').replaceChildren(new Option('Choose a captured sample',''));
  set('seed','Select a captured pixel, OAM slot or VRAM tile.');
 }

 function options(){
  const query=$('search').value.trim().toLowerCase(),kind=$('filter').value,old=$('entry').value;
  const filtered=(doc?.entries??[]).filter(e=>(!kind||e.kind===kind)&&
   [e.name,...e.labels,e.notes].join(' ').toLowerCase().includes(query));
  $('entry').replaceChildren(new Option('Choose an entry',''),...filtered.map(e=>new Option(e.name+' · '+e.kind,e.id)));
  if(filtered.some(e=>e.id===old))$('entry').value=old;
  else if(old){active=false;clearResult();loadEntry();}
 }

 function loadEntry(){
  const entry=selected(),currentSource=$('view').value;
  $('name').value=entry?.name??'';
  $('labels').value=entry?.labels.join(', ')??'';
  $('notes').value=entry?.notes??'';
  $('selectors').value=entry?JSON.stringify(entry.selectors,null,2):'';
  if(entry&&$('kind').value!==entry.kind){$('kind').value=entry.kind;clearSeed();}
  const sources=[...new Set((entry?.selectors??[]).map(s=>s.evidence+'/'+s.layer))];
  $('view').replaceChildren(new Option('Choose a selector source',''),...sources.map(s=>{
   const [evidence,layer]=s.split('/');
   return new Option(layer.toUpperCase()+' · '+descriptions[evidence],s);
  }));
  if(sources.length)$('view').value=sources.includes(currentSource)?currentSource:sources[0];
 }

 async function reload(c){
  const key=scope(c);
  const response=await api('/api/catalog?'+new URLSearchParams(params(c)));
  if(scope(context())!==key)return;
  doc=response;documentScope=key;
  options();loadEntry();
  status('Catalog revision '+doc.revision+' · '+doc.entries.length+' entries · '+c.meta.rom.name);
 }

 function picked(c,pick,locator){
  seed={context:c,pick};
  set('seed',JSON.stringify(locator,null,2));
 }

 async function readSeed(){
  const source=$('source').value,kind=$('kind').value,point=selection();
  const c=source===native?context():await holdDisplayed();
  if(!c)throw Error('No displayed capture');
  clearSeed();
  if(source!==native){
   const index=$('diagnostic-index').valueAsNumber;
   const locator=source===oam?{slot:index}:{tile:index};
   const data=await api('/api/catalog/seed?'+new URLSearchParams({...params(c),evidence:source,kind,...locator}));
   await holdSeed(c);
   picked(c,{evidence:source,...locator},data.locator);
   return;
  }
  if(!point||!c.verified)throw Error('Pin a pixel in Composite or an isolated layer first.');
  const data=await api('/api/catalog/pick?'+new URLSearchParams({...params(c),layer:point.view,x:point.x,y:point.y,screen:$('screen').value}));
  choices=data.choices.filter(s=>kind==='tile'||s.layer==='obj').map(s=>({c,s,point}));
  if(!choices.length)throw Error('This pixel has no admitted samples of the selected kind.');
  await holdSeed(c);
  $('choice').replaceChildren(...choices.map(({s},i)=>new Option(s.layer.toUpperCase()+' '+s.screen+' · '+hex(s.address),String(i))));
  chooseSample();
 }

 function chooseSample(){
  const choice=choices[Number($('choice').value)];
  if(!choice)return;
  const {c,s,point}=choice;
  picked(c,{evidence:native,layer:s.layer,screen:s.screen,x:point.x,y:point.y},
   {snapshot:c.meta.id,frame:c.meta.frame,x:point.x,y:point.y,...s});
 }

 function entryFields(){
  return {name:$('name').value,labels:$('labels').value.split(',').map(s=>s.trim()).filter(Boolean),notes:$('notes').value};
 }

 async function save(action){
  const entry=selected(),c=action==='create'||action==='append'?seed?.context:context();
  if(!c||scope(c)!==documentScope)throw Error('Reload the catalog and pick evidence for this ROM.');
  const input={action,revision:doc.revision,...reference(c)};
  if(action==='create')Object.assign(input,entryFields(),{kind:$('kind').value});
  if(action==='create'||action==='append')Object.assign(input,{pick:seed.pick,paletteVariants:$('palette-variants').checked});
  if(action==='append'||action==='edit')input.id=entry.id;
  if(action==='edit')Object.assign(input,entryFields(),{selectors:JSON.parse($('selectors').value)});
  if(action==='import')input.document=JSON.parse($('import-text').value);
  const response=await post('/api/catalog',input);
  if(scope(context())!==documentScope)return;
  doc=response.document;
  options();
  if(response.entry){$('entry').value=response.entry.id;loadEntry();}
  active=false;clearResult();
  status('Saved catalog revision '+doc.revision);
 }

 async function draw(result,instance,request){
  const bytes=Uint8Array.from(atob(result.image),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  try{
   if(request!==serial)return false;
   const canvas=$('image');canvas.width=result.width;canvas.height=result.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
   if(instance){
    ctx.strokeStyle='#ffb895';
    ctx.strokeRect(instance.x+.5,instance.y+.5,instance.width-1,instance.height-1);
   }
   return true;
  }finally{bitmap.close();}
 }

 async function refreshView(c){
  const entry=selected(),source=viewSource(),request=serial;
  if(!entry||!source||follow&&follow.status!=='following')return;
  if(follow&&c.kind!=='live')throw Error('Follow paused when inspection left the live capture');
  const filters={...source,id:entry.id,revision:entry.revision};
  if(follow)filters.instance=follow.candidate.id;
  const lookup=c.kind==='live'?{live:1}:params(c);
  if(displayed?.kind===c.kind)filters.since=displayed.snapshot;
  const response=await api('/api/catalog/view?'+new URLSearchParams({...lookup,...filters}));
  if(request!==serial||response.unchanged)return;
  if(follow){
   follow=advanceFollow(follow,response);
   if(follow.status!=='following'){
    view=null;displayed=null;
    const canvas=$('image');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    resultStatus(messages[follow.status]);return;
   }
  }
  if(!await draw(response,follow?.candidate,request))return;
  view=response;
  displayed={snapshot:response.snapshot,saved:c.saved,kind:c.kind};
  const old=$('instance').value;
  $('instance').replaceChildren(new Option('Choose one occurrence',''),...view.candidates.map(o=>
   new Option(`${source.layer==='obj'?'Slot / tile':'Map and pattern'} ${o.id} · (${o.x}, ${o.y})`,o.id)));
  $('instance').value=follow?.candidate.id??old;
  resultStatus((follow?'Following candidate '+follow.candidate.id:view.matched?'All matches':'No matches')+
   ' · '+c.kind.toUpperCase()+' frame '+view.frame+' · '+view.candidates.length+' occurrences · '+descriptions[source.evidence]+
   (view.truncated?' · Candidate list capped. Follow is unavailable.':''));
 }

 async function tick(){
  if($('panel').hidden||ticking||working)return;
  ticking=true;
  try{
   const c=context();
   if(!c){status('Waiting for a capture.');return;}
   if(documentScope!==scope(c)){
    active=false;clearResult();clearSeed();
    await reload(c);
   }
   if(active){
    try{await refreshView(c);}
    catch(e){
     view=null;displayed=null;
     if(follow)follow={...follow,status:'discontinuity'};
     if(e.status===409||e.status===404)active=false;
     const canvas=$('image');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
     resultStatus(e.message+(follow?' · Pick again to follow.':''));
    }
   }
  }catch(e){status(e.message);}
  finally{ticking=false;updateButtons();}
 }

 function run(fn){
  return async()=>{
   if(working)return;
   working=true;updateButtons();
   try{await fn();}
   catch(e){status(e.message);}
   finally{working=false;updateButtons();}
  };
 }
 $('enable').onclick=run(async()=>{
  const enabled=!live()?.catalogContext?.enabled;
  await control({action:'catalog-capture',enabled});
  active=false;clearResult();
  status(enabled?'Native sampling requested. Resume or advance four rendered frames.':'Native catalog sampling disabled.');
 });
 $('latest').onclick=run(async()=>{
  const r=await api('/api/catalog/current?live=1&evidence='+native);
  await inspectFrame(r.snapshot);
  active=false;clearResult();clearSeed();
  status('Sampled frame '+r.frame+' pinned. Select a pixel in the atlas above.');
 });
 $('live').onclick=()=>{returnLive();active=false;clearResult();updateButtons();};
 $('reload').onclick=run(async()=>{active=false;clearResult();await reload(context());});
 $('pick').onclick=run(readSeed);
 $('choice').onchange=()=>{chooseSample();updateButtons();};
 $('source').onchange=()=>{$('diagnostic-label').hidden=$('source').value===native;clearSeed();updateButtons();};
 $('kind').onchange=()=>{clearSeed();updateButtons();};
 $('name').oninput=updateButtons;
 for(const [button,action] of [['add','create'],['append','append'],['edit','edit'],['import','import']])
  $(button).onclick=run(()=>save(action));
 $('export').onclick=()=>{$('import-text').value=JSON.stringify(doc,null,2);};
 $('search').oninput=$('filter').onchange=()=>{options();updateButtons();};
 $('entry').onchange=()=>{active=false;clearResult();loadEntry();updateButtons();};
 $('view').onchange=()=>{active=false;clearResult();updateButtons();};
 $('screen').onchange=()=>{active=false;clearResult();clearSeed();updateButtons();};
 $('instance').onchange=updateButtons;
 $('all').onclick=()=>{clearResult();active=true;tick();};
 $('follow').onclick=()=>{
  const candidate=view?.candidates.find(c=>c.id===$('instance').value);
  if(!candidate||context()?.kind!=='live')return;
  follow={candidate,status:'following',context:view.context,frame:view.frame,generation:view.generation,revision:view.revision};
  displayed=null;serial++;tick();
 };
 $('pin').onclick=run(async()=>{
  if(!view||!displayed)throw Error('Show a catalog result first.');
  const result=view;
  serial++;
  await inspectFrame(result.snapshot);
  active=false;follow=null;
  displayed={snapshot:result.snapshot,saved:null,kind:'frozen'};
  resultStatus('Pinned catalog result · frame '+result.frame+' · '+descriptions[result.evidence]);
 });
 $('attach').onclick=run(async()=>{
  const entry=selected(),source=viewSource();
  if(!view||!displayed||!entry||!source)throw Error('Show a catalog result first.');
  await attach({...displayed.saved?{annotation:displayed.saved}:{snapshot:displayed.snapshot},
   catalog:{...source,id:entry.id,revision:view.revision,instance:view.instance}});
 });
 setInterval(tick,125);
}
