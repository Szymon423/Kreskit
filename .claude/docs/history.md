# History

A record of how the project got to its current state, for context a fresh session would otherwise lack. All of this happened on 2026-10-11, on Szymon's Fedora desktop, across three stretches of work.

## Session 1: building the app

The folder was `~/Projects/Personal/36-` and the app was called "Shotmark" as a placeholder.

1. **Brief.** Szymon described the app by voice: paste a screenshot, annotate it quickly, keep everything editable, add CAD-style dimensions, run on every desktop OS. After a round of questions the plan in `product.md` was agreed.
2. **Scaffold.** Tauri 2 + Vite + TypeScript + Konva. Rust and the WebKitGTK development packages had to be installed first (see `setup.md`).
3. **First launch crashed** with a Wayland protocol error on the NVIDIA driver; fixed with the DMABUF workaround in `src-tauri/src/main.rs`.
4. **Shapes and selection**: rectangle, ellipse, line, arrow, selection, transform handles, undo/redo.
5. **Empty-state hint would not hide**: its own `display: flex` overrode the `hidden` attribute. Fixed in `src/style.css`; the same bug affected the status message.
6. **Text, pen, highlighter and the style bar.** Pen smoothing added on request.
7. **Dimensions**: linear, radius, diameter. Then three rounds of tuning from Szymon's testing: exact arrow tips, narrower width range, arrowheads 15% bigger, text direction and placement.
8. **Snapping**, then extended to resizing, then given a toggle. Tools changed to stay active after drawing.
9. **Output**: copy, PNG/JPG/SVG/PDF export, `.shot` projects. Export was verified by running a sample document through every format in a headless browser, which caught two bugs (truncated freehand strokes in SVG/PDF, text offset in PDF).
10. **Opening `.shot` files** did not work through the webview's file picker on Linux, which filters by media type; replaced with the native dialog.
11. **Paste confirmation** and images as movable objects.
12. **Reset-view button.**

## Between sessions

Szymon renamed the folder to `36-Shotmark`. Claude Code keys session history to the folder path, so the first session's transcript had to be copied into the new path's history folder by hand.

## Session 2: naming and publishing

1. Added `README.md` and extended `.gitignore`.
2. **Name search.** "Shotmark" was taken (npm package, `.com` and `.dev` domains). About 90 candidates were checked against npm, crates.io, GitHub, AUR and domain registration. **Kreskit** was chosen: free on npm and crates.io, no GitHub repositories or account by that name, `kreskit.com` unregistered at the time, and a web search found no product using it. Trademark registries and app stores were not checked.
3. **Rename to Kreskit** across `package.json`, `Cargo.toml`, the Tauri config and identifier (`dev.kreskit.app`), the window title, the README and the project-file marker. Old `.shot` files marked `shotmark` still load. The `.shot` extension was kept.
4. This `.claude/` directory was written, the folder was renamed to `36-Kreskit`, and the project was put under git for publishing to GitHub as `Szymon423/Kreskit`.

## Session 3: polish after the first build

1. **Styling text while it is edited.** The style bar used to restyle only the next text, and touching it closed the editor. It now applies to the text or dimension value being typed.
2. **Project extension changed from `.shot` to `.kit`**, to match the app's name. `.shot` files still open; new saves get `.kit`.
3. **`example/`** added with a plain screenshot, its annotated export and the editable project, and shown at the top of the README. An app screenshot (`kreskit.png`) followed.
4. **README made open about its origin**: badges and a "How this was made" section saying the code was written by an AI assistant under human direction.
5. **Website.** GitHub Pages was chosen because the app is static files. First a placeholder landing page and the deploy workflow, then a full landing page with a light/dark toggle. Two deploy failures on the way, both about GitHub and not the code: Pages was not yet set to "GitHub Actions" as its source (404 on deploy), and then "Re-run jobs" produced two artifacts with the same name. A fresh "Run workflow" fixed it.
6. **Output menu and clear button.** The three copy/export/save buttons became one hover menu listing each export format, which also gave the browser version a way to export something other than PNG. An X button clears the canvas; Szymon asked for it to confirm first.
7. **The paste hint** now disappears when anything is drawn on a blank canvas, not only when an image is loaded.
8. **App icon** designed and generated for all platforms, and used as the browser-tab icon.
9. **MIT license** added, after Szymon described wanting "anyone can do anything, I am not responsible".
10. **Installing the build.** Running the binary from the build folder shows no icon on GNOME, because the desktop takes icons from installed applications. Installing the RPM fixed it. `dnf reinstall` does nothing unless the package is already installed; the first time it has to be `dnf install`.
11. **Looked into and left for later**: a custom domain (names were free, about 10 to 15 USD a year), and opening screenshots from GNOME's notification (declined, see the roadmap).
