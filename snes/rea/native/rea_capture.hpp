// SPDX-License-Identifier: MIT
#pragma once
#include <cstdint>
namespace REA {
constexpr int ControlId = 0x52454101;
constexpr int PixelsId = 0x52454102;
constexpr int IdentityId = 0x52454103;
constexpr unsigned IdentityPixels = 256 * 240;
constexpr unsigned MaxPixels = 512 * 480;
struct Header {
  uint32_t magic, version, enabled, valid;
  uint64_t sequence;
  uint32_t width, height, pitch, cropRows, flags, planePixels, byteLength, fieldMask, epoch, reserved;
};
static_assert(sizeof(Header) == 64);
void initialize();
void invalidate();
void begin_frame(bool interlace);
void begin_line(unsigned address, unsigned width, unsigned mode = 0);
bool identifying();
void object_tile(unsigned index, uint64_t identity);
void object_pixel(unsigned x, unsigned tile);
uint64_t object_identity(unsigned x);
inline uint64_t identity(unsigned pattern, unsigned locator, unsigned palette, unsigned bpp, bool hflip, bool vflip, unsigned mode, bool direct = false) {
  return (1ull << 63) | (pattern & 0x7fff) | ((locator & 0x7fff) << 15)
    | (uint64_t(palette & 255) << 32) | (uint64_t(bpp & 15) << 40)
    | (uint64_t(hflip) << 44) | (uint64_t(vflip) << 45) | (uint64_t(mode & 7) << 46)
    | (uint64_t(direct) << 49);
}
void sample(unsigned address, unsigned x, unsigned width, unsigned source, unsigned screen, unsigned priority, uint16_t color, bool hires, uint64_t identity = 0);
void publish(const uint16_t* data, unsigned pitch, unsigned width, unsigned height, unsigned cropRows, unsigned scale, bool fast, bool hd);
void* region(int id, int* size, int* wordSize);
}
