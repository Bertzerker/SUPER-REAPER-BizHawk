// SPDX-License-Identifier: MIT
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using BizHawk.Common;
using BizHawk.Emulation.Common;
using BizHawk.Emulation.Cores.Nintendo.BSNES;

namespace REASnes {
 sealed class RasterFrame {
  public bool Ready; public int Width,Height,Flags,FieldMask; public long Generation;
  public int WordCount; public int[] Words=new int[0]; public string Reason;
  public int IdentityWords, Epoch; public int[] Identities=Array.Empty<int>();
  public string IdentityStatus;
 }
 sealed class NativeRaster {
  readonly BsnesApi api; readonly BsnesCoreImpl core;
  readonly IntPtr control,pixels,identities; readonly int capacity,identityCapacity;
  public readonly int[] Palette;
  public bool Available => control!=IntPtr.Zero;
  public bool IdentityAvailable => identities!=IntPtr.Zero;
  public NativeRaster(IEmulator emulator,bool enabled) {
   var flags=BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic;
   var apiProperty=emulator.GetType().GetProperty("Api",flags);
   if(apiProperty==null)return;
   api=apiProperty.GetValue(emulator) as BsnesApi;
   if(api==null)return;
   core=(BsnesCoreImpl)typeof(BsnesApi).GetField("core",flags).GetValue(api);
   Palette=emulator.GetType().GetField("palette",flags)?.GetValue(emulator) as int[];
   using(api.EnterExit()) {
    var p=core.snes_get_memory_region(0x52454101,out var size,out _);
    if(p==IntPtr.Zero || size!=64 || Marshal.ReadInt32(p)!=0x53414552 || Marshal.ReadInt32(p,4)!=1)return;
    control=p; pixels=core.snes_get_memory_region(0x52454102,out capacity,out _);
    identities=core.snes_get_memory_region(0x52454103,out identityCapacity,out _);
    if(pixels==IntPtr.Zero || Palette==null)throw new InvalidOperationException("Incomplete REA native core interface");
    SetEnabled(enabled);
   }
  }
  public void SetIdentity(bool enabled) {
   if(!IdentityAvailable)return;
   using(api.EnterExit()) {
    int flags=Marshal.ReadInt32(control,60);
    Marshal.WriteInt32(control,60,enabled?flags|1:0);
   }
  }
  public void Invalidate() {
   if(!Available)return;
   using(api.EnterExit()) {Marshal.WriteInt32(control,12,0);Marshal.WriteInt32(control,56,unchecked(Marshal.ReadInt32(control,56)+1));}
  }
  public void SetEnabled(bool enabled) {
   if(!Available)return;
   using(api.EnterExit()) {Marshal.WriteInt32(control,8,enabled?1:0);Invalidate();}
  }
  public RasterFrame Read(RasterFrame result) {
   result.Ready=false;result.WordCount=0;result.Generation=0;result.Flags=0;result.FieldMask=0;
   result.IdentityWords=0;result.Epoch=0;
   result.IdentityStatus=IdentityAvailable?"waiting-render":"core-unsupported";
   result.Reason="The renderer capture core is not installed";
   if(!Available)return result;
   using(api.EnterExit()) {
    result.Generation=Marshal.ReadInt64(control,16);result.Width=Marshal.ReadInt32(control,24);result.Height=Marshal.ReadInt32(control,28);
    result.Flags=Marshal.ReadInt32(control,40);result.FieldMask=Marshal.ReadInt32(control,52);
    result.Epoch=Marshal.ReadInt32(control,56);
    result.Ready=Marshal.ReadInt32(control,12)==1;
    if(!result.Ready){result.Reason=Marshal.ReadInt32(control,8)==0?"Native capture disabled":result.Generation==0?"Waiting for a complete rendered frame":(result.Flags&1)==0?"Cycle PPU capture is unavailable":(result.Flags&4)!=0?"HD/supersampled Mode 7 capture is unavailable":"Waiting for a complete capture after reset/state load";return result;}
    int size=Marshal.ReadInt32(control,48),count=result.Width*result.Height;
    if(result.Width<1 || result.Width>512 || result.Height<1 || result.Height>480 || size!=count*44 || size>capacity)throw new InvalidOperationException("Invalid native renderer capture dimensions");
    if(result.Words.Length<size/4)result.Words=new int[size/4];
    Marshal.Copy(pixels,result.Words,0,size/4);result.WordCount=size/4;result.Reason=null;
    if(IdentityAvailable) {
     int flags=Marshal.ReadInt32(control,60);
     result.IdentityStatus=(flags&1)==0?"disabled":(flags&4)!=0?"geometry-unsupported":"cadence";
     if((flags&3)==3) {
      int words=count*20;
      if(result.Width!=256 || result.Height>240 || words*4>identityCapacity)
       throw new InvalidOperationException("Invalid native identity dimensions");
      if(result.Identities.Length<words)result.Identities=new int[words];
      Marshal.Copy(identities,result.Identities,0,words);
      result.IdentityWords=words;result.IdentityStatus="captured";
     }
    }
    return result;
   }
  }
  public int Color(int word) => Palette[word&0x7fff]|unchecked((int)0xff000000);
  public static int LayerSample(RasterFrame f,int layer,int x,int y) {
   int count=f.Width*f.Height,i=y*f.Width+x;
   int main=f.Words[(1+layer*2)*count+i],sub=f.Words[(2+layer*2)*count+i];
   if(((uint)(main|sub)&0x80000000)!=0)return (x&1)==0?sub:main;
   return (main&0x8000)!=0?main:sub;
  }
 }
}
