# SNES / BizHawk review and todo

Reviewed 4 November 2026. [Parity matrix](README.md) · [Common design](UNIFIED-INTERFACE.md)

## Original REA dashboard review

The strongest durable frame-comment workflow. Comments preserve six graphics views, native capture, copied memory and an archived local BK2 version. The UI can inspect those files after restart, and implements browser draft recovery and server revision conflicts. Named disk checkpoints verify ROM/core/version/sync metadata. Native TAStudio remains directly accessible. The compact header is a better workbench starting point than a large introduction.

The atlas dominates the page, with Comments inserted before the movie, memory and pixel tools. This places routine inspection details far below the clicked image. The three-column workbench mixes movie recording, checkpoints and pixel evidence without a consistent hierarchy. A live memory API is available but there is no UI comparison, and general snapshot/export actions are absent from the toolbar.

### Findings

| ID / priority | Finding and evidence | Recommended result |
| --- | --- | --- |
| S-01 / P1 | `connect()` sets CONNECTED on WebSocket open, even without a native producer. Reproduced: header CONNECTED while viewport says the bridge is waiting for a game. | Separate viewer-server, producer, and valid-capture state; display last capture age. |
| S-02 / P1 | Pixel click does not pin/freeze; asynchronous response writes directly into `pixel`. A running atlas can advance before details arrive, and late responses lack a selection-generation guard. | Pin first, bind result to capture/view/coordinates, and discard superseded responses. |
| S-03 / P2 | `/api/diff` exists; memory UI only prints a range. `previousMemory` is assigned but does not implement displayed byte comparison. | Add explicit baseline/current comparison and highlighted changed bytes. |
| S-04 / P2 | `draw()` updates movie status from the displayed capture, including an archived annotation. A saved recording can show RECORD with no live emulator connected. `saved evidence` text helps, but the control state and historical state still share one area. | Keep archived movie context in evidence details and live machine/movie status beside execution controls. |
| S-05 / P2 | Freeze button uses Live inspection after freezing, versus Resume inspection elsewhere; saved review correctly uses Return to live. | Use the shared state/action vocabulary consistently. |
| S-06 / P2 | A missing WebGL context throws before initialization, with no user-facing recovery path. Genesis has a Canvas 2D fallback. | Explain unavailability in-page or implement a measured fallback; comments/saved downloads should remain usable. |
| S-07 / P2 | Capturing another comment and switching notes are blocked while dirty, but there is no explicit Discard draft action. | Keep protection and add a recoverable exit/cancel flow and clear conflict resolution. |
| S-08 / P2 | Read length is fixed at 128 bytes. A valid offset near a domain's end can produce a range error instead of showing remaining bytes. | Bound read length to the domain and let the user navigate the final range. |
| S-09 / P2 | Buttons remain broadly actionable before connection and during conflicting movie modes; errors often appear only in the bottom message. | Gate with specific reasons and show nearby command progress/outcome. |

Principal sources: [app.mjs](../../snes/rea/public/app.mjs) lines 17–31, 45–67; [notes.mjs](../../snes/rea/public/notes.mjs) lines 4–49; [HTML](../../snes/rea/public/index.html); [server](../../snes/rea/server.mjs), especially session and diff routes; [native bridge](../../snes/rea/REASnes.cs); [annotations](../../snes/rea/annotations.mjs).

Fresh browser validation reopened an existing mixed-format note, rendered Markdown/JSON/Mermaid, and used Inspect saved frame to load its original six-view atlas and WRAM. This verified review without a live producer and also exposed the misleading connection and archived-recording status described above. No note was saved or edited.

## Native emulator and bridge interface review

The standard EmuHawk UI retains movie controls, TAStudio, Hex Editor and debugger/graphics-tool entry points. Tool availability depends on the selected core; a menu declaration is not proof of the BSNESv115+ core implementing every debugger service. Source: [MainForm.Designer.cs](../../snes/upstream/BizHawk-2.11.1/src/BizHawk.Client.EmuHawk/MainForm.Designer.cs), around lines 1355–1412 and 1683–1696.

