"""Original LoROM diagnostic. No commercial code/assets. Python stdlib only."""
from pathlib import Path
import struct
import sys
mode=next((m for m in ('raster','mode7','hires','interlace') if '--'+m in sys.argv),'diagnostic')

rom=bytearray([0xff]*32768)
code=bytearray(); labels={}; fixups=[]; address_fixups=[]
def emit(*b): code.extend(b)
def label(n): labels[n]=len(code)
def branch(op,n): emit(op,0);fixups.append((len(code)-1,n))
def lda(v): emit(0xa9,v)
def sta(a): emit(0x8d,a&255,a>>8)
def write(a,v): lda(v);sta(a)
def ldx(v): emit(0xa2,v&255,v>>8)
def vaddr(word): write(0x2116,word&255);write(0x2117,word>>8)
def label_byte(register,name,high=False):
 lda(0);address_fixups.append((len(code)-1,name,high));sta(register)
emit(0x78,0x18,0xfb,0xc2,0x10) # sei clc xce rep #$10
ldx(0x1fff);emit(0x9a,0xe2,0x20)
write(0x4200,0);write(0x2100,0x80)
for a in range(0x2101,0x2134):write(a,0)
write(0x2115,0x80);vaddr(0)
ldx(32768);lda(0);label('clear-vram');sta(0x2118);sta(0x2119);emit(0xca);branch(0xd0,'clear-vram')
# Pattern data: tile 0 red, tile 1 green, tile 2 transparent, tile 3 OBJ blue.
vaddr(0)
for tile in range(4):
 for row in range(8):write(0x2118,255 if tile in (0,3) else 0);write(0x2119,255 if tile==1 else 0)
 for row in range(8):write(0x2118,0);write(0x2119,0)
# BG1 map is blank except one green tile. BG2 stays solid red.
vaddr(0x1000);ldx(1024);label('map');write(0x2118,2);write(0x2119,0);emit(0xca);branch(0xd0,'map')
vaddr(0x1000+5*32+4);write(0x2118,1);write(0x2119,0)
if mode=='raster':
 for row in range(32):
  vaddr(0x1000+row*32+4);write(0x2118,1);write(0x2119,0)
if mode=='mode7':
 vaddr(0);ldx(16384);label('mode7-fill');write(0x2118,0);write(0x2119,1);emit(0xca);branch(0xd0,'mode7-fill')
# CGRAM: black, red, green; sprite palette 8 blue at index129.
write(0x2121,0)
for i in range(256):
 color={1:0x001f,2:0x03e0,129:0x7c00}.get(i,0)
 write(0x2122,color&255);write(0x2122,color>>8)
# Hide unused objects, initialize object0 x64 y48 tile3 palette0 priority3.
write(0x2102,0);write(0x2103,0)
ldx(128);label('oam');write(0x2104,0);write(0x2104,240);write(0x2104,2);write(0x2104,0);emit(0xca);branch(0xd0,'oam')
ldx(32);label('oam-high');write(0x2104,0);emit(0xca);branch(0xd0,'oam-high')
write(0x2102,0);write(0x2103,0)
for v in (64,48,3,0x30):write(0x2104,v)
if mode=='raster':
 write(0x2102,0);write(0x2103,0)
 for n in range(40):
  for v in (64 if n==0 else (n-1)*6,48 if n==0 else 160,3,0x30):write(0x2104,v)
write(0x2105,7 if mode=='mode7' else 5 if mode=='hires' else 1);write(0x2107,0x10);write(0x2108,0x14);write(0x210b,0)
write(0x212c,0x13) # OBJ BG2 BG1
for a in (0x210d,0x210e,0x210f,0x2110):write(a,0);write(a,0)
if mode=='mode7':
 for a in (0x211b,0x211c,0x211d,0x211e):write(a,0);write(a,1 if a in (0x211b,0x211e) else 0)
if mode=='hires':write(0x212d,0x03)
if mode=='interlace':write(0x2133,1)
if mode=='raster':
 write(0x2123,0x20);write(0x212e,0x02) # mask BG2 through window1
 write(0x2131,0x02);write(0x2132,0x3f) # BG2 + fixed red, no halving
 for channel,(transfer,target,name) in enumerate([(0,0x21,'hdma-index'),(2,0x22,'hdma-color'),(2,0x0d,'hdma-scroll'),(1,0x26,'hdma-window'),(0,0x00,'hdma-brightness')]):
  base=0x4300+channel*16
  write(base,transfer);write(base+1,target);label_byte(base+2,name);label_byte(base+3,name,True);write(base+4,0)
 write(0x420c,0x1f)
for i,v in enumerate(b'REA1'):write(0x10+i,v)
write(0x14,0);write(0x20,64);write(0x4200,0x81);write(0x2100,15)
label('loop');emit(0xcb);branch(0x80,'loop')
label('nmi');emit(0x48);emit(0xad,0x10,0x42) # acknowledge NMI
emit(0xe6,0x14) # increment frame sentinel
emit(0xad,0x19,0x42,0x85,0x15,0x29,0x01);branch(0xf0,'no-right');emit(0xe6,0x20)
label('no-right');emit(0xad,0x19,0x42,0x29,0x02);branch(0xf0,'no-left');emit(0xc6,0x20)
label('no-left');write(0x2102,0);write(0x2103,0);emit(0xa5,0x20);sta(0x2104)
for v in (48,3,0x30):write(0x2104,v)
emit(0x68,0x40)
label('rti');emit(0x40)
if mode=='raster':
 for name,data in [('hdma-index',[112,1,112,1,0]),('hdma-color',[112,31,0,112,0,124,0]),('hdma-scroll',[112,0,0,112,32,0,0]),('hdma-window',[112,80,119,112,160,199,0]),('hdma-brightness',[112,15,112,7,0])]:
  label(name);emit(*data)
for pos,name,high in address_fixups:code[pos]=((0x8000+labels[name])>>(8 if high else 0))&255
for pos,n in fixups:
 displacement=labels[n]-pos-1
 assert -128<=displacement<=127,(pos,n,displacement)
 code[pos]=displacement&255
assert len(code)<0x7fc0
rom[:len(code)]=code
rom[0x7fc0:0x7fd5]=b'REA SNES INPUT TEST   '
rom[0x7fd5:0x7fdc]=bytes([0x20,0,5,0,1,0x33,0])
def vector(at,n):struct.pack_into('<H',rom,at,0x8000+labels[n])
for at in (0x7fe4,0x7fe6,0x7fe8,0x7fee,0x7ff4,0x7ff8,0x7ffe):vector(at,'rti')
vector(0x7fea,'nmi');vector(0x7ffa,'nmi');struct.pack_into('<H',rom,0x7ffc,0x8000)
struct.pack_into('<HH',rom,0x7fdc,0xffff,0)
checksum=sum(rom)&0xffff;struct.pack_into('<HH',rom,0x7fdc,checksum^0xffff,checksum)
out=Path(__file__).parent/'test-output'/f'rea-{mode}.sfc';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(rom)
print(out)
