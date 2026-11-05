# Unified REA interface

Design proposal, 4 November 2026. This specifies the intended product; it is not a claim that these features already exist. See the [layout preview](unified-preview.html).

## Visual direction

A compact dark inspection workbench. Keep the game, evidence and selected byte visually dominant. Replace the NES hero introduction with ROM/session identity. Use the same REA wordmark and console/core subtitle everywhere; preserve upstream credits in About and packaging. Existing release names can remain aliases during migration.

| Token | Proposed value/use |
| --- | --- |
| Page | #10151B |
| Panel / raised control | #171E27 / #202A36 |
| Border | #344251 |
| Main / secondary text | #E7EDF2 / #A7B7C8 |
| Accent | #92D6B2; primary action, active tab, captured evidence |
| Warning / error | #E4BE7C / #FFAAA0; always accompanied by words/icons |
| Font | Segoe UI/system-ui; 14 px body, 12 px minimum secondary labels |
| Numeric font | Consolas/ui-monospace; 12–13 px, tabular frame/address values |
| Spacing | 4/8/12/16/24 px; 16 px panel padding |
| Controls | Minimum 36 px height; 44 px touch targets on narrow screens |
| Shape | 4 px radius, 1 px borders; no decorative gradients |

Use text badges **Captured output**, **Captured input**, **Memory diagnostic**, **Unavailable**, and **Saved evidence**. A transparent/inactive layer is valid and differs from unavailable data. Checkerboards mean transparency, not a connection failure. Avoid green highlighting of a control just because it is the first button.

## Layout

```text
REA  [NES / FCEUX]  ROM name                       Machine: Paused | Bridge: Ready
Play | Pause | Step frame | Speed | Freeze inspection | Comment displayed | Export
Live machine frame 450       Evidence: FROZEN · frame 120 · capture <id>
┌───────────────────────────────────┬─────────────────────────────────────┐
│ Graphics  [All views / Focus]      │ Selection | Memory | Registers      │
│ Composite | console-specific view │ View, x/y, RGB, sample, evidence ID  │
│ Other captured views              │ Domain, relative offset, bus base   │
│ Memory diagnostics (expandable)   │ Compare baseline, changed bytes     │
└───────────────────────────────────┴─────────────────────────────────────┘
Movies | Comments | Checkpoints | Execution | Performance
[Selected drawer; full comment editor or movie library when requested]
```

At desktop widths use a fluid left workspace and 360 px inspector. At medium widths reduce to 300 px, with two graphic columns. Below 900 px stack graphics and inspector; below 600 px show focused Composite with an explicit view selector and full-width lower drawer. Keep controls reachable without scrolling to the page bottom. Use sticky toolbar/evidence strip with a bounded height; allow wrapping and horizontal scrolling inside hex tables only. Preserve source pixel aspect and nearest-neighbor scaling; offer Fit, 1×, 2× and Focus. Fit should not imply integer pixel scaling.

One-atlas implementations may keep one texture and one upload. The shell's visible panels can be implemented as atlas regions or viewport crops; six DOM cards must not require six emulator executions, six encoded image requests or six GPU uploads per frame.

## Common actions and states

| Action | Contract |
| --- | --- |
| Play / Pause / Step frame | Controls the live emulator, including during a movie; recorded input remains authoritative in read-only playback |
| Speed | Shows supported values from capabilities; shared options 0.25×/0.5×/1×/2×, additional supported values retained |
| Freeze inspection | Pins the displayed evidence without pausing emulation |
| Resume inspection | Leaves a frozen live capture and displays live evidence |
| Inspect saved frame / Return to live | Enters/leaves an archived evidence context without restoring the machine |
| Comment displayed | Saves the exact displayed capture; never silently substitutes newer memory |
| Pause & capture current frame | Separate explicit action that pauses, obtains a valid completed capture, then opens its comment |
| Save checkpoint / Restore checkpoint | Restorable machine state, distinguished from an inspection snapshot; disabled with a reason when incompatible |
| Export evidence | General capture export; menu offers current evidence, note bundle or movie investigation bundle where supported |

