"""Create a small reviewable native overlay; keep the downloaded tag pristine."""
from pathlib import Path
import difflib

here=Path(__file__).resolve().parent
upstream=here.parents[1]/'upstream'/'BizHawk-2.11.1'/'waterbox'/'bsnescore'
destination=here/'patched'
changes={}
def patch(relative, substitutions):
    original=(upstream/relative).read_text(encoding='utf-8')
    text=original
    for old,new in substitutions:
        if text.count(old)!=1:
            raise ValueError(f'{relative}: expected one exact patch site, got {text.count(old)} for {old[:70]!r}')
        text=text.replace(old,new,1)
    out=destination/relative
    out.parent.mkdir(parents=True,exist_ok=True)
    if not out.exists() or out.read_text(encoding='utf-8')!=text:
        out.write_text(text,encoding='utf-8',newline='\n')
    changes[relative]=(original,text)

patch('Makefile',[
    ('-I../libco -I./bsnes', '-I../libco -I./bsnes -I./rea'),
    ('SRCS = $(SRCS_PROCESSORS)', 'SRCS = $(ROOT_DIR)/rea/rea_capture.cpp $(SRCS_PROCESSORS)'),
])
patch('bsnes/sfc/ppu-fast/ppu.cpp',[
    ('#include <sfc/sfc.hpp>', '#include <sfc/sfc.hpp>\n#include <rea_capture.hpp>'),
    ('    ppubase.display.interlace = io.interlace;', '    REA::begin_frame(io.interlace);\n    ppubase.display.interlace = io.interlace;'),
])
address='((this->y + (!ppu.latch.overscan ? 7 : 0)) * 1024 + (ppu.interlace() && field() ? 512 : 0))'
patch('bsnes/sfc/ppu-fast/line.cpp',[
    ('  if(io.displayDisable) {', '  if(!hd && !ss) REA::begin_line('+address+', width);\n\n  if(io.displayDisable) {'),
    ('  if(priority > above[x].priority) above[x] = {source, priority, color};',
     '  REA::sample('+address+', x, ppu.hires() ? 512 : 256, source, 0, priority, ppu.lightTable[io.displayBrightness][color], io.pseudoHires || io.bgMode == 5 || io.bgMode == 6);\n  if(priority > above[x].priority) above[x] = {source, priority, color};'),
    ('  if(priority > below[x].priority) below[x] = {source, priority, color};',
     '  REA::sample('+address+', x, ppu.hires() ? 512 : 256, source, 1, priority, ppu.lightTable[io.displayBrightness][color], io.pseudoHires || io.bgMode == 5 || io.bgMode == 6);\n  if(priority > below[x].priority) below[x] = {source, priority, color};'),
])
patch('bsnes/target-bsnescore/bsnescore.cpp',[
    ('#include "bsnescore.hpp"', '#include "bsnescore.hpp"\n#include <rea_capture.hpp>'),
    ('    emulator = new SuperFamicom::Interface;', '    REA::initialize();\n    emulator = new SuperFamicom::Interface;'),
    ('EXPORT void snes_unserialize(const uint8_t* data, int size)\n{', 'EXPORT void snes_unserialize(const uint8_t* data, int size)\n{\n    REA::invalidate();'),
    ('    bool fast_ppu = SuperFamicom::system.fastPPU();',
     '    if(id == REA::ControlId || id == REA::PixelsId) return REA::region(id, size, word_size);\n    bool fast_ppu = SuperFamicom::system.fastPPU();'),
])
patch('bsnes/target-bsnescore/program.cpp',[
    ('\tpitch >>= 1;\n\tif (!overscan)', '\tpitch >>= 1;\n\tuint reaCropRows = !overscan ? 8 * (height / 240) : 0;\n\tif (!overscan)'),
    (' \tsnesCallbacks.snes_video_frame(data, width, height, pitch);',
     '    REA::publish(data, pitch, width, height, reaCropRows, scale, ::SuperFamicom::system.fastPPU(), ::SuperFamicom::ppufast.latch.hd || ::SuperFamicom::ppufast.latch.ss);\n \tsnesCallbacks.snes_video_frame(data, width, height, pitch);'),
])
diff=''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+f,tofile='b/'+f)) for f,(a,b) in changes.items())
(here/'ppu-capture.patch').write_text(diff,encoding='utf-8',newline='\n')
print(f'Prepared {len(changes)} patched native files in {destination}')
