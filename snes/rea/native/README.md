# Native bsnes PPU capture

Base: BizHawk 2.11.1, retained pristine under `snes/upstream/`. `apply_native.py` generates five patched files under `patched/` and the reviewable `ppu-capture.patch`. Added implementation is `rea_capture.hpp/cpp`; the combined core retains upstream licenses.

## Capture boundary

`PPUfast::Line::render` clears the current capture scanline. `plotAbove` and `plotBelow` copy admitted layer inputs before other layers can occlude them. OBJ evaluation and limits, layer windows, tile/Mode 7 rendering, palette lookup and mosaic have already run. The copy uses the same brightness LUT as output. Nothing reruns the game or toggles layer enables.

`Program::videoFrame` publishes the actual final framebuffer and corresponding layer samples with exactly the callback's pitch, crop and dimensions. Interlace preserves the opposite field as the native framebuffer does; capture waits for both fields after invalidation. The cycle PPU and enhanced HD/supersampled Mode 7 are reported unsupported.

Observer buffers use a static Waterbox `.invis` section. This preserves the core's existing allocation heap budget and excludes observer data from save states. Clears intentionally use volatile stores: generated libc clears otherwise leave different unused return-address bytes on a saved emulation coroutine stack. Full raw core-state hashes now match with capture on/off.

## Interface

The existing `snes_get_memory_region` ABI exposes IDs `0x52454101` (64-byte header) and `0x52454102` (published words). Access requires the Waterbox monitor. The external tool resolves the pinned core's existing managed API through reflection; managed BizHawk assemblies are unchanged.

| Byte offset | Value |
| --- | --- |
| 0, 4 | magic `0x53414552`, interface version 1 |
| 8, 12 | enabled, published frame valid |
| 16 | uint64 native generation |
| 24, 28 | width, height |
| 32, 36 | native pitch in uint16 pixels, cropped source rows |
| 40 | flags: FastPPU=1, interlace=2, HD=4, supported=16 |
| 44, 48 | pixels per plane, published byte length |
| 52, 56 | captured field mask, invalidation epoch |

Eleven contiguous uint32 LE planes: Composite; BG1 main/sub; BG2 main/sub; BG3 main/sub; BG4 main/sub; OBJ main/sub. Composite stores final RGB555 in bits 0–14. Layer words store display RGB555 in bits 0–14, presence in bit 15, priority in 16–23, source class in 24–26 and hires phase selection in bit 31. OBJ classes 4/5 distinguish palettes 0–3 and 4–7. Missing samples have no visible color. Both channels are retained even when only one is selected for the isolated panel.

The tool copies this block into immutable snapshot memory. It invalidates evidence on state load and detects emulated frames with no newly rendered PPU output. This is raster sample evidence; exact fetch-address/CPU provenance remains unavailable.

## Build

WSL Ubuntu prerequisites: make, cmake, git, unzip, clang-18, lld-18, llvm and zstd. Compilation is limited to two jobs. The persistent cache is `$HOME/.cache/rea-snes-waterbox-2.11.1`.

Pinned dependencies:

- `nattthebear/musl`: `2063abc4e16c84218757b1db10d3cdf9f36ef3f8`, retained as `musl.zip`.
- `LIJI32/SameBoy`: `20e5e181223b31fc2464a12351da6526af9bfbdc`, retained as `sameboy.zip`.
- LLVM runtime source: `llvmorg-18.1.8`, fetched sparsely by `prepare-build.sh`.

Run `apply_native.py` with the verified installed Python. Invoke `prepare-build.sh` then `build-core.sh` through WSL, passing the Linux workspace path. After prerequisites/cache exist, `Install-Core.ps1 -Build` regenerates the overlay, builds and installs it. Without `-Build`, it installs the existing built artifact. Installation refuses while any BizHawk process runs.

`stock-bsnes.wbx.zst` preserves the original core. `installed-core.json` records original/installed hashes. Preserve matching native binaries with whole-machine checkpoints or state-anchored movies; older states can be incompatible with a changed build. Power-on movies and newly created state movies/checkpoints are tested.

`test_native.cpp` exercises packing, layer independence, priority, transparency, hires duplication and invalidation without an emulator. `verify_raster.mjs` and original diagnostic ROMs exercise the real PPU path.
