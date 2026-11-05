// SPDX-License-Identifier: MIT
import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const layers=['obj','bg1','bg2','bg3','bg4'];
const native='fastppu-sample-v1',oam='oam-vram-diagnostic',vram='vram-tile-diagnostic';
const maxBytes=512*1024,maxEntries=256,maxSelectors=32,maxCandidates=256;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const int=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const clean=(value,max,min=0)=>{
 if(typeof value!=='string'||value.length>max||value.trim().length<min)throw fail('Invalid catalog text field');
 return value.trim();
};

export function scope(meta){
 const value=meta.rom?.hash;
 if(typeof value!=='string'||!/^(?:SHA1:)?[0-9a-f]{40}$/i.test(value))throw fail('This capture has no supported ROM SHA-1 identity');
 return {console:'SNES',rom:{algorithm:'sha1',digest:value.replace(/^SHA1:/i,'').toLowerCase()},core:meta.core,version:meta.version,sync:meta.identity?.sync??null};
}

function selector(value,kind){
 const {evidence,layer,address,palette=null,bpp,mode=null,direct=false}=value??{};
 if(!int(address,0,65535)||address%2||![2,4,8].includes(bpp)||
   address%(bpp*8)||!(palette===null||int(palette,0,255))||typeof direct!=='boolean')throw fail('Invalid pattern address, palette or depth');
 if(evidence===native){
  if(!layers.includes(layer)||!int(mode,0,4)||kind==='sprite'&&layer!=='obj'||
     layer==='obj'&&(bpp!==4||direct||palette!==null&&(palette<128||palette%16))||
     direct&&(layer!=='bg1'||![3,4].includes(mode)||palette!==null&&palette>7))
   throw fail('Incompatible FastPPU selector');
 }else if(evidence===oam||evidence===vram){
  if(layer!=='obj'||bpp!==4||mode!==null||direct||
     (evidence===oam)!==(kind==='sprite')||evidence===vram&&palette!==null||
     evidence===oam&&palette!==null&&(palette<128||palette%16))
   throw fail('Incompatible diagnostic selector');
 }else throw fail('Unknown evidence class');
 return {evidence,layer,address,palette,bpp,mode,direct};
}

function selectors(values,kind){
 if(!Array.isArray(values)||values.length<1||values.length>maxSelectors)throw fail('An entry needs 1–32 selectors');
 const checked=values.map(v=>selector(v,kind));
 if(new Set(checked.map(digest)).size!==checked.length)throw fail('Duplicate selectors');
 return checked;
}

function fields(input,previous={}){
 const labels=input.labels??previous.labels??[];
 if(!Array.isArray(labels)||labels.length>12)throw fail('Use at most 12 catalog labels');
 return {name:clean(input.name??previous.name,80,1),labels:labels.map(s=>clean(s,40,1)),notes:clean(input.notes??previous.notes??'',2000)};
}

async function checkedDirectory(directory,create){
 if(create)await mkdir(directory).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const info=await lstat(directory).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(info&&!info.isDirectory())throw fail('Catalog storage must be a regular directory');
 return !!info;
}

export class Catalog {
 constructor(root){this.root=path.join(root,'catalogs');this.writes=new Map();this.cache=new Map();}

 remember(key,document){
  if(this.cache.get(key)?.revision>document.revision)return document;
  this.cache.delete(key);this.cache.set(key,structuredClone(document));
  if(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);
  return document;
 }

