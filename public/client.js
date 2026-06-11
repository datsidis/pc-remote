(function () {
  function detectDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    return 'Phone';
  }

  // scanned QR codes carry the pin so you don't have to type it
  const urlParams = new URLSearchParams(window.location.search);
  const urlPin = urlParams.get('pin');

  const socket = io({
    query: { name: detectDeviceName(), pin: urlPin || '' }
  });

  const appEl = document.getElementById('app');
  const pairOverlay = document.getElementById('pair-overlay');
  const pinInput = document.getElementById('pin-input');
  const pinSubmit = document.getElementById('pin-submit');
  const pairError = document.getElementById('pair-error');

  function showApp() {
    pairOverlay.hidden = true;
    appEl.hidden = false;
  }

  function showPairScreen(message) {
    appEl.hidden = true;
    pairOverlay.hidden = false;
    if (message) {
      pairError.textContent = message;
      pairError.hidden = false;
    } else {
      pairError.hidden = true;
    }
    pinInput.value = '';
    pinInput.focus();
  }

  socket.on('auth-result', ({ success, reason }) => {
    if (success) {
      showApp();
    } else if (reason === 'timeout') {
      showPairScreen('Pairing timed out. Enter the PIN to reconnect.');
    } else {
      showPairScreen('Incorrect PIN. Try again.');
    }
  });

  function submitPin() {
    const value = pinInput.value.trim();
    if (value.length !== 4) {
      pairError.textContent = 'Enter the 4-digit PIN.';
      pairError.hidden = false;
      return;
    }
    socket.emit('auth', value);
  }

  pinSubmit.addEventListener('click', submitPin);
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPin();
  });

  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const deviceNameLabel = document.getElementById('device-name-label');

  socket.on('connect', () => {
    statusPill.classList.remove('offline');
    statusPill.classList.add('online');
    statusText.textContent = 'Connected';
    deviceNameLabel.textContent = `Connected as ${detectDeviceName()}`;

    // no pin in the url -> ask for it manually
    if (!urlPin) {
      showPairScreen();
    }
  });

  socket.on('disconnect', () => {
    statusPill.classList.remove('online');
    statusPill.classList.add('offline');
    statusText.textContent = 'Disconnected';
    deviceNameLabel.textContent = 'Reconnecting…';
  });

  // transport buttons
  const playBtn = document.getElementById('play-btn');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  let isPlaying = false;

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
    socket.emit('media-control', 'play-pause');
  });

  prevBtn.addEventListener('click', () => {
    socket.emit('media-control', 'previous');
  });

  nextBtn.addEventListener('click', () => {
    socket.emit('media-control', 'next');
  });

  // volume slider
  const volumeSlider = document.getElementById('volume-slider');
  let volumeTimeout = null;

  volumeSlider.addEventListener('input', () => {
    const value = Number(volumeSlider.value);
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
      socket.emit('volume-set', value);
    }, 80); // throttle to avoid flooding the socket while dragging
  });

  // touchpad
  const touchpad = document.getElementById('touchpad');
  let lastX = null;
  let lastY = null;
  let moved = false;
  let tapTimer = null;

  const SENSITIVITY = 1.6;

  function handleStart(x, y) {
    lastX = x;
    lastY = y;
    moved = false;
    touchpad.classList.add('active');
  }

  function handleMove(x, y) {
    if (lastX === null) return;
    const dx = x - lastX;
    const dy = y - lastY;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      moved = true;
      socket.emit('mouse-move', { dx, dy, sensitivity: SENSITIVITY });
    }

    lastX = x;
    lastY = y;
  }

  function handleEnd() {
    touchpad.classList.remove('active');
    if (!moved) {
      // no movement = just a tap, treat it as a click
      socket.emit('mouse-click', 'left');
    }
    lastX = null;
    lastY = null;
    moved = false;
  }

  // touch
  touchpad.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  }, { passive: true });

  touchpad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, { passive: false });

  touchpad.addEventListener('touchend', () => {
    handleEnd();
  });

  // mouse, for testing in a desktop browser
  let mouseDown = false;
  touchpad.addEventListener('mousedown', (e) => {
    mouseDown = true;
    handleStart(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    handleMove(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    handleEnd();
  });

  // click buttons
  document.getElementById('left-click').addEventListener('click', () => {
    socket.emit('mouse-click', 'left');
  });

  document.getElementById('right-click').addEventListener('click', () => {
    socket.emit('mouse-click', 'right');
  });
})();