At the original review, the added native REA bridge was a 480×120 status form, not another graphical inspector. It hosts transport/capture alongside the normal native window. This is a sensible separation, but users need one place to understand the bridge, viewer and native machine connections. The launcher pins the core, refuses a second EmuHawk instance and starts the tool automatically. Preserve these constraints and make their reasons visible in session details.

Use EmuHawk/TAStudio for controller play, input editing and branches. A consistent REA shell should give a direct Open TAStudio action and display movie mode without pretending that browser saved-frame review rewinds the machine. The native OAM/graphics tools are diagnostics; the browser's six raster captures retain distinct evidence semantics.

## Prioritized todo

- [x] **S-01 / P1:** Fix connection/producer/capture state. Acceptance: server alone says Waiting for emulator; producer loss shows stale last capture and disabled execution; reconnect restores valid state only after appropriate evidence arrives.
- [x] **S-02 / P1:** Pin pixel selection with race-safe lookup. Acceptance: deliberately delay two pixel responses and verify only the newest selection is shown; graphics, memory and comment evidence use its pinned ID while the machine continues.
- [x] **S-09 / P1:** Apply common control lifecycle and capability gating. Acceptance: disconnected, recording, read-only playback, pending step and uncertain timeout states each have explicit reasons; Pause can interrupt a supported bounded step.
- [x] **S-04 / P2:** Separate historical movie metadata from live transport state. Acceptance: opening a saved recording does not label the live machine Recording; live controls show the actual backend state.
- [x] **S-03 / P2:** Add memory diff/baseline UI and saved-to-saved comparison where supported. Acceptance: display both capture IDs and known changed/unchanged bytes; no mixed-domain or incompatible-ROM comparison.
- [x] **S-05 / P2:** Migrate to shared toolbar/evidence strip, graphics with adjacent inspector, and tabbed lower drawer. Acceptance: comment panel no longer separates selected pixel from its evidence tools; preserve smooth bounded atlas presentation.
- [x] **S-06 / P2:** Handle absent/lost WebGL context gracefully. Acceptance: readable in-page explanation, working note library/downloads, and explicit renderer capability; a fallback must preserve pixel/evidence correspondence.
- [x] **S-07 / P2:** Add Discard draft/recovery controls and a conflict resolution UI around existing server revisions. Acceptance: recovered draft can be saved, exported or intentionally discarded without trapping navigation.
- [x] **S-08 / P2:** Clip memory reads at the domain boundary and expose range length/navigation. Acceptance: the final valid byte in OAM/CGRAM/WRAM is inspectable without a range error.
- [x] **S-10 / P2:** Add general Export evidence and an investigation ZIP with manifest, note, atlas/native/memory files and archived BK2. Acceptance: verify hashes offline after restart; snapshot files remain distinguished from restorable checkpoints.
- [x] **S-11 / P2:** Add checkpoint browser/list/compatibility/lifetime display and bounded experiment form over existing API. Acceptance: select existing checkpoint, understand incompatibility before restore, and run an input step with actual completed frame count shown.
- [x] **S-12 / P2:** Add focused graphics views, labeled canvas/keyboard coordinate inspection and narrow-screen layout. Acceptance: shared keyboard/zoom/responsive journeys pass with every layer's evidence type retained.
- [x] **S-13 / P3:** Extend bridge status with producer/capture validity, core identity and inspector URL; add browser input only if it has a clear recording/focus policy. Acceptance: native and browser input sources cannot silently compete during replay.
- [ ] **S-14 / P3:** Add bounded trace/watch and ROM-specific collision adapters as native/core capability projects. Acceptance: unsupported core services are explicit; never reconstruct missing raster samples from end-of-frame memory.

Preserve native main/sub samples, renderer restrictions, capture invalidation after state restore and BK2 compatibility checks. They are correctness properties, not visual details.

## Implemented 5 November 2026

