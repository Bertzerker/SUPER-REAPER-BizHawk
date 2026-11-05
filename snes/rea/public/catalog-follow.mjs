// SPDX-License-Identifier: MIT
const center=(c,axis)=>c[axis]+c[axis==='x'?'width':'height']/2;
const distance=(a,b)=>Math.hypot(center(a,'x')-center(b,'x'),center(a,'y')-center(b,'y'));

// A locator is useful only within a continuous run and nearby bounds. Loss is terminal
// until the investigator picks again, even if the same slot later reappears.
export function advanceFollow(track,frame){
 if(track.status!=='following')return track;
 const lost=status=>({...track,status});
 if(frame.context!==track.context||frame.revision!==track.revision||frame.frame<track.frame||
    frame.frame-track.frame>16)return lost('discontinuity');
 if(Number.isInteger(track.generation)&&Number.isInteger(frame.generation)&&
    frame.generation-track.generation!==frame.frame-track.frame)return lost('discontinuity');
 if(frame.truncated)return lost('ambiguous');
 if(frame.frame===track.frame)return track;
 const next=frame.candidates.find(c=>c.id===track.candidate.id);
 if(!next)return lost('missing');
 const old=track.candidate,limit=4+3*(frame.frame-track.frame);
 if(distance(old,next)>limit||next.mode!==old.mode||next.bpp!==old.bpp||
    next.hflip!==old.hflip||next.vflip!==old.vflip||
    Math.max(next.width/old.width,old.width/next.width,next.height/old.height,old.height/next.height)>2.5)
  return lost('lost');
 if(frame.candidates.some(c=>c.id!==next.id&&distance(old,c)<Math.min(12,distance(old,next)+3)))
  return lost('ambiguous');
 return {...track,candidate:next,frame:frame.frame,generation:frame.generation};
}
