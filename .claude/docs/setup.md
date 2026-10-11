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

## 5. Install the built app (Linux)

`npm run tauri build` writes the binary and three packages under `src-tauri/target/release/`. On Fedora, install the RPM:

```sh
sudo dnf install src-tauri/target/release/bundle/rpm/Kreskit-0.1.0-1.x86_64.rpm
```

After that `kreskit` (lowercase) works in a terminal and Kreskit appears in the app menu with its icon. After a rebuild the version number is unchanged, so use `sudo dnf reinstall` with the same path; `reinstall` does nothing if the package was never installed. Remove it with `sudo dnf remove kreskit`.

The installed app keeps its remembered styles separately from `npm run tauri dev`.

## 6. The website

Nothing to set up per machine: pushing to `main` builds and publishes it. To look at it locally:

```sh
npm run build:web
npx vite preview --outDir dist-web
```

The one-time repository setting is Settings → Pages → Source → "GitHub Actions".

## Troubleshooting

- **A grey window flashes and closes, with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`**: WebKitGTK's DMABUF renderer crashing on the proprietary NVIDIA driver. `src-tauri/src/main.rs` already works around it when `/proc/driver/nvidia` exists. If it still happens, run with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **The app shows a generic icon**: it is running from the build folder. GNOME takes icons from installed applications; install the RPM (section 5). If it is installed and the icon is still missing, restart the app, then log out and back in.
- **A website deploy fails with "Multiple artifacts named github-pages"**: the run was re-run. Start a new one with "Run workflow" in the Actions tab.
- **A website deploy fails with 404 "Ensure GitHub Pages has been enabled"**: the Pages source is not set to "GitHub Actions".
- **`cargo: command not found`**: see the PATH note above.
- **`Ctrl+V` shows "No image in the clipboard"**: the clipboard holds no image, or the native clipboard read failed. The webview `paste` event is the main path; the Tauri clipboard plugin is the fallback (`src/input.ts`).
- **A full Rust rebuild after moving or renaming the folder**: expected, the build cache stores absolute paths.

## Claude Code on a new machine

The `.claude/` directory is in the repository, so project instructions load automatically. Session transcripts are not in git; they live per machine in `~/.claude/projects/` and are keyed to the folder path. `docs/history.md` holds the context a new machine needs instead.
