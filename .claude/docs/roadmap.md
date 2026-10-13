# Roadmap

Last updated: 2026-10-11. Update this file whenever something here changes.

## Built

- Image in: paste, drag and drop, native open dialog (images and `.kit` projects).
- View: wheel/pinch zoom at the pointer, Space-drag pan, fit, actual size, reset-view button.
- Tools: select, rectangle, ellipse, line, arrow (one or two heads), pen, highlighter, text.
- Line endings for arrows and dimensions: triangle, pointed, tick or none. An arrow is drawn as one filled shape, so its tip is exact and a translucent arrow has an even colour.
- Dimensions: linear (any angle, Shift locks horizontal/vertical), radius, diameter, with editable value.
- Editing: move, resize, rotate, multi-select, marquee, duplicate, reorder, delete, nudge, undo/redo.
- Style bar: colour, fill, width, opacity, font and size; each tool remembers its last style. It also restyles a text or dimension value while it is being typed or re-edited.
- Sizes follow the image: new objects are scaled by the image's longer side relative to 1000 px (limited to 0.4x–8x), and the style bar shows image-independent values.
- Snapping with guide lines, plus a toggle.
- Images added on top of the base image as ordinary movable objects.
- Toolbar: one output menu (copy, export per format, save project) and a clear-everything button.
- Output: copy to clipboard, export PNG/JPG/SVG/PDF, save and reopen `.kit` projects (older `.shot` files still open).
- The paste hint shows only on a blank canvas; it goes as soon as anything is drawn.
- App icon: a K made of a dimension line, an arrow and a stroke; also the browser-tab icon.
- Linux desktop build compiles and runs (Fedora, Wayland, NVIDIA). The RPM installs and launches from the app menu and the terminal.
- MIT license.

## Website

Live at `https://szymon423.github.io/Kreskit/`, with the editor under `app/`. Published by GitHub Pages on every push to `main`. The web build uses a relative base, so it would work unchanged under a custom domain.

- **Landing page** (`site/index.html`): header with icon and light/dark toggle (light by default, choice remembered), hero, app screenshot, six feature cards, before/after pair, "How it was made", footer with the license.
- **Browser gaps in the app, still open**: `Ctrl+1` and possibly other shortcuts belong to the browser; copy to clipboard, paste and drag-and-drop have not been reported on from a real browser yet.
- **Custom domain**: not bought. On 2026-10-11 `kreskit.com`, `.app`, `.dev`, `.pl`, `.io` and `.org` were all unregistered. Connecting one needs DNS records at the registrar, the domain entered under Settings → Pages, and a `CNAME` file added to the site.
- The deploy actions were bumped to their current major versions on 2026-10-11; the first run after that bump is the test of it.

## Open, from the original plan

1. **Image operations**: crop, resize, rotate in 90° steps. Nothing exists yet. Crop is the one Szymon mentioned first.
2. **Packaging**: `npm run tauri build` produces Linux bundles locally. Windows and macOS installers need to be built on those systems or by a GitHub Actions workflow, which does not exist yet.

## Known gaps

- No copy/paste of annotation objects between places or documents (`Ctrl+D` duplicates only).
- No snapping when dragging several selected objects at once; snapping is approximate for rotated shapes.
- On a translucent dimension, the places where a head, the line and the extension lines overlap are slightly darker (arrows no longer have this).
- The highlighter is a plain semi-transparent stroke, so it lightens text under it a little.
- A new dimension takes two undo steps: one for the value, one for the dimension.
- No warning about unsaved changes when closing the window.
- Reset view fits the base image only, not annotations reaching outside it.
- The base image is fixed in place and not selectable; only images added later are movable.
- PDF export sets all text in DejaVu Sans, whatever font the object uses.
- No automated tests. Export was checked once with a throwaway script; interaction is tested by hand.

## Ideas, never planned

- Blur or pixelate to hide sensitive areas.
- Numbered step markers.
- Angular dimensions.
- Taking the screenshot from inside the app.

## Considered and declined

- **Opening screenshots in Kreskit from GNOME's screenshot notification.** The notification belongs to GNOME Shell, so a button on it needs a shell extension. The lighter options (a launch shortcut with auto-paste from the clipboard, or making Kreskit the default PNG app) were offered and Szymon turned them down as not good enough. The app also still ignores a file path passed on the command line, so "Open With" does not work.

## Not verified

- Windows and macOS: never built or run.
- The new app icon in the GNOME dock and overview: the package contains it, but nobody has confirmed how it looks there.
- The copyright holder in `LICENSE` and the site footer is written as "Szymon423"; Szymon may want his full name there.
