#!/usr/bin/env bash
set -euo pipefail
workspace=$1
build="${XDG_CACHE_HOME:-$HOME/.cache}/rea-snes-waterbox-2.11.1"
mkdir -p "$build/waterbox"
for directory in bsnescore emulibc libco libcxx; do
  if [[ ! -d "$build/waterbox/$directory" ]]; then cp -a "$workspace/snes/upstream/BizHawk-2.11.1/waterbox/$directory" "$build/waterbox/"; fi
done
cp "$workspace/snes/upstream/BizHawk-2.11.1/waterbox/"{common.mak,linkscript.T} "$build/waterbox/"
if [[ ! -d "$build/waterbox/musl" ]]; then
  unzip -q "$workspace/snes/rea/native/musl.zip" -d "$build"
  mv "$build/musl-2063abc4e16c84218757b1db10d3cdf9f36ef3f8" "$build/waterbox/musl"
fi
if [[ ! -f "$build/waterbox/bsnescore/bsnes/gb/Core/gb.c" ]]; then
  if [[ ! -d "$build/SameBoy-20e5e181223b31fc2464a12351da6526af9bfbdc" ]]; then unzip -q "$workspace/snes/rea/native/sameboy.zip" -d "$build"; fi
  if [[ -f "$build/waterbox/bsnescore/bsnes/gb/Core" ]]; then rm "$build/waterbox/bsnescore/bsnes/gb/Core"; fi
  cp -a "$build/SameBoy-20e5e181223b31fc2464a12351da6526af9bfbdc/." "$build/waterbox/bsnescore/bsnes/gb/"
fi
if [[ ! -d "$build/waterbox/llvm-project/.git" ]]; then
  git clone --depth 1 --filter=blob:none --sparse --branch llvmorg-18.1.8 https://github.com/llvm/llvm-project.git "$build/waterbox/llvm-project"
  git -C "$build/waterbox/llvm-project" sparse-checkout set cmake compiler-rt libunwind libcxx libcxxabi runtimes
fi
export MAKEFLAGS=-j2
export CMAKE_BUILD_PARALLEL_LEVEL=2
cd "$build/waterbox/musl"
if [[ ! -f ../sysroot/lib/libc.a ]]; then
  CC=clang-18 ./wbox_configure.sh
  ./wbox_build.sh
fi
cd ../libcxx
if [[ ! -f ../sysroot/lib/libc++.a ]]; then ./do-everything.sh; fi
cd ../emulibc
make -j2
cd ../libco
make -j2
printf 'Waterbox toolchain ready: %s\n' "$build/waterbox/sysroot"
