// SPDX-License-Identifier: MIT
export function unpack(packet) {
 if(packet.length<4)throw Error('Short packet');
 const n=packet.readUInt32LE(0);
 if(n>1_000_000 || n+4>packet.length)throw Error('Invalid metadata length');
 const meta=JSON.parse(packet.subarray(4,4+n).toString('utf8'));
 const payload=packet.subarray(4+n);
 if(meta.type!=='frame')return {meta,payload};
 if(meta.schema!==1 || !/^[a-f0-9]{32}-\d+$/.test(meta.id))throw Error('Unsupported snapshot');
 let end=0;
 for(const block of [...meta.domains,meta.atlas,meta.tiles,...(meta.raster?[meta.raster]:[]),...(meta.sampleIdentity?[meta.sampleIdentity]:[])]) {
  const size=block.length??block.size;
  if(!Number.isSafeInteger(block.offset)||!Number.isSafeInteger(size)||size<0||block.offset!==end)throw Error('Invalid block layout');
  end+=size;
 }
 if(end!==payload.length || meta.atlas.length!==meta.atlas.width*meta.atlas.height*4)throw Error('Invalid capture length');
 const identity=meta.sampleIdentity;
 if(identity?.length && (identity.schema!==1 || !meta.raster?.valid || identity.status!=='captured' ||
   meta.raster.width!==256 || meta.raster.height>240 || identity.length!==meta.raster.width*meta.raster.height*80))
  throw Error('Invalid sample identity plane');
 return {meta,payload,packet};
}
export class Framer {
 constructor(onPacket){this.onPacket=onPacket;this.parts=[];this.length=0;this.expected=null;this.prefix=Buffer.alloc(4);this.prefixCount=0;}
 push(chunk){
  let p=0;
  while(p<chunk.length){
   if(this.expected===null){
    const n=Math.min(4-this.prefixCount,chunk.length-p);chunk.copy(this.prefix,this.prefixCount,p,p+n);p+=n;this.prefixCount+=n;
    if(this.prefixCount<4)continue;
    this.expected=this.prefix.readUInt32LE(0);this.prefixCount=0;
    if(this.expected<4||this.expected>32*1024*1024)throw Error('Invalid packet length');
   }
   const n=Math.min(this.expected-this.length,chunk.length-p);
   this.parts.push(chunk.subarray(p,p+n));this.length+=n;p+=n;
   if(this.length===this.expected){const packet=Buffer.concat(this.parts,this.length);this.parts=[];this.length=0;this.expected=null;this.onPacket(unpack(packet));}
  }
 }
}
export function range(meta,payload,space,start,length){
 const domain=meta.domains.find(d=>d.name.toLowerCase()===space.toLowerCase());
 if(!domain)throw Error('Unknown memory domain');
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<1||length>4096||start+length>domain.size)throw Error('Memory range is out of bounds (length 1..4096)');
 return {domain,bytes:payload.subarray(domain.offset+start,domain.offset+start+length)};
}
export function inspectPixel(s,view,x,y){
 const p=s.meta.atlas.panels.find(p=>p.view===view);
 if(!p||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=p.width||y>=p.height)throw Error('Pixel outside view');
 const at=s.meta.atlas.offset+((p.y+y)*s.meta.atlas.width+p.x+x)*4;
 const b=s.payload.subarray(at,at+4);
 const nativeSamples=rasterPixel(s,view,x,y);
 return {snapshot:s.meta.id,frame:s.meta.frame,view,x,y,supported:p.supported,kind:p.kind,rgb:[b[2],b[1],b[0]],nativeSamples,
  provenance:null,provenanceReason:'Raster fetch and CPU/DMA provenance is not captured by this tool',
  spriteBounds:view==='obj'||view==='composite'?s.meta.sprites.filter(o=>x>=o.x&&x<o.x+o.width&&(y>=o.y&&y<o.y+o.height||y+256>=o.y&&y+256<o.y+o.height)):undefined};
}
export function rasterPixel(s,view,x,y){
 const r=s.meta.raster;if(!r?.valid||r.streamed===false||!r.length)return null;
 const count=r.width*r.height,i=y*r.width+x;
 if(x<0||y<0||x>=r.width||y>=r.height)throw Error('Outside native capture');
 if(view==='composite')return {generation:r.generation,kind:'native-final-output',rgb555:s.payload.readUInt32LE(r.offset+i*4)&32767};
 const layer=view==='obj'?4:Number(view.slice(2))-1;if(layer<0||layer>4||!Number.isInteger(layer))return null;
 const decode=plane=>{const word=s.payload.readUInt32LE(r.offset+(plane*count+i)*4),present=!!(word&32768);return {present,rgb555:word&32767,priority:(word>>>16)&255,source:present?(['BG1','BG2','BG3','BG4','OBJ palette 0-3','OBJ palette 4-7'][(word>>>24)&7]??null):null,hires:!!(word&0x80000000)};};
 const main=decode(1+layer*2),sub=decode(2+layer*2),selected=!main.present&&!sub.present?null:main.hires||sub.hires?((x&1)?'main':'sub'):(main.present?'main':'sub');
 return {generation:r.generation,kind:'native-layer-input-before-color-math',main,sub,selected,present:selected!==null&&(selected==='main'?main:sub).present};
}
