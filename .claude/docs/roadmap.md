# Roadmap

Last updated: 2026-10-11. Update this file whenever something here changes.

## Built

- Image in: paste, drag and drop, native open dialog (images and `.shot` projects).
- View: wheel/pinch zoom at the pointer, Space-drag pan, fit, actual size, reset-view button.
- Tools: select, rectangle, ellipse, line, arrow (one or two heads), pen, highlighter, text.
- Dimensions: linear (any angle, Shift locks horizontal/vertical), radius, diameter, with editable value.
- Editing: move, resize, rotate, multi-select, marquee, duplicate, reorder, delete, nudge, undo/redo.
- Style bar: colour, fill, width, opacity, font and size; each tool remembers its last style.
- Snapping with guide lines, plus a toggle.
- Images added on top of the base image as ordinary movable objects.
- Output: copy to clipboard, export PNG/JPG/SVG/PDF, save and reopen `.shot` projects.
- Linux desktop build compiles and runs (Fedora, Wayland, NVIDIA).

## Open, from the original plan

1. **Image operations**: crop, resize, rotate in 90° steps. Nothing exists yet. Crop is the one Szymon mentioned first.
2. **Packaging**: `npm run tauri build` produces Linux bundles locally. Windows and macOS installers need to be built on those systems or by a GitHub Actions workflow, which does not exist yet.

## Known gaps

- No copy/paste of annotation objects between places or documents (`Ctrl+D` duplicates only).
- No snapping when dragging several selected objects at once; snapping is approximate for rotated shapes.
- The ordinary arrow's tip overshoots its endpoint slightly at large widths (dimensions were fixed, arrows were not).
- The highlighter is a plain semi-transparent stroke, so it lightens text under it a little.
- A new dimension takes two undo steps: one for the value, one for the dimension.
- No warning about unsaved changes when closing the window.
- Reset view fits the base image only, not annotations reaching outside it.
- The base image is fixed in place and not selectable; only images added later are movable.
- PDF export sets all text in DejaVu Sans, whatever font the object uses.
- No automated tests. Export was checked once with a throwaway script; interaction is tested by hand.
- The app icon (`src-tauri/app-icon.svg`) is a quick placeholder.
- The README has no license; the project has no `LICENSE` file.

## Ideas, never planned

- Blur or pixelate to hide sensitive areas.
- Numbered step markers.
- Angular dimensions.
- Taking the screenshot from inside the app.

## Not verified

- Windows and macOS: never built or run.
- The rename from Shotmark to Kreskit: builds and type-checks, but the app has not been launched since. The app identifier changed to `dev.kreskit.app`, so remembered styles and the snapping setting start fresh.