 async read(meta,{cached=false}={}){
  const identity=scope(meta),key=digest(identity),file=path.join(this.root,key+'.json');
  if(cached&&this.cache.has(key))return this.cache.get(key);
  const empty={schema:1,identity,revision:0,entries:[]};
  if(!await checkedDirectory(this.root,false))return this.remember(key,empty);
  const info=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(!info)return this.remember(key,empty);
  if(!info.isFile()||info.size>maxBytes)throw fail('Invalid catalog file');
  const handle=await open(file,'r');
  let document;
  try {
   const bytes=Buffer.alloc(maxBytes+1);
   let length=0;
   while(length<bytes.length){
    const {bytesRead}=await handle.read(bytes,length,bytes.length-length,length);
    if(!bytesRead)break;
    length+=bytesRead;
   }
   if(length>maxBytes)throw fail('Catalog exceeds the storage limit');
   document=JSON.parse(bytes.subarray(0,length));
  }finally{await handle.close();}
  if(document.schema!==1||digest(document.identity)!==key||!int(document.revision,0,Number.MAX_SAFE_INTEGER))throw fail('Catalog identity or version is incompatible');
  this.validateEntries(document.entries);
  return this.remember(key,document);
 }

 validateEntries(entries){
  if(!Array.isArray(entries)||entries.length>maxEntries)throw fail('A catalog can contain up to 256 entries');
  const ids=new Set();
  for(const entry of entries){
   if(!entry||typeof entry.id!=='string'||!/^[a-f0-9-]{36}$/.test(entry.id)||ids.has(entry.id)||
      !['sprite','tile'].includes(entry.kind)||!int(entry.revision,1,Number.MAX_SAFE_INTEGER))throw fail('Invalid catalog entry');
   ids.add(entry.id);
   fields(entry);
   selectors(entry.selectors,entry.kind);
  }
 }

 async change(snapshot,input){
  const key=digest(scope(snapshot.meta)),previous=this.writes.get(key)??Promise.resolve();
  const operation=previous.catch(()=>{}).then(async()=>{
   const doc=await this.read(snapshot.meta);
   if(doc.revision!==input.revision)throw fail('Catalog changed. Reload before saving your draft.',409);
   let entry;
   if(input.action==='import'){
    if(input.document?.schema!==1||digest(input.document.identity)!==key)throw fail('Import must match the current ROM and core settings');
    this.validateEntries(input.document.entries);
    // Import merges only new stable IDs. Existing entries require a revision-checked edit.
    if(input.document.entries.some(e=>doc.entries.some(old=>old.id===e.id)))throw fail('An imported ID already exists. Edit it in the current catalog.',409);
    doc.entries.push(...input.document.entries.map(e=>({id:e.id,kind:e.kind,revision:1,...fields(e),selectors:selectors(e.selectors,e.kind)})));
   }else if(input.action==='create'){
    if(!['sprite','tile'].includes(input.kind))throw fail('Choose a sprite or tile');
    const seed=pick(snapshot,input.pick,input.kind,input.paletteVariants===true);
    entry={id:randomUUID(),kind:input.kind,revision:1,...fields(input),selectors:[seed.selector],lastSeed:seed.locator};
    doc.entries.push(entry);
   }else {
    entry=doc.entries.find(e=>e.id===input.id);
    if(!entry)throw fail('Catalog entry was not found',404);
    if(input.action==='append'){
     const seed=pick(snapshot,input.pick,entry.kind,input.paletteVariants===true);
     entry.selectors=selectors([...entry.selectors,seed.selector],entry.kind);
     entry.lastSeed=seed.locator;
    }else if(input.action==='edit'){
     Object.assign(entry,fields(input,entry),{selectors:selectors(input.selectors??entry.selectors,entry.kind)});
    }else if(input.action==='delete'){
     doc.entries=doc.entries.filter(e=>e.id!==entry.id);entry=null;
    }else throw fail('Unknown catalog action');
    if(entry)entry.revision++;
   }
   doc.revision++;
   this.validateEntries(doc.entries);
   const bytes=JSON.stringify(doc,null,2);
   if(Buffer.byteLength(bytes)>maxBytes)throw fail('Catalog exceeds the storage limit');
   await checkedDirectory(this.root,true);
   const file=path.join(this.root,key+'.json'),temp=path.join(this.root,randomUUID()+'.tmp');
   try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,file);}
   finally{await rm(temp,{force:true});}
   this.remember(key,doc);
   return {document:doc,entry};
  });
  this.writes.set(key,operation);
  try{return await operation;}finally{if(this.writes.get(key)===operation)this.writes.delete(key);}
 }
}

