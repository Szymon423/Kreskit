# Kreskit

Fast screenshot annotation. Paste a screenshot, mark it up, and copy or export the result. Every annotation stays editable, so nothing is baked into the image until you export it.

Kreskit is a desktop app built with [Tauri 2](https://tauri.app), TypeScript, [Vite](https://vite.dev) and [Konva](https://konvajs.org).

## Features

- **Get an image in quickly**: paste from the clipboard, drop a file onto the window, or open one with the file picker.
- **Annotation tools**: rectangle, ellipse, line, arrow, pen, highlighter and text.
- **Dimensions**: linear, radius and diameter dimensions for marking up measurements.
- **Editable objects**: select, move, resize, restyle, duplicate and reorder anything you have drawn, with undo and redo.
- **Snapping**: align objects to each other while drawing or editing; toggle it on or off at any time.
- **Export**: PNG, JPG, SVG or PDF, or copy the flattened image straight to the clipboard.
- **Project files**: save your work as a `.shot` file and reopen it later with every annotation still editable.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) and npm
- [Rust](https://rustup.rs)
- The Tauri system dependencies for your platform; see the [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Run in development

```sh
npm install
npm run tauri dev
```

### Build a release

```sh
npm run tauri build
```

The installers and binary end up in `src-tauri/target/release/bundle/`.

The frontend also runs in a plain browser with `npm run dev` (at http://localhost:1420), with the limits a browser imposes: exports download in the first offered format instead of asking where to save.

## Keyboard shortcuts

### Tools

| Key | Tool |
| --- | --- |
| `V` | Select |
| `R` | Rectangle |
| `O` | Ellipse |
| `L` | Line |
| `A` | Arrow |
| `P` | Pen |
| `H` | Highlighter |
| `T` | Text |
| `D` | Dimension (hold `Shift` to lock horizontal/vertical) |
| `Shift+R` | Radius |
| `Shift+D` | Diameter |
| `S` | Toggle snapping |
| `Esc` | Back to Select, or clear the selection |

### Files and clipboard

| Key | Action |
| --- | --- |
| `Ctrl+V` | Paste an image |
| `Ctrl+O` | Open an image or `.shot` project |
| `Ctrl+S` | Save the editable project |
| `Ctrl+E` | Export as PNG, JPG, SVG or PDF |
| `Ctrl+C` | Copy the image to the clipboard |

### Editing

| Key | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate |
| `Ctrl+]` / `Ctrl+[` | Move forward / backward (add `Shift` for front / back) |
| `Delete` / `Backspace` | Delete the selection |
| Arrow keys | Nudge the selection by 1 px (`Shift` for 10 px) |

### View

| Key | Action |
| --- | --- |
| `Ctrl+0` | Fit the image to the window |
| `Ctrl+1` | Actual size |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| Scroll wheel / pinch | Zoom at the pointer |
| `Space` + drag | Pan |

## Project layout

```
index.html        Toolbar markup and app shell
src/              Frontend (TypeScript)
  main.ts         Wires the UI, shortcuts and file actions together
  editor.ts       Konva rendering and pointer/key input
  model.ts        Document and object types
  store.ts        Document state with undo/redo
  dimension.ts    Dimension geometry
  export.ts       PNG, JPG, SVG and PDF output
  files.ts        Save/open dialogs, clipboard and .shot project files
src-tauri/        Rust shell: window, plugins, bundling config
public/fonts/     Font embedded into PDF exports
```

## Notes

- PDF exports set all text in DejaVu Sans, whatever font the text object uses, because PDF's built-in fonts only cover Western European letters.
- A `.shot` file is JSON with the base image and any placed pictures embedded as PNG data URLs.
