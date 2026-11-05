# REA Super Nintendo inspector

BizHawk **2.11.1**, using **BSNESv115+**, with a locally built inspection tool and native PPU capture extension. Managed emulator binaries remain upstream; `bsnes.wbx.zst` is rebuilt from the matching tag with the reviewable overlay in `native/`. Movie recording/replay, TAStudio, Lua and native debugging tools are preserved.

## Run

From the REA Emulators workspace in PowerShell:

```powershell
./snes/rea/Start-REA.ps1 -Rom 'C:/path/to/game.sfc' -Wait
```

Open **http://127.0.0.1:8900/** in the Codex in-app browser. Play using the visible BizHawk window. Configure your keyboard/controller in BizHawk's input settings. The launcher refuses to start while any BizHawk process is already running. It never closes another emulator for you. Closing BizHawk also stops the local server when `-Wait` is used.

Options: `-Paused`, `-Mute`, `-Port 8900`, `-StreamPort 8901`, and `-Movie 'C:/path/to/recording.bk2'`. The HTTP and stream ports must be distinct and free. `-Diagnostic -Mute -Wait` generates and runs an original SNES diagnostic instead of a commercial ROM. Diagnostics use a separate configuration from normal gameplay.

The inspector captures **every emulated frame by default**, with host frame skipping disabled. It displays the core's actual region and source cadence. NTSC BSNESv115+ reports approximately **60.099 Hz**; PAL reports **50.007 Hz**. The supplied Contra beta was auto-detected as PAL despite its filename. The user's explicit NTSC override is preserved in the gameplay configuration; no ROM bytes were changed. Existing movies/checkpoints must match their original region/sync settings.

The version notice is fixed: a fresh generated configuration includes `LastWrittenFrom: 2.11.1`. The launcher selects the matching SNES core and records the exact built tool's SHA512 in this local configuration's trusted-tool list. It leaves the installed system-wide emulator/configuration alone.

## Record a demonstration for the AI

1. Enter a movie name in the inspector, using letters, digits, `-` or `_`.
2. Choose **From current state** to demonstrate the current section, or **From power-on** for a complete run. Power-on restarts the game.
3. Click **Record inputs**. Recording starts paused. Click **Play**, then play in the BizHawk window with your normal keyboard/controller.
4. Click **Pause**, then **Save & stop**. **Save movie** also saves an active recording without stopping it.
5. Click **Load / restart named movie**, then **Play** or **Step frame**. Playback is read-only so AI input commands cannot accidentally change your demonstration.

Files are saved in `snes/rea/movies/<name>.bk2`. A movie is an input recording, rather than a video. Preserve the matching ROM, BizHawk/core version, sync settings, and any required firmware or external game assets. A current-state movie embeds its starting core state. Movie input row zero is relative to that movie, including when the demonstrated section starts later in the game.

Use **Open TAStudio** for BizHawk's native timeline editor, branching and rerecording workflow. Save/stop an active recording before starting another recording or loading a different movie through this inspector. Existing named recordings are never overwritten by **Record inputs**.

## Play, pause, speed and frame comments

Choose a recording from **Saved movie**, then **Play / resume movie**. **Pause movie**, the top **Play/Pause** controls and **Step frame** control the same single emulator. **Load / restart named movie** restarts read-only playback; it refuses to interrupt an active recording. Playback is read-only. Select **Speed** above the render for 0.1×, 0.25×, 0.5×, 0.75×, 1×, 1.5×, 2× or 4×. These are requested emulation rates; the machine may limit faster rates. Speed changes do not rewrite recorded inputs.

**Comment displayed** pins and saves the exact evidence visible in the inspector while the live machine can continue. **Pause & capture current frame** instead pauses the machine and waits for its current render/memory capture. Both save all six views, the composite, all exposed memory domains, native PPU evidence and metadata. A complete rendered frame is required. Each comment records its ROM/core, movie filename, movie frame, preceding input row, and capture ID. Movie frame N describes the state after input row N−1; frame zero precedes the first input. Savestate-based movies start their own movie frame numbering at zero.

