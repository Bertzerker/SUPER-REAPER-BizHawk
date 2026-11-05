// SPDX-License-Identifier: MIT
#include "rea_capture.hpp"
#include <cassert>
#include <cstdlib>
#include <vector>
extern "C" void* alloc_invisible(size_t bytes) {return std::calloc(1,bytes);}
int main() {
 REA::initialize();int size,word;
 auto h=static_cast<REA::Header*>(REA::region(REA::ControlId,&size,&word));
 auto p=static_cast<uint32_t*>(REA::region(REA::PixelsId,&size,&word));
 std::vector<uint16_t> output(REA::MaxPixels);
 h->enabled=1;REA::begin_frame(false);unsigned row=8*1024;
 REA::begin_line(row,256);
 REA::sample(row,10,256,0,0,5,0x1234,false);
 REA::sample(row,10,256,0,0,2,0x0001,false); // lower priority cannot replace own-layer sample
 REA::sample(row,10,256,1,0,8,0x4567,false); // another layer never hides the first layer's evidence
 REA::sample(row,10,256,0,1,3,0x2222,false);
 REA::sample(row,11,256,4,0,0,0x3333,false); // rejected/transparent sample is absent
 output[row+10]=0x7654;
 REA::publish(output.data()+row,1024,256,224,8,1,true,false);
 assert(h->valid && h->width==256 && h->planePixels==57344);
 assert((p[10]&32767)==0x7654);
 assert((p[57344+10]&32767)==0x1234 && ((p[57344+10]>>16)&255)==5);
 assert((p[2*57344+10]&32767)==0x2222);
 assert((p[3*57344+10]&32767)==0x4567);
 assert(p[9*57344+11]==0);
 REA::begin_line(row,512);REA::sample(row,7,512,0,0,1,0x1111,true);
 REA::publish(output.data()+row,1024,512,224,8,1,true,false);
 assert((p[512*224+14]&0x80008000)==0x80008000 && p[512*224+14]==p[512*224+15]);
 REA::invalidate();assert(!h->valid);
 h->enabled=0;REA::publish(output.data()+row,1024,256,224,8,1,true,false);assert(!h->valid && !h->byteLength);
 h->enabled=1;REA::begin_frame(false);REA::publish(output.data()+row,1024,256,224,8,1,true,true);assert(!h->valid);
 auto identities=static_cast<uint64_t*>(REA::region(REA::IdentityId,&size,&word));
 h->reserved=1;h->sequence=8;
 const auto bgMain=REA::identity(16,0x10a4,0,4,true,false,1);
 const auto bgSub=REA::identity(32,0x10ac,16,4,false,true,1);
 const auto obj=REA::identity(48,127,240,4,false,true,1);
 REA::begin_frame(false);REA::begin_line(row,256,1);
 REA::sample(row,10,256,0,0,5,0x1234,false,bgMain);
 REA::sample(row,10,256,0,0,2,0x4321,false,bgSub);
 REA::sample(row,10,256,0,1,3,0x4321,false,bgSub);
 REA::object_tile(0,obj);REA::object_pixel(11,0);
 REA::sample(row,11,256,5,0,3,0x1234,false,REA::object_identity(11));
 REA::publish(output.data()+row,1024,256,224,8,1,true,false);
 assert(h->valid && (h->reserved&3)==3);
 assert(identities[10]==bgMain && identities[57344+10]==bgSub);
 assert(identities[8*57344+11]==obj && identities[8*57344+12]==0);
 REA::begin_frame(false);REA::begin_line(row,256,7);
 REA::publish(output.data()+row,1024,256,224,8,1,true,false);
 assert(h->valid && h->reserved==5);
 REA::invalidate();assert(h->reserved==1);
}