Keep two independent state axes: `machine` (disconnected/paused/running/command pending/unknown) and `evidence` (none/live/frozen/saved/invalid). Also track the viewer-server connection, native producer connection, movie mode, and capture validity. An open WebSocket proves only the viewer-server link. Display last capture age and mark stale evidence on producer loss. An empty pre-first-capture screen names the missing step; never show a bare black atlas as the complete empty state.

On pixel selection, pin one evidence context before requesting details. Bind coordinates, memory reads, overlays and comments to that ID; discard late responses for a superseded selection. Show live machine frame separately while reviewing a saved capture. Failed pinning must remain visible; local pixels alone do not guarantee the server still retains their memory.

Mutating commands have an in-flight indication and completion/error outcome. Do not automatically retry a timed-out control. Requery state and show that the result is unknown until resolved. Keep Pause available to interrupt a bounded step where the bridge supports it. Show why recording/read-only playback/unsupported capture disables actions.

## Drawer contents

- **Movies:** library, import where supported, record start policy, save/stop/restart, frame and input-row relationship, native TAS tool shortcut, input rows and replay/desync status. Progress is informational until reliable seeking exists; never disguise a progress bar as a working scrubber.
- **Comments:** ROM/movie filters, list with frame and title, evidence thumbnail, source/preview, observation/hypothesis classification, dirty/recovered/saved/conflict status. Preserve immutable evidence and movie version references. Add Discard draft and explicit conflict resolution.
- **Checkpoints:** named/slot list, compatibility metadata, persistence/lifetime, save/restore and result. Genesis remains unavailable until a general bridge command exists; movie checkpoints are labeled separately.
- **Execution:** bounded experiment frames/input, trace/watch controls only when supported, limits and stop granularity. Unsupported features carry a reason and native-tool guidance.
- **Performance:** machine FPS, captured frames/s, displayed unique frames/s, source region/cadence, queue/drop/latency metrics. Separate these numbers; a 50 Hz PAL machine is not automatically slow.

## Console-specific descriptors

| Console | Captured graphics | Memory diagnostics / native tools |
| --- | --- | --- |
| NES | Composite, Background, Sprites; renderer support-dependent | Nametables, CHR, palettes, OAM; TAS Editor / debugger |
| Genesis | Composite, Sprites, Plane A, Plane B, Window, Source/priority | VRAM tiles, SAT bounds; native CPU/VDP debug tools |
| SNES | Composite, OBJ, BG1–4; main/sub sample detail | OBJ tiles, OAM; TAStudio / core-supported native debug tools |

Normalize descriptors and actions, not hardware meanings. Do not label SAT/OAM rectangles as game hitboxes. Do not claim tile-fetch addresses or software collision knowledge from captured color alone.

## Implementation boundary

Define a small shared shell API: session/capabilities, subscribeCapture, pinCapture, readMemory, diffMemory, inspectPixel, control, movie library/transport, comment revisions, saved evidence and export. Implement one adapter per current server. Keep existing HTTP routes stable initially: NES uses `op`, SNES uses `action`, Genesis movie actions use a separate endpoint. Button masks, frame/input-row conventions and byte order stay adapter-owned.

Proposed capability descriptors should include supported/unsupported/temporarily unavailable, reason, allowed values, bounds, stop granularity and checkpoint persistence. Report support before a first capture where possible, plus per-capture availability. Never infer implementation from a console's name.

Share source through a package/build boundary with explicit licenses; do not copy GPL implementation code into the MIT SNES extension without an appropriate licensing decision. UI adapters and backend bridges should retain their existing notices.

## Acceptance before adoption

Run common browser journeys at desktop, tablet and narrow widths and 200% zoom. Verify keyboard-only coordinate selection, labeled canvases, focus visibility, note recovery/conflicts, disconnected/reconnecting state, unsupported layers, stale history, saved review, and return to live. Use captured-image/native regression checks for each console after migrating. Preserve bounded buffers and measure the effect of the shared shell on native game speed and unique viewer presentation separately. This review does not establish accessibility conformance; contrast and assistive-technology checks remain implementation acceptance work.
