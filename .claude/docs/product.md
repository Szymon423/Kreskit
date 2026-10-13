# Product

## What Kreskit is for

Most screenshots need a quick edit before they are shared: highlight something, circle it, add a note, or mark a measurement. Kreskit does that and nothing else. It should feel more capable than Microsoft Paint and far lighter than GIMP.

## The wanted end result

- **Fast.** The app opens quickly, `Ctrl+V` drops the screenshot in, and you are drawing straight away. Annotated image goes back out with `Ctrl+C`.
- **Everything stays editable.** Anything placed on the image can be selected later and moved, resized, rotated, restyled (colour, width, opacity, font), reordered, duplicated or deleted. Nothing is baked into the image until export.
- **CAD-style dimensions.** Pick a dimension tool, drag between two points, type the value. Dimensions have arrows and extension lines, can be moved, stretched and offset, and look consistent and professional. The value is typed by hand; the app does not measure pixels.
- **Cross-platform desktop app.** Linux, Windows and macOS from one codebase. Linux (Fedora, Wayland) is where it is developed and tested day to day.
- **Simple UI.** The canvas fills the window. A floating tool strip, a context bar for the selected object's style, a zoom readout. No menus, no panels.

## Decisions already made

| Area | Choice |
| --- | --- |
| Shell | Tauri 2 (Rust), single instance, normal window |
| UI | Vanilla TypeScript + Vite, Konva for the canvas |
| Input | `Ctrl+V` paste, open file, drag and drop |
| Output | Copy to clipboard, PNG/JPG, SVG/PDF, editable `.kit` project file |
| Tools | Select, rectangle, ellipse, line, arrow, pen, highlighter, text, dimensions |
| Dimensions | Linear at any angle, horizontal/vertical lock with Shift, radius, diameter |
| Website | Landing page plus the editor running in the browser, on GitHub Pages; a custom domain maybe later |
| License | MIT |
| Image operations | Crop, resize, rotate in 90° steps (not built yet) |
| Editing | Undo/redo, snapping with guides, zoom/pan, multi-select, per-tool remembered styles |

## Behaviour Szymon asked for explicitly

These came out of testing rounds. Do not change them without asking.

- **Tools stay active after drawing**, so several arrows or shapes can be drawn in a row. `V` or `Esc` returns to the selector. The trade-off, accepted: a freshly drawn shape is not auto-selected.
- **Pasting over existing work asks first**: add the image to the canvas (default), replace everything, or cancel. Opening a project over existing work also asks, with Cancel as the default.
- **Snapping** applies while drawing, while dragging an object, while dragging an endpoint, and while resizing. There is a toolbar toggle (magnet icon, `S` key), remembered between sessions. Holding `Ctrl` gives the opposite of the current setting.
- **Dimension arrowheads** are plain filled triangles whose tip sits exactly on the end of the dimension line; they must not overshoot the extension lines.
- **Line endings come in four kinds**, chosen in the style bar for arrows and for dimensions: triangle, pointed (a triangle with a notched back), tick, and none. On an arrow the tick is a crossbar; on a dimension it is a 45° slash, because a crossbar would disappear into the extension line.
- **Annotations are sized relative to the image**, with no control to set: what you draw next is scaled by the image's longer side compared with 1000 px, so the same slider position looks the same on a small and a large screenshot. Things already drawn keep their size. Szymon chose this over an explicit per-image scale setting.
- **Dimension line width** is limited to 0.5–6 (in the style bar's image-independent units). Other tools keep the wide range (the highlighter needs about 20).
- **Dimension text** always reads left to right, and top to bottom on vertical dimensions, and sits on the side of the dimension line facing away from the measured object.
- **Pen and highlighter strokes are lightly smoothed** on release (`SMOOTHING` in `src/editor.ts`).
- **A reset-view button** sits next to the zoom percentage and does the same as `Ctrl+0`.
- **`Ctrl+C` always copies the whole flattened image**, never the selected objects; `Ctrl+D` duplicates objects.
- **One output menu** in the toolbar replaces the separate copy, export and save buttons. It opens on hover (or click) and lists Copy image, Export as PNG/JPG/SVG/PDF and Save editable project.
- **A clear button** (X, at the right end of the toolbar) empties the canvas and brings back the paste hint. It asks first, with Cancel as the default, because a misclick must not cost the work; `Ctrl+Z` still restores everything afterwards.
- **The empty-state hint** ("Ctrl+V to paste a screenshot") disappears once an image is loaded or anything is drawn on the empty canvas, and returns when the canvas is empty again.
