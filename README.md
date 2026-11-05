# SUPER REAPER - BizHawk

A Super Nintendo inspection workbench for **BizHawk 2.11.1 / BSNESv115+**, with TAS/input movies and frame-linked investigation notes.

- Six synchronized native views: Composite, OBJ and BG1–4. Layer samples come directly from the PPU render pipeline.
- Play, pause, frame stepping and playback speed; BK2 recording/read-only replay and native TAStudio.
- Frozen pixel inspection, copied memory, explicit baselines and saved-to-saved memory diffs.
- Frame comments with Markdown, JSON and Mermaid; immutable graphics/memory evidence and archived BK2 versions.
- Investigation ZIP exports with offline SHA256 verification, recoverable drafts and revision conflicts.
- Persistent compatible checkpoints and interruptible input experiments.
- One BizHawk instance at a time. Browser evidence review is independent of the live machine.

## Quick start on Windows

Install **PowerShell 7** and **Node.js 22 or newer**. Python 3 is needed only for generated diagnostic games and the independent ZIP verifier/tests. Use an absolute installed interpreter path with `REA_PYTHON`; Windows Store aliases are rejected.

```powershell
./Setup.ps1
./snes/rea/Start-REA.ps1 -Rom 'C:/path/to/your/game.sfc' -Wait
```

Open **http://127.0.0.1:8900/**. Play with the keyboard/controller configured in the native BizHawk window. The launcher refuses a second instance. Closing its BizHawk window also stops its server when `-Wait` is used.

Setup downloads the official pinned BizHawk release, verifies SHA256, and installs the included matching REA DLL/native core. It never launches an emulator or changes a system-wide installation. It refuses replacement while BizHawk is running. `Setup.ps1 -VerifyOnly` checks bundled binaries without installing anything; `-Archive` accepts an already downloaded release ZIP.

**No commercial ROMs, firmware, user movies, checkpoints, notes, memory dumps, local configuration or dependency installation folders are included.** The checked-in memory/render fixtures come from this project's original diagnostic programs and has sanitized metadata. Runtime artifacts remain ignored.

For an original diagnostic instead of a commercial game:

```powershell
$env:REA_PYTHON = 'C:/path/to/installed/python.exe'
./snes/rea/Start-REA.ps1 -Diagnostic -Mute -Wait
```

Auto region detection follows the ROM header. Some beta ROMs with USA filenames identify as PAL. Change the region deliberately in native SNES sync settings if needed; matching sync settings are required for movies/checkpoints. This checkout does not publish a machine-specific NTSC override.

## Inspect and document a frame

Selecting a pixel pins its capture before lookup. The adjacent Selection, Memory and Registers tools use that evidence. **Resume inspection** returns to live presentation without changing the machine's playback state.

**Comment displayed** saves the visible frame while the machine may continue; **Pause & capture current frame** pauses and captures the current machine state. Write Markdown with fenced `json`/`mermaid` blocks, or choose standalone JSON/Mermaid. Saved evidence can be inspected after restart without rewinding the emulator. **Export evidence ZIP** and saved-note **Investigation ZIP** downloads include manifests; archived BK2 is included when attached to a saved note.

## Build, source and tests

The repository contains the REA source, reviewable native overlay, pinned dependency archives, bundled browser renderer/notices, and ready-to-install matching binaries under `dist/`. `dist/manifest.json` records their SHA256 and sizes. Upstream BizHawk assemblies remain unchanged; only the external tool and the BSNES native observer are added.

```powershell
# Download the matching complete upstream source as well as the emulator.
./Setup.ps1 -WithSource

# Requires .NET SDK Roslyn and .NET Framework 4.8 developer/reference assemblies.
# Close BizHawk first; never build over a loaded tool/core.
./snes/rea/Build.ps1

# Original diagnostic fixture tests; no emulator launch or commercial ROM needed.
$env:REA_PYTHON = 'C:/path/to/installed/python.exe'
./Test.ps1
```

See [native implementation/build instructions](snes/rea/native/README.md), [detailed usage and local API](snes/rea/README.md), and [implementation scope](snes/rea/SPEC.md). Native rebuilding uses WSL Ubuntu with two compilation jobs; source generation and native installation refuse a running BizHawk instance. The corresponding base source is the pinned [BizHawk 2.11.1 tag](https://github.com/TASEmulators/BizHawk/tree/2.11.1), plus this repository's `snes/rea/native` overlay and the pinned dependencies documented there.

Browser assets are prebundled for offline use. Rebuild them with `npm ci --prefix snes/rea/ui-deps` followed by `node snes/rea/ui-deps/build.mjs`.

## Validation and limits

17 protocol/API/workbench regression tests passed. Native checks covered deterministic BK2 replay, checkpoints, frame comments, palette/brightness/scroll/window changes, sprite limits, Mode 7, hires, interlace, and unchanged core-state/output hashes with capture enabled/disabled.

On the development workstation, a 30-second NTSC run with all six views measured **60.11 emulated FPS / 59.95 unique displayed FPS**, with no source gaps, invalid captures or server drops. Results depend on workload and hardware. WebGL is the normal renderer; its exact Canvas 2D fallback is explicitly capped at 30 displayed updates/sec. Standard FastPPU is supported; cycle PPU and enhanced HD Mode 7 layer capture are unavailable. Isolated layers retain inputs before color math; Composite retains the final blend.

Exact CPU/DMA/fetch provenance, bounded CPU trace/watch services and verified commercial-game collision adapters remain unsupported. OAM rectangles are hardware diagnostics, not game hitboxes. The browser supplies inspection/control tools; automatic game completion is not implemented.

## Licenses and upstream

REA tool/server/UI/observer additions: [MIT](LICENSE). BizHawk and included native components retain their respective upstream licenses and notices; the whole emulator/core is not relicensed as MIT. See [BizHawk's notice](snes/LICENSE.BizHawk), the pinned complete upstream source, bundled browser `.LEGAL.txt`, and `licenses/` for dependency license texts. This project is independent of the upstream BizHawk team.
