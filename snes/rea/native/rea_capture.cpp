// SPDX-License-Identifier: MIT
// Observer buffers deliberately use Waterbox's non-savestated invisible heap.
#include "rea_capture.hpp"
#include <emulibc.h>
#include <cstring>
namespace REA {
struct Capture {
  Header header;
  uint32_t work[10][MaxPixels];
  uint32_t published[11 * MaxPixels];
  bool previousEnabled, interlace;
  uint32_t previousEpoch;
  bool identify, unsupportedIdentity;
};
// At most 4.7 MiB per sampled frame, and never part of the normal browser stream.
static uint64_t identities[10][IdentityPixels] ECL_INVISIBLE;
static uint64_t publishedIdentities[10 * IdentityPixels] ECL_INVISIBLE;
static uint64_t objectTiles[128] ECL_INVISIBLE;
static uint64_t objectPixels[256] ECL_INVISIBLE;
static Capture storage ECL_INVISIBLE;
static Capture* capture = &storage;
void initialize() {
  if(capture->header.magic == 0x53414552) return;
  std::memset(capture, 0, sizeof(Capture));
  capture->header.magic = 0x53414552; // REAS
  capture->header.version = 1;
}
void invalidate() {
  if(!capture) return;
  capture->header.valid = 0;
  capture->header.reserved &= 1;
  capture->header.epoch++;
}
void begin_frame(bool interlace) {
  if(!capture) return;
  auto& c = *capture;
  c.header.reserved &= 1;
  c.identify = c.header.enabled && (c.header.reserved & 1) && c.header.sequence % 4 == 0;
  c.unsupportedIdentity = interlace;
  if(c.identify && !interlace) for(auto& plane : identities) {
    volatile uint64_t* p = plane;
    for(unsigned i=0;i<IdentityPixels;i++) p[i]=0;
  }
  if(!c.header.enabled) { c.previousEnabled = false; c.header.valid = 0; return; }
  if(!c.previousEnabled || c.interlace != interlace || c.previousEpoch != c.header.epoch) {
    // Volatile clears prevent a synthesized libc call from leaving a different
    // unused return-address slot in the emulated coroutine's saved stack.
    for(auto& plane : c.work) { volatile uint32_t* p = plane; for(unsigned i=0;i<MaxPixels;i++) p[i]=0; }
    c.header.fieldMask = 0;
  }
  c.previousEpoch = c.header.epoch;
  c.previousEnabled = true;
  c.interlace = interlace;
  c.header.valid = 0;
}
bool identifying() { return capture->identify && !capture->unsupportedIdentity; }
void object_tile(unsigned index, uint64_t value) { if(identifying()) objectTiles[index] = value; }
void object_pixel(unsigned x, unsigned tile) { if(identifying()) objectPixels[x] = objectTiles[tile]; }
uint64_t object_identity(unsigned x) { return identifying() ? objectPixels[x] : 0; }
void begin_line(unsigned address, unsigned width, unsigned mode) {
  if(!capture || !capture->header.enabled || address + 512 > MaxPixels || width > 512) return;
  for(auto& plane : capture->work) { volatile uint32_t* p = plane + address; for(unsigned i=0;i<512;i++) p[i]=0; }
  if((capture->header.reserved & 1) && (width != 256 || mode > 4)) capture->unsupportedIdentity = true;
  capture->header.fieldMask |= capture->interlace ? 1u << ((address / 512) & 1) : 1;
}
void sample(unsigned address, unsigned x, unsigned width, unsigned source, unsigned screen, unsigned priority, uint16_t color, bool hires, uint64_t identity) {
  if(!capture || !capture->header.enabled || !priority || source > 5 || screen > 1 || x >= 256 || width > 512) return;
  unsigned layer = source >= 4 ? 4 : source;
  unsigned offset = address + (width == 512 ? x * 2 : x);
  if(offset + (width == 512) >= MaxPixels) return;
  uint32_t value = (color & 0x7fff) | 0x8000 | ((priority & 255) << 16) | (source << 24) | (hires ? 0x80000000 : 0);
  auto& plane = capture->work[layer * 2 + screen];
  if(priority > ((plane[offset] >> 16) & 255)) {
    plane[offset] = value;
    if(width == 512) plane[offset + 1] = value;
    if(identifying()) {
      unsigned at = address / 1024 * 256 + x;
      if(at < IdentityPixels) identities[layer * 2 + screen][at] = identity;
    }
  }
}
void publish(const uint16_t* data, unsigned pitch, unsigned width, unsigned height, unsigned cropRows, unsigned scale, bool fast, bool hd) {
  if(!capture) return;
  auto& c = *capture; auto& h = c.header;
  h.sequence++; h.width = width; h.height = height; h.pitch = pitch; h.cropRows = cropRows;
  h.flags = (fast ? 1u : 0u) | (c.interlace ? 2u : 0u) | (hd ? 4u : 0u);
  h.valid = 0; h.planePixels = 0; h.byteLength = 0;
  if(!h.enabled || !fast || hd || scale != 1 || width > 512 || height > 480 || !width || !height) return;
  if(c.interlace && h.fieldMask != 3) return;
  const unsigned pixels = width * height;
  for(unsigned y = 0; y < height; y++) for(unsigned x = 0; x < width; x++) {
    unsigned dst = y * width + x, src = (y + cropRows) * pitch + x;
    if(src >= MaxPixels) return;
    c.published[dst] = (data[y * pitch + x] & 0x7fff) | 0x8000;
    for(unsigned plane = 0; plane < 10; plane++) c.published[(plane + 1) * pixels + dst] = c.work[plane][src];
  }
  h.flags |= 16; h.planePixels = pixels; h.byteLength = 11 * pixels * 4; h.valid = 1;
  if(c.unsupportedIdentity || width != 256 || height + cropRows > 240) h.reserved |= 4;
  else if(c.identify) {
    for(unsigned plane = 0; plane < 10; plane++) {
      auto* src = identities[plane] + cropRows * width;
      auto* dst = publishedIdentities + plane * pixels;
      for(unsigned i=0;i<pixels;i++) dst[i]=src[i];
    }
    h.reserved |= 2;
  }
}
void* region(int id, int* size, int* wordSize) {
  if(!capture) return nullptr;
  *wordSize = 4;
  if(id == ControlId) { *size = sizeof(Header); return &capture->header; }
  if(id == PixelsId) { *size = sizeof(capture->published); return capture->published; }
  if(id == IdentityId) { *size = sizeof(publishedIdentities); return publishedIdentities; }
  return nullptr;
}
}
