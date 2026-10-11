# Kreskit

Kreskit is a desktop app for annotating screenshots: paste an image, mark it up with shapes, text and CAD-style dimensions, then copy or export it. The name comes from Polish "kreska" (a stroke, a line). It was called "Shotmark" while it was being built; that name is taken, so do not bring it back.

The owner is Szymon (GitHub `Szymon423`). He develops this on more than one machine, so everything needed to continue lives in this directory and is committed to git.

## Read these first

- @docs/product.md — what the app is for, the wanted end result, and the design decisions already made.
- @docs/roadmap.md — what is built, what is open, known gaps. Keep it current.
- `docs/setup.md` — setting up a new machine (read it when a build or launch fails).
- `docs/history.md` — how the project got here and why things are the way they are.

## Stack

- **Shell**: Tauri 2 (Rust), single instance. Code in `src-tauri/`.
- **UI**: vanilla TypeScript + Vite. No UI framework. Konva renders the canvas.
- **Export**: Konva for PNG/JPG and clipboard, a hand-written SVG serializer, PDF generated from that SVG with `jsPDF` + `svg2pdf.js`.

## Commands

```sh
npm install            # once per machine
npm run tauri dev      # run the desktop app with hot reload
npm run build          # tsc type-check + production frontend build
npm run tauri build    # installers, into src-tauri/target/release/bundle/
(cd src-tauri && cargo check)   # check the Rust shell
npm run dev            # frontend only, in a browser at http://localhost:1420
```

There are no automated tests and no linter. `npm run build` and `cargo check` are the only automatic checks, so run both after a change.

## Layout

```
index.html        Toolbar markup and app shell
src/main.ts       Wires UI, shortcuts and file actions together
src/editor.ts     Konva rendering, tools, selection, snapping, pointer/key input
src/model.ts      Document and object types (the scene model)
src/store.ts      Document state with undo/redo
src/nodes.ts      Scene object -> Konva node
src/dimension.ts  Dimension geometry (linear, radius, diameter)
src/export.ts     PNG, JPG, SVG and PDF output
src/files.ts      Save/open dialogs, clipboard, .shot project files
src/input.ts      Paste, drop and file-picker entry points
src/viewport.ts   Zoom and pan
src/stylebar.ts   Context bar for the selected object's style
src/styles.ts     Per-tool remembered styles
src/textedit.ts   In-place text editing
src/dialog.ts     In-app question dialog
src-tauri/        Rust shell: window, plugins, capabilities, bundling
public/fonts/     DejaVu Sans, embedded into PDF exports
```

## Architecture rules

- **The scene model is the source of truth.** A plain document (`Doc` in `src/model.ts`) holds the base image and a list of typed objects with their style. Konva only renders it; never keep state in Konva nodes that is not in the model.
- **Every change goes through the store** (`src/store.ts`), which is what gives undo/redo. One user gesture should be one undo step.
- **Three exporters read the same model.** A new object type, or a change to how one looks, must be made in the Konva renderer (`src/nodes.ts`, `src/dimension.ts`) and in the SVG serializer in `src/export.ts`. PDF follows from SVG. If you change one and not the other, the export stops matching the canvas.
- **Project files (`.shot`) must stay readable.** They are JSON with `app`, `version`, the base image and the objects. Files written with `app: "shotmark"` are still accepted. If the format has to change, bump `version` and keep loading the old one.
- **A dimension is one composite object** with its own handles (two measured points, an offset handle), not a group of lines and text.
- **Linux/NVIDIA workaround**: `src-tauri/src/main.rs` disables WebKitGTK's DMABUF renderer when the proprietary NVIDIA driver is present. Without it the app dies at startup on Wayland with "Error 71 (Protocol error)". Do not remove it.

## Code style

Match the surrounding code: no semicolons, single quotes, 2-space indent, small modules with named exports. Comments explain why something is the way it is, not what the line does. UI text and code are in English.

## Boundaries

- **Say what was actually checked.** You can type-check, build and run `cargo check`. You cannot click in the app window. When a change affects interaction, say plainly that it is untested in the window and list what Szymon should try. Never report a UI behaviour as working because the build passed.
- **Do not start long-running GUI processes** (`npm run tauri dev`) expecting to interact with them. Szymon runs the app and reports back. A headless browser against `npm run dev` is fine for checking rendering and export output.
- **Ask before adding a dependency**, npm or cargo. The app is meant to stay small and start fast.
- **Do not introduce a UI framework** (React, Vue, Svelte, ...) or a second canvas library.
- **Ask before widening Tauri permissions** in `src-tauri/capabilities/default.json` or changing the app identifier (`dev.kreskit.app`), since both affect what the app can touch on the user's machine.
- **Commit and push only when asked.** The remote is public-facing; never force-push, and never rewrite history that is already pushed.
- **Do not rename or move the project folder** from inside a session. It breaks the running dev server, the editor workspace and the Claude Code session history, which is keyed to the folder path.
- **Keep scope tight.** Do the thing asked; mention related problems you notice instead of fixing them unasked.
- **Keep the docs in step.** When a feature lands or a gap is found, update `docs/roadmap.md`. When a shortcut or feature changes, update the tables in `README.md`.
- **No secrets, signing keys or machine-specific paths** in the repository. Machine-local Claude settings go in `.claude/settings.local.json`, which is git-ignored.

## Working with Szymon

- He often dictates by voice, in English or Polish, so messages can contain transcription errors ("dotclot" meant `.claude`, "CressKit" meant Kreskit). Read for intent, and ask when a garbled word changes what should be done.
- Reply in the language he wrote in.
- He tests in the real app and gives feedback in short rounds. Work in small stages he can try, and end each one with what to check.
