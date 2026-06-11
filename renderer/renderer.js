const statusPill = document.getElementById('status-pill');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const qrImage = document.getElementById('qr-image');
const qrPlaceholder = document.getElementById('qr-placeholder');
const infoUrl = document.getElementById('info-url');
const infoIp = document.getElementById('info-ip');
const infoPort = document.getElementById('info-port');
const infoPin = document.getElementById('info-pin');
const errorMessage = document.getElementById('error-message');
const toggleBtn = document.getElementById('toggle-btn');
const deviceList = document.getElementById('device-list');
const deviceCount = document.getElementById('device-count');

function render(state) {
  if (state.error) {
    errorMessage.textContent = state.error;
    errorMessage.style.display = 'block';
  } else {
    errorMessage.style.display = 'none';
  }

  if (state.running) {
    statusPill.classList.remove('offline');
    statusPill.classList.add('online');
    statusText.textContent = 'Server running';

    qrImage.src = state.qrDataUrl || '';
    qrImage.style.display = state.qrDataUrl ? 'block' : 'none';
    qrPlaceholder.style.display = state.qrDataUrl ? 'none' : 'flex';

    infoUrl.textContent = state.url || '—';
    infoIp.textContent = state.ip || '—';
    infoPort.textContent = state.port || '—';
    infoPin.textContent = state.pin || '—';

    toggleBtn.textContent = 'Stop server';
    toggleBtn.classList.remove('start');
  } else {
    statusPill.classList.remove('online');
    statusPill.classList.add('offline');
    statusText.textContent = 'Server stopped';

    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'flex';
    qrPlaceholder.textContent = 'Server offline';

    infoUrl.textContent = '—';
    infoIp.textContent = state.ip || '—';
    infoPort.textContent = state.port || '—';
    infoPin.textContent = '—';

    toggleBtn.textContent = 'Start server';
    toggleBtn.classList.add('start');
  }

  renderDevices(state.devices || []);
}

function renderDevices(devices) {
  deviceCount.textContent = String(devices.length);
  deviceList.innerHTML = '';

  if (devices.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-row';
    li.textContent = 'No devices connected';
    deviceList.appendChild(li);
    return;
  }

  for (const device of devices) {
    const li = document.createElement('li');

    const left = document.createElement('div');
    left.className = 'device-name';
    left.textContent = device.name || 'Phone';

    const right = document.createElement('div');
    right.className = 'device-meta';
    right.textContent = device.address || '';

    li.appendChild(left);
    li.appendChild(right);
    deviceList.appendChild(li);
  }
}

toggleBtn.addEventListener('click', async () => {
  toggleBtn.disabled = true;
  const current = await window.pcRemote.getState();
  if (current.running) {
    await window.pcRemote.stopServer();
  } else {
    await window.pcRemote.startServer(current.port);
  }
  toggleBtn.disabled = false;
});

window.pcRemote.onStateUpdate((state) => render(state));

// initial paint
window.pcRemote.getState().then(render);
