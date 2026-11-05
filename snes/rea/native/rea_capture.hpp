// SPDX-License-Identifier: MIT
#pragma once
#include <cstdint>
namespace REA {
constexpr int ControlId = 0x52454101;
constexpr int PixelsId = 0x52454102;
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
void begin_line(unsigned address, unsigned width);
void sample(unsigned address, unsigned x, unsigned width, unsigned source, unsigned screen, unsigned priority, uint16_t color, bool hires);
void publish(const uint16_t* data, unsigned pitch, unsigned width, unsigned height, unsigned cropRows, unsigned scale, bool fast, bool hd);
void* region(int id, int* size, int* wordSize);
}