S-01 through S-13 are implemented. The findings above describe the pre-change interface. The page now has live controls, a separate evidence strip, adjacent Selection/Memory/Registers tools, and Movies/Comments/Checkpoints/Execution/Performance drawers. The native bridge is now 580×160 and exposes core, producer, capture validity and inspector URL. Controller input stays in BizHawk; read-only replay owns inputs.

- Connection state separates server, producer and fresh capture, including producer epochs and stale last evidence. Execution never uses archived movie state. Unknown outcomes require an explicit requery without retry. Pause remains available during bounded steps.
- Pixel selection leases its exact capture before lookup. Generations discard delayed lookups and obsolete pin completions. Displayed-frame comments keep that ID while the machine runs; pausing/capturing current machine state is a separate action.
- Memory has explicit live or disk baselines, compatible saved-to-saved comparisons, highlighted before/after bytes, both capture IDs, configurable length and boundary-clipped navigation.
- Drafts have recoverable discard, export and explicit conflict choices. Observation/Hypothesis/Question categories and mixed Markdown/JSON/Mermaid remain supported. New comments appear in the saved baseline picker.
- Investigation ZIPs contain a SHA256/length manifest and offline verification instructions. Saved-note bundles include the comment revision and archived BK2 when available. Unannotated exports state that a frame comment is needed to attach an archived movie. Inspection snapshots remain distinct from restorable checkpoints.
- Checkpoint compatibility is evaluated against the current ROM/core/version/sync/native binary, with warnings for legacy identity omissions. Bounded experiments show actual completed counts and support interruption.
- Focused views, Fit/1×/2×, labeled canvas, keyboard coordinates, tab-key navigation and narrow layouts preserve capture classification. Lost/unavailable WebGL initializes a Canvas 2D fallback capped at 30 displayed updates/sec, leaving the library and downloads usable.

### Validation and limits

[Detailed acceptance record](../validation/interface-review-report.md). All 17 Node regression tests pass. Fresh native integration, deterministic movie replay, eight PPU checks, detached-buffer recycling and movie-comment tests pass; only one EmuHawk process was used at a time.

Browser checks verified server-only waiting, archived recording vs live state, disk memory after restart, a three-byte saved comparison with 125 unchanged bytes, incompatible-ROM rejection, final OAM/CGRAM/WRAM bytes, discard/recover/save, a two-tab revision conflict, every focused layer's evidence classification, a 4/4 frame experiment, a 13/3600 interrupted run, checkpoint compatibility/restoration, and coherent graphics/memory/comment IDs while the live machine advanced. A simulated network failure produced Unknown outcome, then recovered through Requery without execution.

Native NTSC performance over 30 seconds: **60.11 emulated FPS, 59.95 unique displayed FPS**, no invalid packets/native frames, source gaps or server drops. The sustained five-second acceptance check passed. [WebGL measurement](../validation/interface-review-webgl-performance.json). Real WebGL context loss switched to Canvas 2D and preserved a known exact RGBA sample; its measured presentation was **29.99 FPS** while native emulation remained **60.18 FPS**. [Fallback measurement](../validation/interface-review-canvas-performance.json). The fallback intentionally does not meet the 60-FPS viewer criterion. These measurements describe this workstation/run, not an uninterrupted-speed guarantee for every workload.

Responsive checks reached actual 1440, 768 and 390 CSS-pixel layouts through developer device emulation, with no horizontal page overflow and 44px mobile controls. The normal viewport override clamps at 520px; device emulation was needed for 390px. A 200% visual-viewport zoom was verified; browser-chrome page zoom and assistive-technology conformance were not certified. Startup without WebGL follows the same fallback implementation, but injection of a forced startup failure was unavailable in this browser; real context loss was tested. Temporary network/device/zoom overrides were removed.

S-14 remains a separate native/core implementation project. Trace and CPU watch services are explicitly unsupported with reasons, and no verified commercial-ROM collision adapter is installed. OAM bounds remain diagnostics. Exact raster fetch/CPU/DMA provenance is never synthesized from end-of-frame memory.
