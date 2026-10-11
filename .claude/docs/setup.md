# Setting up a new machine

## 1. System packages

Fedora (the machine this was developed on):

```sh
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install c-development
```

For Debian/Ubuntu, Arch, Windows and macOS, follow the Tauri prerequisites: https://tauri.app/start/prerequisites/

## 2. Toolchains

- **Node.js** with npm.
- **Rust** via rustup:

  ```sh
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

  A terminal that was open during the install does not have cargo on its PATH yet. Either open a new one or run `. "$HOME/.cargo/env"`.

## 3. Get the code and run it

```sh
git clone git@github.com:Szymon423/Kreskit.git
cd Kreskit
npm install
npm run tauri dev
```

The first launch compiles the Rust side, which takes a few minutes. Later launches take seconds.

## 4. Check it works

Take a screenshot to the clipboard and press `Ctrl+V` in the window. The image should appear. Then try wheel zoom, Space-drag pan, and dropping an image file on the window.

## Troubleshooting

- **A grey window flashes and closes, with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`**: WebKitGTK's DMABUF renderer crashing on the proprietary NVIDIA driver. `src-tauri/src/main.rs` already works around it when `/proc/driver/nvidia` exists. If it still happens, run with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **`cargo: command not found`**: see the PATH note above.
- **`Ctrl+V` shows "No image in the clipboard"**: the clipboard holds no image, or the native clipboard read failed. The webview `paste` event is the main path; the Tauri clipboard plugin is the fallback (`src/input.ts`).
- **A full Rust rebuild after moving or renaming the folder**: expected, the build cache stores absolute paths.

## Claude Code on a new machine

The `.claude/` directory is in the repository, so project instructions load automatically. Session transcripts are not in git; they live per machine in `~/.claude/projects/` and are keyed to the folder path. `docs/history.md` holds the context a new machine needs instead.