Use **Markdown** for headings, lists, tables and mixed fenced `json`/`mermaid` blocks, **JSON** for a validated structured note, or **Mermaid diagram** for a standalone diagram. **Insert JSON block** and **Insert Mermaid diagram** provide editable examples. **Preview** renders the note; **Save comment** writes it to disk. The browser also retains an unsaved draft for recovery. Revision checks prevent another tab's edit being overwritten silently. Markdown HTML is sanitized and Mermaid uses strict rendering; previews load bundled local assets, without a CDN.

The **Frame comments** list reopens saved notes. **Inspect saved frame** displays the persisted six-view capture and reads its saved memory/pixels, even after live captures expire or the server restarts. It does not restore/rewind the emulator. **Return to live** leaves saved-evidence inspection. Comments are frame-linked sidecars, rather than modifications to input rows. A versioned BK2 copy and SHA256 are archived with the comment when the associated movie is available in this inspector's local `movies/` folder. External/TAS-project movies still receive filename/frame references, but are not copied as BK2. Later recording edits do not change an archived comment's evidence/movie copy.

**Discard draft** preserves a recoverable copy; **Recover discarded draft** restores it and **Export draft** downloads JSON. A revision conflict displays the server version alongside the preserved source. Explicitly load that version or keep your draft against its latest revision, then save. Observation, Hypothesis and Question categories describe the note, without changing its immutable evidence.

Files live under `snes/rea/annotations/<id>/`: `annotation.json`, `comment.md`, `snapshot.json`, `atlas.png`, `composite.png`, `memory.bin`, `capture.bin`, and an optional `movie.bk2`. Download links are included in the editor. The JSON records memory-domain offsets and evidence hashes; Markdown exports include movie/frame context. These are inspection snapshots, not restorable whole-machine save states; use checkpoints for restoration. Keep the annotation folder with its BK2 copy when sharing the evidence.

