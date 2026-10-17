# Kreskit

Kreskit is a desktop app for annotating screenshots: paste an image, mark it up with shapes, text and CAD-style dimensions, then copy or export it. The same editor also runs in the browser, published with a landing page at https://szymon423.github.io/Kreskit/ (the app is under `app/`). The name comes from Polish "kreska" (a stroke, a line). It was called "Shotmark" while it was being built; that name is taken, so do not bring it back.

The owner is Szymon (GitHub `Szymon423`). He develops this on more than one machine, so everything needed to continue lives in this directory and is committed to git.

## Read these first

- @docs/product.md — what the app is for, the wanted end result, and the design decisions already made.
- @docs/roadmap.md — what is built, what is open, known gaps. Keep it current.
- `docs/setup.md` — setting up a new machine (read it when a build or launch fails).
- `docs/history.md` — how the project got here and why things are the way they are.

## Stack

- **Shell**: Tauri 2 (Rust), single instance. Code in `src-tauri/`.
- **UI**: vanilla TypeScript + Vite. No UI framework. Konva renders the canvas.
- **Website**: a plain-HTML landing page (`site/`) plus a browser build of the app, published by GitHub Pages from `.github/workflows/pages.yml` on every push to `main`.
- **Export**: Konva for PNG/JPG and clipboard, a hand-written SVG serializer, PDF generated from that SVG with `jsPDF` + `svg2pdf.js`.

## Commands

```sh
npm install            # once per machine
npm run tauri dev      # run the desktop app with hot reload
npm run build          # tsc type-check + production frontend build
npm run tauri build    # installers, into src-tauri/target/release/bundle/
(cd src-tauri && cargo check)   # check the Rust shell
npm run dev            # frontend only, in a browser at http://localhost:1420
npm run build:web      # website into dist-web/: landing page at the root, the app under app/
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
src/heads.ts      Line endings (triangle, pointed, tick, none) for arrows and dimensions
src/export.ts     PNG, JPG, SVG and PDF output
src/files.ts      Save/open dialogs, clipboard, .kit project files
src/input.ts      Paste, drop and file-picker entry points
src/viewport.ts   Zoom and pan
src/stylebar.ts   Context bar for the selected object's style
src/styles.ts     Per-tool remembered styles
src/textedit.ts   In-place text editing
src/dialog.ts     In-app question dialog
src/layers.ts     Layers panel: list of objects, select and drag to reorder
src-tauri/        Rust shell: window, plugins, capabilities, bundling
public/fonts/     DejaVu Sans, embedded into PDF exports
public/icon.svg   Browser-tab icon of the app
src-tauri/app-icon.svg   Icon source (see "Icon" below)
src-tauri/icons/  Generated from the icon source; do not edit by hand
site/             Landing page of the website (plain HTML, no build step)
scripts/          Build helpers; assemble-site.mjs puts the landing page around the web build
example/          Screenshots and a sample project, used by the README and the landing page
LICENSE           MIT
.github/workflows/pages.yml   Publishes dist-web/ to GitHub Pages on every push to main
.github/social-preview.svg   Source of the repository's social preview; render with `rsvg-convert .github/social-preview.svg -o .github/social-preview.png` and upload the PNG in the repository settings
```

## Architecture rules

- **The scene model is the source of truth.** A plain document (`Doc` in `src/model.ts`) holds the base image and a list of typed objects with their style. Konva only renders it; never keep state in Konva nodes that is not in the model.
- **Every change goes through the store** (`src/store.ts`), which is what gives undo/redo. One user gesture should be one undo step.
- **Three exporters read the same model.** A new object type, or a change to how one looks, must be made in the Konva renderer (`src/nodes.ts`, `src/dimension.ts`) and in the SVG serializer in `src/export.ts`. PDF follows from SVG. If you change one and not the other, the export stops matching the canvas.
- **Project files (`.kit`) must stay readable.** They were saved as `.shot` until 2026-10-11, and that extension must keep opening. They are JSON with `app`, `version`, the base image and the objects. Files written with `app: "shotmark"` are still accepted. If the format has to change, bump `version` and keep loading the old one.
- **Sizes are stored in pixels but edited in image-independent units.** Each object's `style.scale` records the factor it was created with (`sizeFactor` in `src/styles.ts`). Tool styles and everything the style bar shows or sends are relative (`toRelative`, `scaleLengths`); objects hold real pixels. Any fixed size in drawing code (a minimum arrowhead, a gap, a hit width) must be multiplied by `style.scale`, or it will look wrong on large and small images.
- **A dimension is one composite object** with its own handles (two measured points, an offset handle), not a group of lines and text.
- **Dropped files come through Tauri, not the webview.** `dragDropEnabled` is on in `tauri.conf.json`: WebKitGTK only hands the page a `file://` path for a drop from a file manager, and the page may not read it. Tauri's drop event (`src/input.ts`) gives the path, and the fs plugin allows reading exactly the dropped files. The page's own drop handler stays for the browser version and for images dragged out of web pages. On Windows this setting is known to disable HTML5 drag and drop inside the page, which the layers panel relies on; check that if Windows builds ever happen.
- **Linux/NVIDIA workaround**: `src-tauri/src/main.rs` disables WebKitGTK's DMABUF renderer when the proprietary NVIDIA driver is present. Without it the app dies at startup on Wayland with "Error 71 (Protocol error)". Do not remove it.

## Website and browser build

- **One codebase, two targets.** The browser version is the same `src/` built with `npm run build:web`. Anything desktop-only (native dialogs, native clipboard, file writes) sits behind `isTauri` in `src/files.ts` and needs a browser fallback. After a change to input, output or shortcuts, think about both targets.
- **The web build uses a relative base** (`--base=./`), so it works under `/Kreskit/app/` and would work unchanged under a custom domain. Do not introduce absolute URLs to the app's own files; use `import.meta.env.BASE_URL`.
- **The landing page is one hand-written file**, `site/index.html`, with inline CSS and no build step. Its images are copied from `example/` by `scripts/assemble-site.mjs`.
- **`example/kreskit.png` is shown in the README and on the landing page.** When the toolbar or the look of the app changes, tell Szymon it needs retaking; only he can take it.
- **Deploys happen on push to `main`.** A failed run is restarted with "Run workflow" in the Actions tab, not "Re-run jobs" (see the comment in the workflow).

## Icon

The source is `src-tauri/app-icon.svg`. After changing it:

```sh
npx tauri icon src-tauri/app-icon.svg
rm -rf src-tauri/icons/android src-tauri/icons/ios
cp src-tauri/app-icon.svg public/icon.svg
cp src-tauri/app-icon.svg site/icon.svg
```

On Linux the icon only shows for the installed app (see `docs/setup.md`), not for a binary run from the build folder.

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
- **Keep the docs in step.** When a feature lands or a gap is found, update `docs/roadmap.md`. When a shortcut or feature changes, update the tables in `README.md`, and the feature cards in `site/index.html` if they no longer describe the app.
- **No secrets, signing keys or machine-specific paths** in the repository. Machine-local Claude settings go in `.claude/settings.local.json`, which is git-ignored.

## Working with Szymon

- He often dictates by voice, in English or Polish, so messages can contain transcription errors ("dotclot" meant `.claude`, "CressKit" meant Kreskit). Read for intent, and ask when a garbled word changes what should be done.
- Reply in the language he wrote in.
- He tests in the real app and gives feedback in short rounds. Work in small stages he can try, and end each one with what to check.