function identityReader(s,layer,screen='displayed'){
 if(!s.meta.sampleIdentity?.length)throw fail(identityReason(s.meta),422);
 const {width,height,offset}=s.meta.raster,n=width*height;
 const layerIndex=layer==='obj'?4:Number(layer.slice(2))-1;
 const plane=layerIndex*2,identity=s.meta.sampleIdentity.offset;
 return {
  width,height,
  at(i){
   const main=s.payload.readUInt32LE(offset+((1+plane)*n+i)*4);
   const channel=screen==='sub'?1:(screen==='main'||(main&0x8000))?0:1;
   const start=identity+((plane+channel)*n+i)*8,hi=s.payload.readUInt32LE(start+4);
   if(!(hi&0x80000000))return null;
   const lo=s.payload.readUInt32LE(start);
   return {
    evidence:native,layer,address:(lo&0x7fff)*2,palette:hi&255,bpp:(hi>>>8)&15,
    mode:(hi>>>14)&7,direct:!!(hi&0x20000),hflip:!!(hi&0x1000),vflip:!!(hi&0x2000),
    locator:(lo>>>15)&0x7fff,screen:channel?'sub':'main',
    rgb555:(channel?s.payload.readUInt32LE(offset+((2+plane)*n+i)*4):main)&0x7fff,
   };
  },
 };
}

export function identityReason(meta){
 switch(meta.sampleIdentity?.status){
  case 'disabled':return 'Native catalog sampling is off';
  case 'cadence':return 'This frame has no identity sample. Use the latest catalog frame or advance four rendered frames.';
  case 'geometry-unsupported':return 'Native identity requires 256-pixel non-interlaced FastPPU Modes 0–4';
  case 'waiting-render':return 'Waiting for a new complete FastPPU render';
  default:return 'This core or saved capture has no native identity plane';
 }
}

export function sampleChoices(s,{layer,x,y,screen='displayed'}){
 if(!['displayed','main','sub'].includes(screen))throw fail('Invalid sample screen');
 const candidates=layer==='composite'?layers:[layer];
 if(candidates.some(layer=>!layers.includes(layer)))throw fail('Choose Composite, OBJ or BG1–4');
 return candidates.flatMap(layer=>{
  const r=identityReader(s,layer,screen);
  if(!int(x,0,r.width-1)||!int(y,0,r.height-1))throw fail('Pixel is outside the catalog frame');
  const value=r.at(y*r.width+x);
  return value?[value]:[];
 });
}

export function pick(s,input,kind,paletteVariants=false){
 if(!input||typeof input!=='object')throw fail('Pick evidence first');
 let source,coordinates;
 if(input.evidence===native){
  if(!layers.includes(input.layer))throw fail('Choose a specific captured layer');
  source=sampleChoices(s,input)[0];
  coordinates={x:input.x,y:input.y};
 }else if(input.evidence===oam){
  if(!int(input.slot,0,127))throw fail('OAM slot must be 0–127');
  const item=s.meta.sprites?.find(o=>o.index===input.slot);
  if(item){
   source={evidence:oam,layer:'obj',address:item.address,palette:128+item.palette*16,bpp:4,locator:item.index,hflip:item.hflip,vflip:item.vflip};
   coordinates={x:item.x,y:item.y,width:item.width,height:item.height};
  }
 }else if(input.evidence===vram){
  const base=s.meta.ppu?.OBJTable0Addr;
  if(!int(input.tile,0,255)||!int(base,0,65535)||!s.meta.domains.some(d=>d.name==='VRAM'))throw fail('OBJ table 0 tile diagnostic is unavailable');
  source={evidence:vram,layer:'obj',address:(base+input.tile*32)&65535,bpp:4,locator:input.tile};
  coordinates={x:input.tile%16*8,y:Math.floor(input.tile/16)*8,width:8,height:8};
 }
 if(!source)throw fail('No admitted sample or diagnostic record at this pick',422);
 return {selector:selector({...source,palette:paletteVariants?null:source.palette},kind),locator:{snapshot:s.meta.id,frame:s.meta.frame,...source,...coordinates}};
}

