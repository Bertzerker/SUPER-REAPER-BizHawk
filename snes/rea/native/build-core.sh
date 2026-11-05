#!/usr/bin/env bash
set -euo pipefail
workspace=$1
build="${XDG_CACHE_HOME:-$HOME/.cache}/rea-snes-waterbox-2.11.1/waterbox/bsnescore"
overlay="$workspace/snes/rea/native"
cp -a "$overlay/patched/." "$build/"
mkdir -p "$build/rea"
cp "$overlay/rea_capture."{hpp,cpp} "$build/rea/"
cd "$build"
make -j2
zstd -q -f -6 obj/release/bsnes.wbx -o "$overlay/bsnes-rea.wbx.zst"
sha256sum obj/release/bsnes.wbx "$overlay/bsnes-rea.wbx.zst"
