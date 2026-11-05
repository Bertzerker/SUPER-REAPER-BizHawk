# REA SNES implementation and next stages

## Delivered

Use one BizHawk machine with a BSNESv115+ native observer extension as both a human movie recorder and an AI inspection/control target. Movie/TAStudio behavior and managed emulator assemblies remain upstream. The external tool and native overlay are pinned to BizHawk 2.11.1.

The native observer captures admitted BG/OBJ main/sub samples during actual rendering, then publishes them with the final PPU framebuffer at the video callback. At PostFrame, copy this raster evidence and direct memory domains into one of six reusable host buffers. A worker builds the atlas and serializes detached evidence through a bounded pending queue over persistent TCP. The server retains raw evidence and streams a lossless word-run encoded atlas/memory packet, omitting duplicate sample planes. The browser reuses one texture and a bounded six-to-ten-capture presentation queue, and can freeze evidence independently of emulation. Tile/OAM memory diagnostics stay separate from captured layer samples.

Human demonstrations are BK2 input movies starting from power-on or an embedded complete state. AI clients can inspect the recorded log, replay without input overrides, or use bounded input steps and native checkpoints for experiments. Checkpoint sidecars bind restores to ROM/core/version/sync settings. Session/sequence identifiers remain unique after resets and state loads. Pause interrupts long input steps. The launcher refuses a duplicate BizHawk process.

The REA page includes movie selection, play/pause/restart, frame stepping and requested playback rates from 0.1× through 4×. Frame comments persist the exact six-view render, memory domains, raw native evidence and movie/frame reference. Local BK2 versions are archived with hashes. Markdown with JSON/Mermaid fences and standalone JSON/Mermaid notes have offline previews. Saved-evidence inspection survives live-history eviction and server restart without rewinding the machine. Comment revisions prevent silent concurrent overwrites; browser drafts support recovery. Notes remain sidecars rather than input-log edits.

The workbench separates live machine controls from LIVE/FROZEN/SAVED evidence. Selection acquires a bounded capture lease before pixel lookup; monotonic request generations reject obsolete responses and pin operations. The adjacent inspector supports compatible saved/live memory pairs, explicit baselines and clipped domain ranges. Distinct actions comment the displayed evidence or pause/capture the machine's current frame. Recoverable draft discard, conflict resolution, category labels and investigation ZIPs preserve immutable evidence. Offline manifests hash the native capture, memory, images, note revision and archived BK2 where available; these exports are not machine checkpoints.

Persistent checkpoint compatibility includes the native core identity when recorded and is re-evaluated against current machine metadata. Bounded input experiments report completed frames, including interruption. The bridge status shows producer/capture/core identity and URL. Browser controller input remains absent, preventing competition with native input or read-only movie playback. Focused view crops and keyboard coordinates map to the same atlas. WebGL context loss falls back to exact Canvas 2D pixels with an explicit 30 FPS presentation cap.

Acceptance evidence: actual original diagnostic captures, exact input-log checks, two saved-movie replays matching framebuffer/WRAM hashes at four milestones, state-movie replay, checkpoint restore, interruption, browser control checks and a measured binary transport run. See README and test-output for results and scope.

## Delivered raster evidence

`plotAbove`/`plotBelow` hooks retain actual FastPPU layer inputs after renderer evaluation, layer windows and palette resolution. Per-layer panels use native raster-time brightness; final color math remains in the captured composite. Samples retain both screen channels, presence, priority and source classification. No layer toggling, game reruns or end-of-frame scene decoding is used.

- Actual sprite limits, HDMA palette/brightness/scroll/window effects, Mode 7, hires phases and interlaced output are validated with original diagnostic ROMs.
- Full raw core-state and framebuffer hashes match with capture enabled and disabled. Observer buffers use the native invisible section, and stale captures are invalidated after state loads.
- Native generations bind all six views to one callback. Unsupported cycle-PPU and enhanced HD/supersampled Mode 7 paths return explicit unavailability.
- Exact VRAM fetch-address and CPU/DMA provenance remain future work, with bounded trace storage and truncation reporting required.

`rasterLayers` and `rasterSamples` are true for valid native captures. Fetch-chain `pixelProvenance` and `gameHitboxes` remain false. Raw OAM bounds and the tile preview remain memory diagnostics.

## Game knowledge and learning extension

Attach verified game adapters to a ROM hash, providing object memory layouts, world/camera transforms, software collision shapes and triggering conditions. Store observations/hypotheses/verified claims with immutable evidence references. Use human input movies as demonstration trajectories, and fork controlled experiments from compatible checkpoints. Do not label OAM rectangles as game collision geometry.

Automatic learning or game completion is not implemented by the inspector itself. It supplies recorded inputs, state, output and experiment controls for an AI client to use.

