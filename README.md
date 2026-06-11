# PC Remote

A lightweight, local-network-only remote for your PC. Control playback,
volume, and your mouse from your phone — perfect for the couch or bed when
you're casting from your computer and don't want to get up to hit pause.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<!--
  Add a screenshot or GIF here once available, e.g.:
  ![Desktop status window](docs/screenshot-desktop.png)
  ![Phone remote UI](docs/screenshot-phone.png)
-->

> ⚠️ **Local network only.** PC Remote opens an unauthenticated-by-default
> control surface on your local network, protected only by a short pairing
> PIN (see [Security](#security) below). Do not port-forward or expose it to
> the internet.

## How it works

- An **Electron** desktop app starts an **Express + Socket.io** server on
  launch (default port `5577`).
- The desktop window shows the server status, your local IP, a **QR code**,
  a **pairing PIN**, and the list of connected phones.
- Scanning the QR code (or visiting `http://<your-pc-ip>:5577` and entering
  the PIN) loads a touch-friendly remote: play/pause, next/previous, volume
  slider, and a touchpad with left/right click.
- Phone actions are sent over a WebSocket and executed on the PC using
  **@nut-tree-fork/nut-js** (mouse movement/clicks and media/volume key
  presses).

## Project structure

```
pc-remote/
├── package.json          # App metadata, dependencies, electron-builder config
├── main.js                # Electron main process (window, tray, server lifecycle, QR)
├── preload.js             # Secure IPC bridge for the desktop renderer
├── server.js              # Express + Socket.io server, robotjs control logic
├── assets/
│   └── icon.png           # App icon
├── renderer/               # Desktop UI (status window)
│   ├── index.html
│   ├── styles.css
│   └── renderer.js
└── public/                 # Phone web UI, served by the Express server
    ├── index.html
    ├── styles.css
    └── client.js
```

## Setup

Requires **Node.js 18+**. Mouse/keyboard control uses
`@nut-tree-fork/nut-js`, which ships **prebuilt native binaries** for
Windows, macOS, and Linux — no Visual Studio, Xcode, or build tools needed
for normal installs.

Install dependencies:

```bash
npm install
```

> **Windows + PowerShell note**: if `npm install`/`npm start` fail with a
> message about "running scripts is disabled on this system", PowerShell's
> execution policy is blocking npm's `.ps1` wrapper. Either run:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> or use Command Prompt (`cmd.exe`) instead of PowerShell.

If `@nut-tree-fork/nut-js` fails to install/load on an unsupported
platform/architecture, the app will still run — the server starts and the
UI loads, but mouse/keyboard/media actions are no-ops (a warning is printed
to the console).

## Run in development

```bash
npm start
```

This launches the Electron app, auto-starts the server, and shows the QR
code/status window.

## Build a standalone executable

This project uses `electron-builder` to package a single distributable:

```bash
# Build for your current platform
npm run dist

# Or target a specific platform
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output binaries are placed in `dist/`:

- **Windows**: an NSIS installer (`PC Remote Setup x.x.x.exe`)
- **macOS**: a `.dmg`
- **Linux**: an `AppImage`

> Note: `@nut-tree-fork/nut-js` ships native binaries per-platform/arch.
> Build on (or cross-compile for) the target OS/architecture for best
> results.

## Using it

1. Launch PC Remote on your computer. The server starts automatically and a
   new 4-digit **pairing PIN** is generated each time it starts.
2. Make sure your phone is on the **same Wi-Fi network**.
3. Scan the QR code shown in the desktop window — it embeds the PIN, so
   you'll connect automatically. If you type the address in manually
   instead, enter the PIN shown on the desktop window when prompted.
4. Use the touchpad to move the mouse, tap to left-click, or use the
   left/right click buttons. Use the transport buttons and slider for
   media/volume control.
5. From the desktop window you can stop/start the server (generating a new
   PIN) and see currently connected devices at any time. Closing the window
   minimizes PC Remote to the system tray; use the tray menu to quit fully.

## Configuration notes

- **Port**: change `DEFAULT_PORT` in `main.js` if `5577` is in use.
- **Mouse sensitivity**: adjust `SENSITIVITY` in `public/client.js`.
- **Volume step size**: `VOLUME_STEP` in `server.js` controls how much each
  volume key press changes system volume (used to approximate the 0–100
  slider, since there's no universal cross-platform "set absolute volume"
  API via robotjs).
- **Firewall**: your OS firewall may prompt to allow incoming connections the
  first time the server starts — allow it on private/home networks.

## Security

This app is intended for trusted local networks only.

- Each server start generates a random **4-digit pairing PIN**, shown on the
  desktop window and embedded in the QR code.
- A phone must present the correct PIN (automatically via QR, or typed in
  manually) before any control commands are accepted. Unauthenticated
  connections are dropped after 15 seconds.
- The PIN changes every time the server restarts.
- There is still **no transport encryption** (plain HTTP/WS) — anyone
  capturing traffic on the same network could see the PIN and commands. Do
  not use this on untrusted/public Wi-Fi, and never expose the port to the
  internet.

## Releases

Pushing a version tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`)
triggers `.github/workflows/release.yml`, which builds installers for
Windows, macOS, and Linux and attaches them to a GitHub Release
automatically.

## License

[MIT](LICENSE)