const matchKey=s=>`${s.address}/${s.bpp}/${s.mode??''}/${Number(!!s.direct)}`;
function rulesFor(entry,evidence,layer){
 const rules=new Map();
 for(const s of entry.selectors){
  if(s.evidence!==evidence||s.layer!==layer)continue;
  const key=matchKey(s);
  if(!rules.has(key))rules.set(key,new Set());
  rules.get(key).add(s.palette);
 }
 if(!rules.size)throw fail('This entry has no selectors for that evidence class and layer',422);
 return rules;
}
function matches(rules,s){
 const palettes=rules.get(matchKey(s));
 return palettes&&(palettes.has(null)||palettes.has(s.palette));
}
function candidate(rows,id,x,y,sample){
 let row=rows.get(id);
 if(!row){
  if(rows.size>=maxCandidates)return false;
  row={id,locator:sample.locator,x,y,right:x,bottom:y,pixels:0,patterns:new Set(),palette:sample.palette,mode:sample.mode??null,bpp:sample.bpp,direct:!!sample.direct,hflip:!!sample.hflip,vflip:!!sample.vflip};
  rows.set(id,row);
 }
 row.x=Math.min(row.x,x);row.y=Math.min(row.y,y);row.right=Math.max(row.right,x);row.bottom=Math.max(row.bottom,y);
 row.pixels++;row.patterns.add(sample.address);
 return true;
}

function nativeView(s,entry,layer,screen,only){
 const rules=rulesFor(entry,native,layer),r=identityReader(s,layer,screen);
 const {width,height}=r,rows=new Map(),pixels=Buffer.alloc(width*height*4);
 const panel=s.meta.atlas.panels.find(p=>p.view===layer),stride=s.meta.atlas.width,atlas=s.meta.atlas.offset;
 let truncated=false,matched=0;
 for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i++){
  const sample=r.at(i);
  if(!sample||!matches(rules,sample))continue;
  const id=layer==='obj'&&entry.kind==='sprite'?String(sample.locator):`${sample.locator}:${sample.address}`;
  if(!candidate(rows,id,x,y,sample))truncated=true;
  matched++;
  if(only!==null&&only!==id)continue;
  const at=atlas+((panel.y+y)*stride+panel.x+x)*4;
  if(screen==='displayed'){
   pixels[i*4]=s.payload[at+2];pixels[i*4+1]=s.payload[at+1];pixels[i*4+2]=s.payload[at];
  }else{
   for(let c=0;c<3;c++){
    const value=(sample.rgb555>>((2-c)*5))&31;
    pixels[i*4+c]=(value<<3)|(value>>2);
   }
  }
  pixels[i*4+3]=255;
 }
 return {width,height,rows,pixels,matched,truncated};
}

