# SNES interface acceptance — 5 November 2026

Implemented review: [SNES-BIZHAWK.md](../interface-review/SNES-BIZHAWK.md).

User render screenshots, original investigation ZIPs and machine process details are intentionally excluded from the repository.

## Automated and native evidence

- node --test snes/rea/test/*.test.mjs: 17/17 pass, including delayed lookup generations, held captures beyond history eviction, stale pin rejection, producer loss, saved comparison after restart, independently verified ZIP hashes, lifecycle gating, and current checkpoint identity.
- [integration-report.json](integration-report.json): 8 live checks; exact 110 input rows, two matching BK2 replays, checkpoint restore/invalidation, state movie, Pause interruption.
- [raster-report.json](raster-report.json): 8 native PPU checks, including Contra; observer-on/off state and output hashes match.
- [pool-report.json](pool-report.json): published native packet unchanged after 180 frames recycled capture buffers.
- [movie-notes-report.json](movie-notes-report.json): archived BK2/evidence, Markdown/JSON/Mermaid, real quarter speed and state-relative frame numbering.
- Local investigation exports passed independent Python hash verification; user exports are not redistributed.
- Local investigation exports passed independent Python hash verification; user exports are not redistributed.

## Manual browser acceptance

- Server-only: Waiting for emulator, no live movie, execution disabled; saved note render, memory and Markdown/JSON/Mermaid available.
- Saved pair: diagnostic frame 5 capture 13da4c63233544af915755fb1756996e-328 to frame 60 capture 13da4c63233544af915755fb1756996e-140, WRAM 0x10/128 bytes: 3 highlighted changes, 125 unchanged. Contra baseline rejected as different ROM.
- Boundary reads: OAM 0x21f, CGRAM 0x1ff, WRAM 0x1ffff each returned the final one byte without error.
- Discard/recover/save and two-tab conflict tested on new test note 200cfe48-f721-4df6-aa8b-bfdf440753bd. Mine survived server conflict; explicit rebase/save produced revision 4.
- Pinned running-frame note b5bb7083-b273-4349-b5ed-746f923b5de3 retained capture c3de125936534f09bf03e6412fd22f3b-3664, frame 1561, for graphics and memory, while machine reached 2214; paused afterward.
- Checkpoint browser rejected different-ROM entries before restore; interface-review-20261105 (PAL diagnostic configuration) saved/restored with matching native hash. Restore correctly invalidated capture until a rendered step. Gameplay configuration retained the user's NTSC override.
- Native form reported BsnesCore, connected producer, native/valid capture and localhost URL. Browser controller input was not added.
- Named Right input: 4/4 completed; Pause interrupted 3600-frame run after 13 completed frames. Read-only movie forced movie inputs and disabled overrides.
- Simulated browser network failure blocked commands as Unknown outcome; explicit Requery restored Paused, without retry. Network emulation restored.
- All six focus views returned the same held ID; Composite was captured-output, OBJ/BG1–4 ppu-render-samples. Keyboard arrows/Enter and 2× view selection worked.
- Real WebGL context loss produced a working Canvas 2D renderer and exact diagnostic RGBA [255,0,0,255]. Reload restored normal WebGL. Forced startup injection was unsupported by the in-app browser.
- Layout widths 1440/768/390 CSS pixels matched page scroll width; mobile toolbar controls were 44px high. 200% visual zoom worked; browser-chrome zoom/assistive technology certification remains outside this validation. All temporary viewport overrides cleared.

## Measurements

- [WebGL, 30 seconds](interface-review-webgl-performance.json): 60.111 source FPS, 59.950 viewer FPS, 0 source gaps/invalid captures/server drops; minimum five-second viewer rate 59.836; full_speed_pass true.
- [Canvas 2D, 10 seconds](interface-review-canvas-performance.json): 60.179 source FPS, 29.994 viewer FPS with its explicit 30 FPS presentation cap, 0 source gaps/invalid captures/server drops. full_speed_pass false is expected for this capped fallback.

S-14 remains explicitly unsupported: bounded native trace/watch and verified ROM-specific collision adapters. Existing native main/sub sample semantics, render restrictions, BK2 compatibility and post-restore invalidation are preserved.
