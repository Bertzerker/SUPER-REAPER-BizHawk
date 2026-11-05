// SPDX-License-Identifier: MIT
// This worker owns detached host buffers only. It never calls an emulator API.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using Newtonsoft.Json;
using GD = BizHawk.Emulation.Cores.Nintendo.SNES.SNESGraphicsDecoder;

namespace REASnes {
 sealed class CaptureWork {
  public readonly RasterFrame Raster=new RasterFrame();
  public readonly Dictionary<string,byte[]> Memory=new Dictionary<string,byte[]>();
  public readonly List<byte[]> Blocks=new List<byte[]>();
  public Dictionary<string,object> Header;
  public GD.ScreenInfo Screen;
  public bool Fast;
  public int Width,Height,MemoryLength;
  public int[] Palette,Video=new int[0];
  int[] atlas=new int[0];
  readonly int[] tiles=new int[128*128];
  // Reused after NetworkStream.Write has consumed the complete packet.
  byte[] packet=new byte[0];
  public int PacketLength;
  int Color(int word)=>Palette[word&32767]|unchecked((int)0xff000000);
  byte[] Domain(string name)=>Memory.TryGetValue(name,out var bytes)?bytes:null;
  public byte[] Encode() {
   var watch=Stopwatch.StartNew();
   int vw=Width,vh=Height,cw=Math.Max(256,vw),ch=Math.Max(256,vh),aw=cw*3,ah=ch*2,count=vw*vh;
   if(atlas.Length!=aw*ah)atlas=new int[aw*ah];
   for(int i=0;i<atlas.Length;i++)atlas[i]=unchecked((int)0xff111722);
   for(int y=0;y<vh;y++)for(int x=0;x<vw;x++)atlas[y*aw+x]=Raster.Ready?Color(Raster.Words[y*vw+x]):Video[y*vw+x]|unchecked((int)0xff000000);
   var panels=new List<object>{new {view="composite",x=0,y=0,width=vw,height=vh,kind=Raster.Ready?"captured-output":"cached-output",supported=true}};
   var names=new[]{"obj","bg1","bg2","bg3","bg4"};
   for(int slot=1;slot<6;slot++) {
    int px=slot%3*cw,py=slot/3*ch,layer=slot==1?4:slot-2,mainAt=(1+layer*2)*count,subAt=mainAt+count;
    if(Raster.Ready)for(int y=0;y<vh;y++)for(int x=0;x<vw;x++) {
     int at=y*vw+x,main=Raster.Words[mainAt+at],sub=Raster.Words[subAt+at];
     int word=((uint)(main|sub)&0x80000000)!=0?((x&1)==0?sub:main):(main&32768)!=0?main:sub;
     atlas[(py+y)*aw+px+x]=(word&32768)!=0?Color(word):0x00111722;
    }
    panels.Add(new {view=names[slot-1],x=px,y=py,width=vw,height=vh,kind="ppu-render-samples",supported=Raster.Ready});
   }
   var sprites=new List<object>();var bgs=new List<object>();var colors=new int[0];
   Array.Clear(tiles,0,tiles.Length);
   if(Fast) {
    var oam=Domain("OAM");
    if(oam!=null && oam.Length>=544)for(int n=127;n>=0;n--) {
     int at=n*4,attr=oam[at+3],high=oam[512+n/4]>>(n%4*2),x=oam[at]+((high&1)<<8),character=oam[at+2];
     var dimensions=GD.ObjSizes[Screen.OBSEL_Size,(high>>1)&1];bool table=(attr&1)!=0;
     sprites.Add(new {index=n,x=x>=256?x-512:x,y=(int)oam[at+1],width=dimensions.Width,height=dimensions.Height,tile=character+(table?256:0),palette=(attr>>1)&7,priority=(attr>>4)&3,hflip=(attr&64)!=0,vflip=(attr&128)!=0,address=(character*32+(table?Screen.OBJTable1Addr:Screen.OBJTable0Addr))&65535});
    }
    for(int n=1;n<=4;n++){var bg=Screen.BG[n];bgs.Add(new {index=n,enabled=bg.Enabled,bpp=bg.Bpp,tileSize=bg.TileSize,mapAddress=bg.ScreenAddr,tileAddress=bg.TiledataAddr,hscroll=bg.HOFS,vscroll=bg.VOFS,main=bg.MainEnabled,sub=bg.SubEnabled,colorMath=bg.MathEnabled});}
    var cgram=Domain("CGRAM");var vram=Domain("VRAM");
    if(cgram!=null && cgram.Length>=512){colors=new int[256];for(int i=0;i<256;i++)colors[i]=(cgram[i*2]|cgram[i*2+1]<<8)&32767;}
    // Decode only the 256 4bpp tiles actually shown in the memory preview.
    if(vram!=null && vram.Length>=65536 && colors.Length==256 && Palette!=null)for(int tile=0;tile<256;tile++)for(int y=0;y<8;y++) {
     int a=(Screen.OBJTable0Addr+tile*32+y*2)&65535,b0=vram[a],b1=vram[(a+1)&65535],b2=vram[(a+16)&65535],b3=vram[(a+17)&65535],dst=(tile/16*8+y)*128+tile%16*8;
     for(int x=0;x<8;x++){int bit=7-x,index=((b0>>bit)&1)|((b1>>bit)&1)<<1|((b2>>bit)&1)<<2|((b3>>bit)&1)<<3;tiles[dst+x]=Color(colors[128+index]);}
    }
   }
   int atlasSize=atlas.Length*4,tileSize=tiles.Length*4;
   Header["sprites"]=sprites;Header["bgs"]=bgs;Header["palette"]=colors;
   Header["atlas"]=new {width=aw,height=ah,format="BGRA8888",offset=MemoryLength,length=atlasSize,panels};
   Header["tiles"]=new {width=128,height=128,format="BGRA8888",offset=MemoryLength+atlasSize,length=tileSize,kind="obj-4bpp-memory-preview"};
   Header["raster"]=new {available=Header["nativeAvailable"],valid=Raster.Ready,generation=Raster.Generation,renderFrame=Header["renderFrame"],flags=Raster.Flags,fieldMask=Raster.FieldMask,reason=Raster.Reason,width=vw,height=vh,offset=MemoryLength+atlasSize+tileSize,length=Raster.WordCount*4,format="11 planar uint32 LE: composite; BG1 main/sub; BG2 main/sub; BG3 main/sub; BG4 main/sub; OBJ main/sub"};
   Header.Remove("nativeAvailable");Header.Remove("renderFrame");Header["encode_ms"]=watch.Elapsed.TotalMilliseconds;
   byte[] json=Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(Header));
   int size=4+json.Length+MemoryLength+atlasSize+tileSize+Raster.WordCount*4;
   PacketLength=size+4;if(packet.Length<PacketLength)packet=new byte[PacketLength];
   Buffer.BlockCopy(BitConverter.GetBytes(size),0,packet,0,4);Buffer.BlockCopy(BitConverter.GetBytes(json.Length),0,packet,4,4);Buffer.BlockCopy(json,0,packet,8,json.Length);
   int offset=8+json.Length;foreach(var b in Blocks){Buffer.BlockCopy(b,0,packet,offset,b.Length);offset+=b.Length;}
   Buffer.BlockCopy(atlas,0,packet,offset,atlasSize);offset+=atlasSize;Buffer.BlockCopy(tiles,0,packet,offset,tileSize);offset+=tileSize;
   if(Raster.WordCount!=0)Buffer.BlockCopy(Raster.Words,0,packet,offset,Raster.WordCount*4);
   return packet;
  }
 }
}