function diagnosticView(s,entry,evidence,only){
 const rules=rulesFor(entry,evidence,'obj'),rows=new Map();
 const {domains,ppu}=s.meta,ram=domains.find(d=>d.name==='VRAM'),colors=s.meta.palette;
 if(!ram||ram.size<65536||colors?.length!==256||evidence===vram&&!int(ppu?.OBJTable0Addr,0,65535))throw fail('Copied VRAM, CGRAM or OBJ table configuration is unavailable',422);
 const width=evidence===vram?128:256,height=evidence===vram?128:224;
 const pixels=Buffer.alloc(width*height*4);
 const sources=evidence===oam?(s.meta.sprites??[]):
  Array.from({length:256},(_,index)=>({index,address:(ppu.OBJTable0Addr+index*32)&65535,palette:0,
   x:index%16*8,y:Math.floor(index/16)*8,width:8,height:8}));
 let truncated=false,matched=0;
 for(const item of sources){
  const id=String(item.index);
  if(!int(item.width,8,64)||!int(item.height,8,64))continue;
  const sample={locator:item.index,bpp:4,address:item.address,palette:128+item.palette*16,hflip:item.hflip,vflip:item.vflip};
  if(!matches(rules,sample))continue;
  for(let dy=0;dy<item.height;dy++)for(let dx=0;dx<item.width;dx++){
   const x=item.x+dx,y=(item.y+dy)&255;
   if(x<0||x>=width||y<0||y>=height)continue;
   const sx=item.hflip?item.width-1-dx:dx,sy=item.vflip?item.height-1-dy:dy;
   const tile=(((item.tile??0)+((sy>>3)<<4))&240)|(((item.tile??0)+(sx>>3))&15);
   const base=evidence===vram?item.address:(item.address-((item.tile??0)&255)*32+tile*32)&65535;
   const word=(base+(sy&7)*2)&65535,bit=7-(sx&7);
   let index=0;
   for(let plane=0;plane<4;plane++)index|=((s.payload[ram.offset+((word+(plane>>1)*16+(plane&1))&65535)]>>bit)&1)<<plane;
   if(!index)continue;
   if(!candidate(rows,id,x,y,sample))truncated=true;
   matched++;
   if(only!==null&&only!==id)continue;
   const color=colors[sample.palette+index],at=(y*width+x)*4;
   for(let channel=0;channel<3;channel++){
    const value=(color>>(channel*5))&31;
    pixels[at+channel]=(value<<3)|(value>>2);
   }
   pixels[at+3]=255;
  }
 }
 return {width,height,rows,pixels,matched,truncated};
}

export function selectionContext(meta){
 const {catalogContext:c,movie:m}=meta;
 return JSON.stringify([meta.session,scope(meta),c?.epoch,c?.rasterEpoch,m?.loaded?m.filename:'',
  m?.mode,m?.rerecords,m?.loadedSha256,meta.raster?.width,meta.raster?.height]);
}

export function isolate(s,entry,{evidence,layer,instance=null,screen='displayed'},strict=true){
 if(!layers.includes(layer)||!['displayed','main','sub'].includes(screen)||
    instance!==null&&(typeof instance!=='string'||!/^[0-9:]{1,18}$/.test(instance)))throw fail('Invalid isolation selection');
 const view=evidence===native?nativeView(s,entry,layer,screen,instance):diagnosticView(s,entry,evidence,instance);
 const candidates=[...view.rows.values()].map(({right,bottom,patterns,...row})=>({
  ...row,width:right-row.x+1,height:bottom-row.y+1,patterns:[...patterns].sort((a,b)=>a-b),
 }));
 if(strict&&instance!==null&&!candidates.some(c=>c.id===instance))throw fail('Instance is absent in this capture',422);
 return {snapshot:s.meta.id,frame:s.meta.frame,generation:s.meta.raster?.generation,context:selectionContext(s.meta),
  entryId:entry.id,revision:entry.revision,layer,evidence,screen:evidence===native?screen:null,instance,candidates,matched:view.matched,truncated:view.truncated,
  width:view.width,height:view.height,pixels:view.pixels};
}

export function observation(s,entry,result){
 if(!result.matched)throw fail('There are no matching samples to attach',422);
 const selected=result.instance===null?result.candidates:result.candidates.filter(c=>c.id===result.instance);
 return {
  schema:1,snapshot:result.snapshot,frame:result.frame,generation:result.generation,
  identity:scope(s.meta),coreBinary:s.meta.identity?.native??null,
  entry:{id:entry.id,revision:entry.revision,kind:entry.kind,name:entry.name,labels:entry.labels,notes:entry.notes,selectors:entry.selectors},
  selectorSha256:digest(entry.selectors),layer:result.layer,evidence:result.evidence,screen:result.screen,instance:result.instance,
  selection:result.instance===null?'all-matches':'chosen-instance',bounds:selected,
  confidence:result.evidence===native?'renderer-locator':'memory-diagnostic',
  matched:result.matched,truncated:result.truncated,width:result.width,height:result.height,
 };
}
