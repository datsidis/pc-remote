const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

let mouse, keyboard, Button, Key, Point;
let nutAvailable = false;

try {
  // ships prebuilt binaries, so no build tools needed on any platform
  ({ mouse, keyboard, Button, Key, Point } = require('@nut-tree-fork/nut-js'));
  // skip the default movement animation, we want instant response
  mouse.config.mouseSpeed = 5000;
  mouse.config.autoDelayMs = 0;
  keyboard.config.autoDelayMs = 0;
  nutAvailable = true;
} catch (err) {
  console.warn(
    '[PC Remote] @nut-tree-fork/nut-js not available. Mouse/keyboard control disabled.\n' +
    'Run "npm install" to enable it. Reason: ' + err.message
  );
}

// roughly how much one volume key press changes the system volume - there's
// no cross-platform way to set an absolute level, so we fake it with steps
const VOLUME_STEP = 2;

// give up on a connection if it doesn't send the right PIN in time
const AUTH_TIMEOUT_MS = 15000;

function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

async function tapKey(key) {
  if (!nutAvailable) return;
  await keyboard.pressKey(key);
  await keyboard.releaseKey(key);
}

class RemoteServer {
  constructor({ onDevicesChanged } = {}) {
    this.onDevicesChanged = onDevicesChanged || (() => {});
    this.app = null;
    this.httpServer = null;
    this.io = null;
    this.devices = new Map(); // socket.id -> device info
    this.estimatedVolume = 50; // rough guess, 0-100
    this.pin = generatePin();
  }

  start(port) {
    return new Promise((resolve, reject) => {
      this.app = express();

      // phone UI
      this.app.use(express.static(path.join(__dirname, 'public')));

      this.app.get('/health', (_req, res) => {
        res.json({ status: 'ok', controlAvailable: nutAvailable });
      });

      this.httpServer = http.createServer(this.app);
      this.io = new Server(this.httpServer, {
        cors: { origin: '*' }
      });

      this._registerSocketHandlers();

      this.httpServer.listen(port, () => resolve());
      this.httpServer.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.devices.clear();
      if (this.io) this.io.close();
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  _emitDevicesChanged() {
    this.onDevicesChanged(Array.from(this.devices.values()));
  }

  _registerSocketHandlers() {
    this.io.on('connection', (socket) => {
      const address = socket.handshake.address || 'unknown';
      const deviceName = (socket.handshake.query && socket.handshake.query.name) || 'Phone';
      const queryPin = socket.handshake.query && socket.handshake.query.pin;

      socket.authenticated = false;

      const registerDevice = () => {
        this.devices.set(socket.id, {
          id: socket.id,
          name: deviceName,
          address,
          connectedAt: Date.now()
        });
        this._emitDevicesChanged();
      };

      const authenticate = () => {
        socket.authenticated = true;
        clearTimeout(authTimer);
        registerDevice();
        socket.emit('auth-result', { success: true });
      };

      // bail if nobody enters the PIN in time
      const authTimer = setTimeout(() => {
        if (!socket.authenticated) {
          socket.emit('auth-result', { success: false, reason: 'timeout' });
          socket.disconnect(true);
        }
      }, AUTH_TIMEOUT_MS);

      // QR code links include the PIN, so scanning it logs you in instantly
      if (queryPin && String(queryPin) === this.pin) {
        authenticate();
      }

      // fallback for anyone who typed the address in by hand
      socket.on('auth', (submittedPin) => {
        if (socket.authenticated) return;
        if (String(submittedPin) === this.pin) {
          authenticate();
        } else {
          socket.emit('auth-result', { success: false, reason: 'invalid' });
        }
      });

      socket.on('disconnect', () => {
        clearTimeout(authTimer);
        if (this.devices.has(socket.id)) {
          this.devices.delete(socket.id);
          this._emitDevicesChanged();
        }
      });

      // ignore everything until the PIN checks out
      const guarded = (handler) => (...args) => {
        if (!socket.authenticated) return;
        handler(...args);
      };

      // media controls
      socket.on('media-control', guarded(async (action) => {
        if (!nutAvailable) return;
        try {
          switch (action) {
            case 'play-pause':
              await tapKey(Key.AudioPlay);
              break;
            case 'next':
              await tapKey(Key.AudioNext);
              break;
            case 'previous':
              await tapKey(Key.AudioPrev);
              break;
            case 'mute':
              await tapKey(Key.AudioMute);
              break;
            default:
              break;
          }
        } catch (err) {
          console.error('media-control error:', err.message);
        }
      }));

      // volume slider (0-100)
      socket.on('volume-set', guarded(async (value) => {
        if (!nutAvailable) return;
        try {
          const target = Math.max(0, Math.min(100, Number(value)));
          const diff = target - this.estimatedVolume;
          const steps = Math.round(Math.abs(diff) / VOLUME_STEP);
          const key = diff > 0 ? Key.AudioVolUp : Key.AudioVolDown;

          for (let i = 0; i < steps; i++) {
            await tapKey(key);
          }
          this.estimatedVolume = target;
        } catch (err) {
          console.error('volume-set error:', err.message);
        }
      }));

      // touchpad drag
      socket.on('mouse-move', guarded(async ({ dx, dy, sensitivity }) => {
        if (!nutAvailable) return;
        try {
          const factor = typeof sensitivity === 'number' ? sensitivity : 1.5;
          const pos = await mouse.getPosition();
          await mouse.setPosition(
            new Point(Math.round(pos.x + dx * factor), Math.round(pos.y + dy * factor))
          );
        } catch (err) {
          console.error('mouse-move error:', err.message);
        }
      }));

      // tap to click
      socket.on('mouse-click', guarded(async (button) => {
        if (!nutAvailable) return;
        try {
          const map = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };
          const btn = map[button] || Button.LEFT;
          await mouse.click(btn);
        } catch (err) {
          console.error('mouse-click error:', err.message);
        }
      }));

      // two-finger scroll
      socket.on('mouse-scroll', guarded(async ({ dx, dy }) => {
        if (!nutAvailable) return;
        try {
          const x = Math.round(dx || 0);
          const y = Math.round(dy || 0);
          if (y > 0) await mouse.scrollDown(y);
          else if (y < 0) await mouse.scrollUp(-y);
          if (x > 0) await mouse.scrollRight(x);
          else if (x < 0) await mouse.scrollLeft(-x);
        } catch (err) {
          console.error('mouse-scroll error:', err.message);
        }
      }));
    });
  }
}

module.exports = { RemoteServer };
