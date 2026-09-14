// popup.js - Controller for Instagram Auto-Liker extension popup

document.addEventListener('DOMContentLoaded', async () => {
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const badge = document.getElementById('status-badge');
  const statusMsg = document.getElementById('status-message');

  const statLiked = document.getElementById('stat-liked');
  const statSkipped = document.getElementById('stat-skipped');
  const statProcessed = document.getElementById('stat-processed');

  const minDelayInput = document.getElementById('min-delay');
  const maxDelayInput = document.getElementById('max-delay');
  const maxPostsInput = document.getElementById('max-posts');
  const skipLikedCheckbox = document.getElementById('skip-liked');
  const showHudCheckbox = document.getElementById('show-hud');
  const presetBtns = document.querySelectorAll('.preset-btn');

  function cleanDelay(val, defaultVal = 0) {
    let n = parseFloat(val);
    if (isNaN(n) || n < 0) return defaultVal;
    if (n >= 100) n = n / 1000; // Auto-convert ms to sec
    return Math.min(30, Math.max(0, n));
  }

  // Load saved settings
  const defaultSettings = {
    minDelay: 0,
    maxDelay: 0,
    maxPosts: 50,
    skipLiked: true,
    showHud: true
  };

  const stored = await chrome.storage.sync.get(defaultSettings);
  minDelayInput.value = cleanDelay(stored.minDelay, 0);
  maxDelayInput.value = cleanDelay(stored.maxDelay, 0);
  maxPostsInput.value = Math.max(0, parseInt(stored.maxPosts, 10) || 50);
  skipLikedCheckbox.checked = stored.skipLiked !== undefined ? stored.skipLiked : true;
  showHudCheckbox.checked = stored.showHud !== undefined ? stored.showHud : true;

  function updatePresetButtons() {
    const currentMin = parseFloat(minDelayInput.value) || 0;
    presetBtns.forEach(btn => {
      const d = parseFloat(btn.dataset.delay);
      if (Math.abs(d - currentMin) < 0.5) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  updatePresetButtons();

  // Preset button clicks
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = parseFloat(btn.dataset.delay);
      minDelayInput.value = sec;
      maxDelayInput.value = sec === 0 ? 0 : sec + 1;
      updatePresetButtons();
      saveSettings();
    });
  });

  function saveSettings() {
    const minD = cleanDelay(minDelayInput.value, 0);
    const maxD = Math.max(minD, cleanDelay(maxDelayInput.value, minD));
    const maxP = Math.max(0, parseInt(maxPostsInput.value, 10) || 0);

    const settings = {
      minDelay: minD,
      maxDelay: maxD,
      maxPosts: maxP,
      skipLiked: skipLikedCheckbox.checked,
      showHud: showHudCheckbox.checked
    };
    chrome.storage.sync.set(settings);
    sendToActiveTab({ action: 'updateSettings', settings });
    return settings;
  }

  [minDelayInput, maxDelayInput, maxPostsInput, skipLikedCheckbox, showHudCheckbox].forEach(el => {
    el.addEventListener('change', () => {
      updatePresetButtons();
      saveSettings();
    });
  });

  // Query active tab
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToActiveTab(message) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return null;
    if (!tab.url || !tab.url.includes('instagram.com')) {
      statusMsg.textContent = 'Please open an Instagram profile.';
      return null;
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      statusMsg.textContent = 'Refresh Instagram page to activate.';
      return null;
    }
  }

  function updateUIState(state) {
    if (!state) return;

    statLiked.textContent = state.likedCount || 0;
    statSkipped.textContent = state.skippedCount || 0;
    statProcessed.textContent = (state.likedCount || 0) + (state.skippedCount || 0);

    if (state.status === 'running') {
      badge.textContent = 'Running';
      badge.className = 'badge running';
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.textContent = '⏸ Pause';
      btnStop.disabled = false;
      statusMsg.textContent = state.message || 'Auto-liking in progress...';
    } else if (state.status === 'paused') {
      badge.textContent = 'Paused';
      badge.className = 'badge paused';
      btnStart.disabled = false;
      btnStart.innerHTML = '<span class="btn-icon">▶</span> Resume';
      btnPause.disabled = true;
      btnStop.disabled = false;
      statusMsg.textContent = 'Paused. Click Resume to continue.';
    } else {
      badge.textContent = 'Idle';
      badge.className = 'badge idle';
      btnStart.disabled = false;
      btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Liking';
      btnPause.disabled = true;
      btnStop.disabled = true;
      statusMsg.textContent = state.message || 'Ready. Click Start on a profile.';
    }
  }

  // Poll status once when popup opens
  const initial = await sendToActiveTab({ action: 'getStatus' });
  if (initial) {
    updateUIState(initial);
  }

  // Listen for broadcast status from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATUS_UPDATE') {
      updateUIState(msg.state);
    }
  });

  btnStart.addEventListener('click', async () => {
    const settings = saveSettings();
    const resp = await sendToActiveTab({ action: 'start', settings });
    if (resp && resp.state) {
      updateUIState(resp.state);
    }
  });

  btnPause.addEventListener('click', async () => {
    const resp = await sendToActiveTab({ action: 'pause' });
    if (resp && resp.state) {
      updateUIState(resp.state);
    }
  });

  btnStop.addEventListener('click', async () => {
    const resp = await sendToActiveTab({ action: 'stop' });
    if (resp && resp.state) {
      updateUIState(resp.state);
    }
  });
});
