const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { RemoteServer } = require('./server');

const DEFAULT_PORT = 5577;
const MAX_PORT_ATTEMPTS = 10; // try DEFAULT_PORT, then +1, +2, ... if busy

let mainWindow = null;
let tray = null;
let remoteServer = null;
let serverState = {
  running: false,
  port: DEFAULT_PORT,
  ip: null,
  url: null,
  pin: null,
  devices: [],
  error: null
};

// Picks the IPv4 address phones on the same Wi-Fi can actually reach.
// Skips VPN/virtual adapters (NordVPN etc. love to hijack this) and
// favors the real Wi-Fi/Ethernet adapter on a private LAN range.
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  if (candidates.length === 0) return null;

  // VPN clients, virtual NICs, etc - their IPs aren't reachable from the LAN
  const isVirtual = (n) =>
    /vmware|virtualbox|vethernet|docker|hyper-v|loopback|tailscale|zerotier|nord|wireguard|openvpn|tap|tun|vpn|pia|expressvpn|mullvad|protonvpn|surfshark|wsl/i.test(
      n
    );

  const isPreferredName = (n) => /wi-?fi|wlan|ethernet|en0|eth0/i.test(n);

  const isPrivateLanIp = (ip) =>
    /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

  const real = candidates.filter((c) => !isVirtual(c.name));
  const pool = real.length > 0 ? real : candidates;

  // Best match first: real adapter name + LAN IP, then either alone, then whatever's left
  const byPreferredNameAndIp = pool.find((c) => isPreferredName(c.name) && isPrivateLanIp(c.address));
  const byPreferredName = pool.find((c) => isPreferredName(c.name));
  const byPrivateIp = pool.find((c) => isPrivateLanIp(c.address));

  const chosen = byPreferredNameAndIp || byPreferredName || byPrivateIp || pool[0];
  return chosen.address;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    // keep the server alive in the background instead of closing it
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('PC Remote');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        if (remoteServer) remoteServer.stop();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

function pushStateToRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-update', serverState);
  }
}

async function startServer(port) {
  if (remoteServer && serverState.running) return serverState;

  const ip = getLocalIp();
  const startPort = port || DEFAULT_PORT;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const tryPort = startPort + attempt;

    const candidate = new RemoteServer({
      onDevicesChanged: (devices) => {
        serverState.devices = devices;
        pushStateToRenderer();
      }
    });

    try {
      await candidate.start(tryPort);
      remoteServer = candidate;

      const url = `http://${ip || 'localhost'}:${tryPort}?pin=${remoteServer.pin}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 });

      serverState = {
        running: true,
        port: tryPort,
        ip: ip || 'unknown',
        url: `http://${ip || 'localhost'}:${tryPort}`,
        pin: remoteServer.pin,
        qrDataUrl,
        devices: [],
        error: null
      };

      pushStateToRenderer();
      return serverState;
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        continue; // that port's busy, try the next one
      }

      remoteServer = null;
      serverState = {
        running: false,
        port: tryPort,
        ip: ip || 'unknown',
        url: null,
        qrDataUrl: null,
        pin: null,
        devices: [],
        error: err.message || String(err)
      };
      pushStateToRenderer();
      return serverState;
    }
  }

  // ran out of ports to try
  remoteServer = null;
  serverState = {
    running: false,
    port: startPort,
    ip: ip || 'unknown',
    url: null,
    qrDataUrl: null,
    pin: null,
    devices: [],
    error: `Ports ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1} are all in use. Free one up or restart your PC.`
  };
  pushStateToRenderer();
  return serverState;
}

async function stopServer() {
  if (remoteServer) {
    await remoteServer.stop();
    remoteServer = null;
  }
  serverState = {
    running: false,
    port: serverState.port,
    ip: serverState.ip,
    url: null,
    qrDataUrl: null,
    pin: null,
    devices: [],
    error: null
  };
  pushStateToRenderer();
  return serverState;
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // start the server right away, no need to wait for the user to click anything
  startServer(DEFAULT_PORT).catch((err) => {
    console.error('Failed to auto-start server:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // app lives in the tray, don't quit when the window closes
  if (process.platform === 'darwin') return;
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// renderer talks to us through these
ipcMain.handle('get-state', () => serverState);
ipcMain.handle('start-server', (_event, port) => startServer(port));
ipcMain.handle('stop-server', () => stopServer());
