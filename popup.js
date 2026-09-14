// popup.js - Controller for Instagram Auto Liker & AI Commenter

document.addEventListener('DOMContentLoaded', async () => {
  const btnStart = document.getElementById('btn-start');
  const btnStartLabel = document.getElementById('btn-start-label');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const badge = document.getElementById('status-badge');
  const statusMsg = document.getElementById('status-message');

  const statLiked = document.getElementById('stat-liked');
  const statCommented = document.getElementById('stat-commented');
  const statSkipped = document.getElementById('stat-skipped');

  const minDelayInput = document.getElementById('min-delay');
  const maxDelayInput = document.getElementById('max-delay');
  const maxPostsInput = document.getElementById('max-posts');
  const skipLikedCheckbox = document.getElementById('skip-liked');
  const showHudCheckbox = document.getElementById('show-hud');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const modePills = document.querySelectorAll('.mode-pill');

  // AI elements
  const aiProviderSelect = document.getElementById('ai-provider');
  const aiApiKeyInput = document.getElementById('ai-api-key');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const aiModelInput = document.getElementById('ai-model');
  const aiEndpointInput = document.getElementById('ai-endpoint');
  const commentToneSelect = document.getElementById('comment-tone');
  const rowApiKey = document.getElementById('row-api-key');
  const rowAiEndpoint = document.getElementById('row-ai-endpoint');
  const aiHint = document.getElementById('ai-provider-hint');

  let currentMode = 'both'; // 'both' | 'like' | 'comment'

  function cleanDelay(val, defaultVal = 0) {
    let n = parseFloat(val);
    if (isNaN(n) || n < 0) return defaultVal;
    if (n >= 100) n = n / 1000;
    return Math.min(30, Math.max(0, n));
  }

  const defaultSettings = {
    mode: 'both',
    minDelay: 0,
    maxDelay: 0,
    maxPosts: 50,
    skipLiked: true,
    showHud: true,
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: 'gemini-1.5-flash',
    aiEndpoint: '',
    commentTone: 'casual'
  };

  const stored = await chrome.storage.sync.get(defaultSettings);
  currentMode = stored.mode || 'both';
  minDelayInput.value = cleanDelay(stored.minDelay, 0);
  maxDelayInput.value = cleanDelay(stored.maxDelay, 0);
  maxPostsInput.value = Math.max(0, parseInt(stored.maxPosts, 10) || 50);
  skipLikedCheckbox.checked = stored.skipLiked !== undefined ? stored.skipLiked : true;
  showHudCheckbox.checked = stored.showHud !== undefined ? stored.showHud : true;

  aiProviderSelect.value = stored.aiProvider || 'gemini';
  aiApiKeyInput.value = stored.aiApiKey || '';
  aiModelInput.value = stored.aiModel || 'gemini-1.5-flash';
  aiEndpointInput.value = stored.aiEndpoint || '';
  commentToneSelect.value = stored.commentTone || 'casual';

  updateModeUI();
  updateProviderUI();
  updatePresetButtons();

  // Mode Selection
  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      currentMode = pill.dataset.mode;
      updateModeUI();
      saveSettings();
    });
  });

  function updateModeUI() {
    modePills.forEach(p => {
      p.classList.toggle('active', p.dataset.mode === currentMode);
    });
    if (currentMode === 'like') {
      btnStartLabel.textContent = 'Start Auto-Liking';
    } else if (currentMode === 'comment') {
      btnStartLabel.textContent = 'Start AI Commenting';
    } else {
      btnStartLabel.textContent = 'Start Like & Comment';
    }
  }

  // AI Provider UI Change
  aiProviderSelect.addEventListener('change', () => {
    const prov = aiProviderSelect.value;
    if (prov === 'gemini') {
      aiModelInput.value = 'gemini-1.5-flash';
      aiHint.innerHTML = '💡 Gemini 1.5 Flash has a generous free tier. Get a key at <a href="https://aistudio.google.com" target="_blank" style="color: #60a5fa;">aistudio.google.com</a>.';
    } else if (prov === 'openai') {
      aiModelInput.value = 'gpt-4o-mini';
      aiHint.innerHTML = '💡 OpenAI GPT-4o-mini is fast and authentic. Get a key from <a href="https://platform.openai.com" target="_blank" style="color: #60a5fa;">platform.openai.com</a>.';
    } else if (prov === 'openrouter') {
      aiModelInput.value = 'meta-llama/llama-3.2-11b-vision-instruct';
      aiHint.innerHTML = '💡 OpenRouter provides access to open-source vision models (Llama 3.2 Vision).';
    } else {
      aiHint.innerHTML = '💡 Offline mode uses context-aware authentic human comments without requiring an API key.';
    }
    updateProviderUI();
    saveSettings();
  });

  function updateProviderUI() {
    const prov = aiProviderSelect.value;
    rowApiKey.style.display = prov === 'fallback' ? 'none' : 'flex';
    rowAiEndpoint.style.display = (prov === 'openrouter') ? 'flex' : 'none';
  }

  // Toggle API key visibility
  btnToggleKey.addEventListener('click', () => {
    if (aiApiKeyInput.type === 'password') {
      aiApiKeyInput.type = 'text';
      btnToggleKey.textContent = '🔒';
    } else {
      aiApiKeyInput.type = 'password';
      btnToggleKey.textContent = '👁';
    }
  });

  function updatePresetButtons() {
    const currentMin = parseFloat(minDelayInput.value) || 0;
    presetBtns.forEach(btn => {
      const d = parseFloat(btn.dataset.delay);
      btn.classList.toggle('active', Math.abs(d - currentMin) < 0.5);
    });
  }

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
      mode: currentMode,
      minDelay: minD,
      maxDelay: maxD,
      maxPosts: maxP,
      skipLiked: skipLikedCheckbox.checked,
      showHud: showHudCheckbox.checked,
      aiProvider: aiProviderSelect.value,
      aiApiKey: aiApiKeyInput.value.trim(),
      aiModel: aiModelInput.value.trim(),
      aiEndpoint: aiEndpointInput.value.trim(),
      commentTone: commentToneSelect.value
    };
    chrome.storage.sync.set(settings);
    sendToActiveTab({ action: 'updateSettings', settings });
    return settings;
  }

  [minDelayInput, maxDelayInput, maxPostsInput, skipLikedCheckbox, showHudCheckbox,
   aiApiKeyInput, aiModelInput, aiEndpointInput, commentToneSelect].forEach(el => {
    el.addEventListener('change', () => {
      updatePresetButtons();
      saveSettings();
    });
  });

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
    statCommented.textContent = state.commentedCount || 0;
    statSkipped.textContent = state.skippedCount || 0;

    if (state.mode && state.mode !== currentMode) {
      currentMode = state.mode;
      updateModeUI();
    }

    if (state.status === 'running') {
      badge.textContent = 'Running';
      badge.className = 'badge running';
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.textContent = '⏸ Pause';
      btnStop.disabled = false;
      statusMsg.textContent = state.message || 'Automation in progress...';
    } else if (state.status === 'paused') {
      badge.textContent = 'Paused';
      badge.className = 'badge paused';
      btnStart.disabled = false;
      btnStartLabel.textContent = 'Resume';
      btnPause.disabled = true;
      btnStop.disabled = false;
      statusMsg.textContent = 'Paused. Click Resume to continue.';
    } else {
      badge.textContent = 'Idle';
      badge.className = 'badge idle';
      btnStart.disabled = false;
      updateModeUI();
      btnPause.disabled = true;
      btnStop.disabled = true;
      statusMsg.textContent = state.message || 'Ready. Click Start on a profile.';
    }
  }

  const initial = await sendToActiveTab({ action: 'getStatus' });
  if (initial) {
    updateUIState(initial);
  }

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