The dependency-free server is unchanged at runtime. Rich preview code is prebundled in `public/vendor/note-renderer.mjs` from pinned Marked 18.1.3, DOMPurify 3.4.17 and Mermaid 12.3.0. To rebuild that asset, run `npm ci --prefix snes/rea/ui-deps` and `node snes/rea/ui-deps/build.mjs`. Its generated `.LEGAL.txt` accompanies the bundle. See [Marked's sanitation guidance](https://marked.js.org/using_advanced) and [Mermaid's rendering API](https://mermaid.js.org/config/usage).

The AI can inspect the active input log through `movie-inputs`, or export a saved digital-gamepad movie without launching an emulator:

```powershell
& 'C:/path/to/installed/python.exe' ./snes/rea/export_movie.py `
  ./snes/rea/movies/playthrough.bk2 --out ./snes/rea/test-output/playthrough-inputs.json
```

The exporter preserves ROM/core metadata, synchronization settings, controller button order, every raw mnemonic, and the pressed buttons for each input row. It refuses unsupported peripherals/analog layouts rather than guessing. It refuses an existing output file.

## Graphics and evidence

The combined atlas contains **Composite, OBJ, BG1, BG2, BG3 and BG4** from one completed native PPU capture, with identical renderer crop and output dimensions. Snapshots include a native render generation as well as the inspector ID. The separate OBJ tile preview remains a memory diagnostic, outside these six views.

- **Composite** captures final PPU output after color math and brightness.
- **OBJ and BG1–4** capture the actual renderer samples in `plotAbove`/`plotBelow`. Layer enables, transparency, BG/OBJ windows, sprite evaluation/limits, scrolling, mosaic, direct color and Mode 7 have already run. Colors use the renderer's raster-time palette and brightness, never end-of-frame CGRAM.
- Isolated panels show inputs before inter-layer color math. Main input is preferred, with sub input shown when main is absent; hires alternates sub/main phases. The raw capture retains both channels, presence, priorities and source classes, exposed by `/api/pixel` as `nativeSamples`. Final blends remain visible in Composite.
- Disabled/masked/inactive samples are transparent. An inactive BG4 is a valid empty capture.
- Standard **FastPPU** rendering is supported, including hires and interlace. The cycle PPU and enhanced HD/supersampled Mode 7 are explicitly unavailable for layer capture. There is no reconstruction fallback. These captures reproduce the selected renderer, retaining its own hardware-accuracy limits.

Capture buffers use Waterbox's non-savestated `.invis` section. Full core-state and framebuffer hashes match with capture enabled and disabled. State load/reset invalidates old layer evidence until a fresh complete frame is rendered (both fields where needed). Missing new PPU output is explicitly reported. The OAM bounds overlay and sprite list remain end-of-frame memory diagnostics, separate from raster-time object identity and game hitboxes.

**Freeze inspection** retains the current capture while emulation can continue. Memory and pixel queries identify their capture/frame. The displayed memory refreshes twice a second, separately from graphics, with its own frame label. Offsets are relative to each memory domain; WRAM offset zero corresponds to bus `$7E0000`. Reads use direct memory domains and logical PPU data, not side-effecting hardware-port reads.

Pixel selection freezes and leases its capture before lookup; superseded responses are discarded. The adjacent Selection/Memory/Registers inspector follows that evidence ID. Choose a focused graphics view and Fit/1×/2× scale, or inspect coordinates using the labeled form. On the canvas, arrow keys move coordinates, Shift moves eight pixels, and Enter inspects. Composite remains captured output; OBJ and BG1–4 remain captured inputs. A lost/unavailable WebGL context falls back to exact Canvas 2D presentation capped at 30 updates/sec; note review and downloads remain available.

In **Memory**, choose a domain, offset and 1–4096 bytes. Reads clip at the last valid byte. **Set displayed as baseline** retains an explicit comparison capture; **Saved baseline** also supports disk evidence. Changed bytes are highlighted, with before/after values in their titles and both capture IDs shown. ROM/core/build or domain-layout mismatches reject comparison.

The toolbar separates live execution from LIVE/FROZEN/SAVED evidence. Server availability, emulator connection, valid capture and capture age are separate states. Historical movie metadata stays with saved evidence. Disconnected, recording, read-only, pending-command and unknown-outcome states explain disabled controls; **Requery state** resolves uncertain outcomes without retrying a command. Pause can interrupt a bounded input run.

Use the **Checkpoints** drawer to inspect persistent disk states and ROM/core/version/sync/native-binary compatibility before restoration. Legacy states lacking binary identity are labeled. **Execution** runs 1–3600 frames with named buttons, or recorded movie inputs during read-only playback, and reports actual completed frames, including interruption.

**Export evidence ZIP** downloads the displayed capture with native data, memory, PNGs, metadata, a note and a SHA256 manifest. A saved comment's **Investigation ZIP** also contains its revision and archived BK2 when available. These exports are inspection snapshots, not restorable checkpoints. Verify an exported bundle without an emulator or server:

```powershell
& 'C:/path/to/installed/python.exe' ./snes/rea/verify_bundle.py ./evidence.zip
```

Native sample colors/priorities are captured. Exact VRAM fetch addresses, CPU/DMA provenance, gameplay hitboxes and automatic object recovery remain unimplemented and have separate capability flags.

## Sprite & tile catalog

Open **Sprite & tile catalog** and enable native catalog sampling. Resume or step at least four rendered frames. Use **Inspect latest catalog frame** to pin a sampled frame, then select a pixel in Composite, OBJ or BG1–4. **Read seed evidence** lists the admitted sources at that coordinate. For Composite, the list gives layer candidates before composition. Select a source and name the entry with **Add to catalog**. Use **Append seed to entry** for additional animation tiles or related patterns. The palette variants checkbox relaxes only that selector’s palette. Names, labels, notes and typed selectors are editable. Use the search field and kind filter to find entries, and the JSON editor to copy or import catalogs with the same ROM and core settings.

**Show all matches** displays transparent isolation in native screen coordinates. Choose Displayed layer, Main or Sub to select which captured channel to inspect. Each layer shows its admitted samples before inter-layer color math. OBJ identity comes from the object that won sprite evaluation at that pixel. The view omits transparent, masked and losing OBJ pixels. A BG match records the pattern base and map word used by the renderer, including tile selection, flips, depth, mode and palette information. These are pattern-base locations. The capture does not log every VRAM read or its CPU/DMA origin.

Standard 256-pixel non-interlaced FastPPU Modes 0–4 support native catalog identity. Native diagnostics verified BG1–4 in Mode 0 and live/replay OBJ and BG1 in Mode 1. Modes 2–4 have no dedicated end-to-end runs. The core disables native catalog identity in hires, interlace, Mode 7, cycle PPU and enhanced HD geometry. The six original layer views retain their existing mode support. **OAM slot diagnostic** uses the copied slot and its 4bpp patterns in screen coordinates. **VRAM tile diagnostic** uses OBJ table 0 in an 8×8 tile grid. These diagnostics use end-of-frame memory and report that class separately. OAM diagnosis uses slot order, with no raster masking, priority rotation, or exact interlace mapping.

Use **Return to live**, show matches, and select a candidate before clicking **Follow instance**. Native follow keeps the selected OAM slot or BG map/pattern locator within short capture, position and shape limits. It stops after loss, ambiguity, a ROM or state change, a movie restart, or a capture gap. Pick again to resume. A hardware locator can be reused, and identical nearby reuse can be indistinguishable. Follow is a continuity estimate. Tile matches use screen coordinates. Diagnostic views support isolation and annotation.

**Pin catalog result** keeps the displayed isolation and capture while the machine continues. **Attach to comment** saves its capture ID, entry revision, selector digest, bounds, layer/channel, evidence class and movie frame/input row with the frame note. The note keeps those values and the isolated PNG through later catalog edits. BK2 playback started through REA records the loaded file’s SHA256. The annotation archives matching local movie bytes when available. TAStudio project evidence retains the movie reference and frame context. The saved comment’s Investigation ZIP includes the hashed catalog JSON and PNG.

Catalogs are versioned local JSON files under `rea/catalogs/`. Their key includes the ROM SHA-1, console, core, BizHawk version and sync identity. Writes check the catalog revision and atomically replace the file. A seed can come from pinned or archived evidence without changing emulator state. Catalogs, comments and captures remain local user files.

Sampling is opt-in and requires the normal capture cadence. The core generates at most one full identity packet every four completed renders. For 256×224 output that adds 4,587,520 bytes to the selected native producer packet. The normal browser atlas stream excludes the identity planes. The catalog panel requests bounded match images and candidate lists separately. `measure_live.mjs` reports sampled packet counts and identity bytes with the existing delivery metrics.

## Performance path

The emulation thread copies native samples directly into one of six reusable host buffers, together with that frame's memory/register data. A dedicated worker creates all six panels, OAM metadata, the small 4bpp tile preview, JSON and the TCP packet from those detached copies. It never reads live emulator memory. Large native-word, atlas, domain and packet buffers are reused after ownership returns; a bounded queue absorbs short encoder/transport pauses without blocking emulation, with exhaustion explicitly counted. The bridge no longer decodes every tile format or repeatedly calls native OAM accessors to build sprite metadata.

The server retains full raw evidence for `/api/live` and `/api/pixel`. Browser WebSocket packets carry the atlas, memory and tile preview, omitting duplicate native planes. Lossless 32-bit literal/repeat runs reduce transport size; incompressible packets fall back to raw bytes. No palette reduction, image reconstruction or general-purpose compression worker is involved. Reload the viewer after updating the stream protocol.

The viewer reuses one WebGL texture and leased decode buffers, updates existing UI only when it changes, and buffers six captures before paced presentation, with a maximum queue of ten. This adds about 100 ms at NTSC speed to absorb short scheduling delays. Presentation follows the source cadence capped at 60 updates/sec; a 60 Hz display cannot present all 60.099 NTSC source frames each second, so occasional bounded queue drops are expected. Excess captures never create unbounded latency. Paused/frozen frames are not counted as new displayed gameplay frames. Browser presentation counters are posted locally to `/api/viewer` and exposed by `/api/metrics`.

## Local AI API

The server binds **127.0.0.1 only**. HTTP Host and browser Origin are checked. Read endpoints use GET. Control requires POST JSON and an `X-REA-Token` obtained from `/api/session`. This is a local development interface; it is not an MCP server registration.

| Endpoint | Result |
| --- | --- |
| `/api/session` | Control token, capabilities and connection metrics |
| `/api/snapshot` | Metadata; optional `snapshot=<id>`; retains the requested evidence |
| `/api/live` | Binary metadata + memory + BGRA atlas + tile preview + native planar samples; optional `snapshot` |
| `/api/history` | Last sixteen streamed capture IDs and frame numbers |
| `/api/memory` | `space=WRAM`, `start=0x10`, `length=4`, optional `snapshot`; length 1–4096 |
| `/api/diff` | Memory range above, plus `from=<older-id>` and optional new `snapshot` |
| `/api/compare` | Compatible memory pair: `from`/`fromNote`, `to`/`toNote`, `space`, `start`, `length`; before/after bytes and changes |
| `/api/pin`, `/api/unpin` | POST token, owner UUID, `evidence`/`baseline` slot and monotonic generation; bounded capture leases |
| `/api/export` | Investigation ZIP for `snapshot=<id>` or `Note=<annotation UUID>` |
| `/api/checkpoints` | Persistent checkpoint metadata, current compatibility, warnings and lifetime |
| `/api/sprites` | OAM sprite metadata, explicitly labeled hardware bounds |
| `/api/pixel` | `view=composite|obj|bg1|bg2|bg3|bg4`, `x`, `y`, optional `snapshot`; RGB and evidence classification |
| `/api/image` | PNG; `view=atlas|composite|obj|bg1|bg2|bg3|bg4|tiles`, optional `snapshot` |
| `/api/movies` | Saved BK2 filenames in the local movie directory |
| `/api/annotations` | Persistent frame-comment summaries; optional `rom` and `movie` filters |
| `/api/annotations/capture` | POST with control token; pause/capture current frame, or provide a frozen `snapshot` ID |
| `/api/annotations/<id>` | GET note; POST `{revision,title,format,category,body}` with control token to update |
| `/api/annotations/<id>/memory`, `/pixel`, `/image` | Inspect saved evidence with the corresponding live-query parameters |
| `/api/annotations/<id>/<file>` | Download saved note, image, binary evidence or archived movie |
| `/api/metrics` | Capture count, packet errors, backpressure drops and connection state |
| `/stream` | Compact lossless binary WebSocket stream; decode with `public/transport.mjs`; one combined atlas per capture |

Explicit snapshot/memory/pixel/image requests retain up to sixteen captures in addition to the last sixteen streamed captures. Expired IDs return 404. Session-qualified sequence IDs remain unique when frame numbers rewind. These copies are inspection evidence; use checkpoints to restore the machine.

Control actions at `/api/control`:

| JSON action | Extra fields / effect |
| --- | --- |
| `pause`, `resume` | Control emulation; Pause can interrupt a running bounded step |
| `speed` | `percent: 10|25|50|75|100|150|200|400`; requested playback/recording rate |
| `step` | `frames: 1..3600`; optional `buttons: {"P1 Right":true}`. Unspecified buttons are released during an explicit input step. Without `buttons`, a loaded movie supplies input. Returns the resulting frame and snapshot ID. |
| `record` | `name`, `start: "checkpoint"|"poweron"`, optional `author` |
| `movie-save`, `movie-stop` | Save active movie; save and stop active movie |
| `play` | `name`; loads a saved local BK2, paused and read-only |
| `movie-inputs` | `start` input row, `length: 1..4096`; returns buttons and raw mnemonics |
| `checkpoint-save`, `checkpoint-load` | `name`; full BizHawk states under `checkpoints/`; restore verifies ROM hash, core, version and sync-settings hash |
| `tastudio` | Open the native timeline editor |
| `capture-rate` | `every: 1..60`; default 1, capturing every emulated frame |
| `raster-enable` | `enabled: true|false`; observer control for capture-on/off integrity tests |
| `state-hash` | Paused only; SHA256 of the complete restorable core state |
| `load-rom` | Switch within the same process: `source: "roms"|"diagnostic"`, `.sfc`/`.smc` filename `name` from `snes/roms` or `rea/test-output`; stop active movies first |
| `shutdown` | Close this emulator through its native API; used for test cleanup |

Example for an AI experiment:

```powershell
$reaSession = Invoke-RestMethod 'http://127.0.0.1:8900/api/session'
$reaHeaders = @{ 'X-REA-Token' = $reaSession.token }
Invoke-RestMethod 'http://127.0.0.1:8900/api/control' -Method Post `
  -ContentType 'application/json' -Headers $reaHeaders `
  -Body '{"action":"step","frames":30,"buttons":{"P1 Right":true}}'
```

Fetch the returned snapshot ID explicitly for subsequent memory/pixel queries. A control timeout means the result is uncertain; inspect state before retrying. During read-only movie playback, omit `buttons` from `step`.

## Build and test

The local tool builds against the pinned release using installed .NET SDK Roslyn and .NET Framework 4.8 reference assemblies:

```powershell
./snes/rea/Build.ps1
./snes/rea/Start-REA.ps1 -Diagnostic -Mute -Wait
# In another terminal, using the same running instance:
node ./snes/rea/verify_live.mjs
node ./snes/rea/verify_raster.mjs
node ./snes/rea/verify_contra.mjs
node ./snes/rea/verify_pool.mjs
node ./snes/rea/verify_movie_notes.mjs
node --test ./snes/rea/test/*.test.mjs
node ./snes/rea/measure_live.mjs http://127.0.0.1:8900 180 performance-report.json --assert-full-speed
```

Close the emulator before rebuilding its tool DLL or replacing its native core. See [native build and interface documentation](native/README.md). Node has no external npm dependencies; Python scripts use the standard library and the verified interpreter above.

Validation performed on this workstation:

- Eight live checks: native graphics/RAM, AI inputs, all 110 movie input rows, two BK2 replays matching framebuffer and 128 KiB WRAM hashes at four milestones, checkpoint restore/invalidation, state-movie replay and interruptible stepping.
- Eight PPU checks: raster palette/brightness/color math, HDMA scrolling/windows, sprite limits, Mode 7, hires, interlace, full state/output identity with capture on/off, and the user's Contra ROM. The raster diagnostic deliberately leaves a different end-of-frame palette, so a memory reconstruction cannot pass its color checks.
- A 600-frame power-on movie of the user's Contra ROM replayed with identical framebuffer and full WRAM hashes at three checkpoints.
- Nine protocol/API regression tests: real native packet framing, bounds, PNG byte order, WebSocket length handling, raster sample/channel decoding, retained evidence/diffs, HTTP control checks, compact stream evidence preservation and lossless run encoding (including malformed runs), and decoder buffer ownership/reuse.
- Browser checks: native six-view Contra atlas, pixel evidence and frozen inspection. Earlier movie controls were also checked for recording/saving and input-log inspection.
- Movie/comment checks: play/pause/restart and real quarter-speed playback; frame numbers for power-on and state-anchored movies; durable render/memory/BK2 copies; Markdown/JSON/Mermaid updates; restart-safe saved evidence and revision conflicts. The page was also checked for all three previews, mixed Markdown blocks, saving/reopening a Contra note and inspecting its saved memory while the live emulator remained at a later frame. See `test-output/movie-notes-report.json` and `movie-comments-dashboard.png`. Two annotation tests extend the nine transport/API regressions.
- Before optimization, a 10-second Contra measurement averaged 50.0 game FPS and 23.9 inspector captures/sec at half-rate capture. The core was actually running at full PAL speed; the earlier inference that 50 FPS proved emulation slowdown was incorrect. Full-rate capture delivered about 28 updates/sec with many raw-stream drops. See `test-output/baseline-scenarios.json`.
- After optimization and the user's NTSC override, a 30-second run averaged **60.13 game FPS, 60.13 streamed captures/sec and 59.98 browser presentations/sec**, with 0.44 ms p95 emulation-thread copy preparation. No missing/invalid native captures or server drops occurred. The browser's 60 Hz presentation clock caused one bounded queue drop. See `test-output/optimized-buffered-browser.json`; sustained results are recorded in `test-output/performance-report.json`.

The final build's **180-second NTSC Contra run** averaged **60.06 game FPS, 60.06 streamed captures/sec and 59.92 browser presentations/sec** (99.94% of nominal game speed). All 10,811 measured captures were native and consecutive: zero missing source frames, invalid native frames, invalid packets or server drops. Copy preparation was 0.47 ms p95; worker image preparation was 1.60 ms p95. Browser traffic averaged 27.2 MB/sec versus 282.9 MB/sec of full native TCP evidence. The pinned-evidence test passed after 180 frames recycled the host buffers. The duplicate-launch guard was also exercised and left the same sole emulator PID running.

This achieves full speed on average on this workstation, with brief timing dips. The worst sampled five-second delivery window was 57.6 captures/sec and the worst browser window was 59.29 presentations/sec. The optional stricter acceptance flag therefore remains **false** in `performance-report.json`; uninterrupted smoothness is not claimed. Its raw samples and the earlier run are retained for inspection. A 60 Hz viewer also occasionally drops queued captures because the NTSC source is slightly faster than 60 Hz. Background throttling, other workloads, different displays and other ROMs can change these results.

Reports/evidence: `test-output/integration-report.json`, `raster-report.json`, `contra-movie-report.json`, `performance-report.json`, `diagnostic-capture.bin` and `raster-*-atlas.bin/png`. `contra-native-atlas` is a local capture of the user's ROM, which was not downloaded or modified. Test recordings remain in `movies/`.

After the November 5 interface migration, all **17 regression tests**, fresh native movie/raster/pool/comment checks and the browser acceptance journeys passed. A new 30-second NTSC six-view run measured **60.11 game FPS and 59.95 viewer FPS**, zero source gaps, invalid captures or server drops, and passed the sustained five-second criterion for that run. Real WebGL context loss fell back to **29.99 viewer FPS** while emulation remained **60.18 FPS**, matching its explicit 30 FPS cap. This newer run does not remove the workload-dependent limits observed in the earlier 180-second test. See [interface acceptance](test-output/interface-review-report.md) and the linked measurements for exact scope, responsive/zoom validation limits and the separate native trace/watch/collision work.

## Upstream and licenses

Official release/source: <https://github.com/TASEmulators/BizHawk/releases/tag/2.11.1>. The matching source is retained in `../upstream/BizHawk-2.11.1`; upstream licenses are intact, with its top-level notice copied to `../LICENSE.BizHawk`. The added REA tool, server, UI and diagnostic source are MIT licensed in `LICENSE`.

Downloaded archive SHA256 values:

```text
Windows: DD7CBD5E205B09C5BCE6AFABC4F8AA525ACC0BBEB9753B198A8DB3FE6A5E5717
Source:  61A6DAD84C64913E06CC9423920030E55547DA7ED7695B4185FD8C59C5A93E76
```

