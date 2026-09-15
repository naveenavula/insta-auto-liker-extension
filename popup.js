// popup.js - Insta Auto Liker & Commenter v1.3.0
'use strict';

let selectedMode = 'like';
let selectedDelayMs = 0;
let pollTimer = null;
let currentTabId = null;

// DOM Elements
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const statusBadge = document.getElementById('status-badge');
const currentStatus = document.getElementById('current-status');
const statLiked = document.getElementById('stat-liked');
const statCommented = document.getElementById('stat-commented');
const statSkipped = document.getElementById('stat-skipped');
const notInstaBanner = document.getElementById('not-insta-banner');
const customDelay = document.getElementById('custom-delay');

// AI Settings Elements
const aiProvider = document.getElementById('ai-provider');
const aiKey = document.getElementById('ai-key');
const aiModel = document.getElementById('ai-model');
const btnSaveAi = document.getElementById('btn-save-ai');

// ── Tab Management & Injection ──────────────────────────────
function getActiveInstagramTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      callback(null);
      return;
    }
    currentTabId = tab.id;
    const isInsta = tab.url && tab.url.includes('instagram.com');
    if (!isInsta) {
      if (notInstaBanner) notInstaBanner.style.display = 'block';
      callback(null);
      return;
    }
    if (notInstaBanner) notInstaBanner.style.display = 'none';
    callback(tab);
  });
}

function sendToContent(msg, callback) {
  getActiveInstagramTab(tab => {
    if (!tab) {
      if (callback) callback(null);
      return;
    }

    chrome.tabs.sendMessage(tab.id, msg, response => {
      if (chrome.runtime.lastError) {
        // Tab exists, but content script not yet injected (e.g. extension just updated)
        console.log('[IAL Popup] Injecting content script dynamically...');
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          }, () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, msg, res => {
                if (callback) callback(res || null);
              });
            }, 300);
          });
        });
      } else {
        if (callback) callback(response);
      }
    });
  });
}

// ── Mode Selector ───────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
    chrome.storage.local.set({ mode: selectedMode });
  });
});

// ── Delay Presets ───────────────────────────────────────────
document.querySelectorAll('.speed-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedDelayMs = parseInt(pill.dataset.ms, 10);
    customDelay.value = '';
    chrome.storage.local.set({ delayMs: selectedDelayMs });
  });
});

customDelay.addEventListener('input', () => {
  const v = parseInt(customDelay.value, 10);
  if (!isNaN(v) && v >= 0) {
    selectedDelayMs = v;
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
    chrome.storage.local.set({ delayMs: selectedDelayMs });
  }
});

// ── Load Settings ───────────────────────────────────────────
chrome.storage.local.get(['mode', 'delayMs', 'aiProvider', 'aiKey', 'aiModel'], r => {
  if (r.mode) {
    selectedMode = r.mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === r.mode);
    });
  }
  if (typeof r.delayMs === 'number') {
    selectedDelayMs = r.delayMs;
    customDelay.value = r.delayMs;
    document.querySelectorAll('.speed-pill').forEach(p => {
      p.classList.toggle('active', parseInt(p.dataset.ms, 10) === r.delayMs);
    });
  }
  if (r.aiProvider && aiProvider) aiProvider.value = r.aiProvider;
  if (r.aiKey && aiKey) aiKey.value = r.aiKey;
  if (r.aiModel && aiModel) aiModel.value = r.aiModel;
});

// ── Save AI Settings ────────────────────────────────────────
btnSaveAi.addEventListener('click', () => {
  const settings = {
    aiProvider: aiProvider.value,
    aiKey: aiKey.value.trim(),
    aiModel: aiModel.value.trim(),
    delayMs: selectedDelayMs,
  };

  sendToContent({ action: 'saveSettings', ...settings }, () => {
    chrome.storage.local.set(settings, () => {
      btnSaveAi.textContent = '✅ Saved Successfully!';
      setTimeout(() => { btnSaveAi.textContent = '💾 Save AI Settings'; }, 2000);
    });
  });
});

const btnResetHistory = document.getElementById('btn-reset-history');
if (btnResetHistory) {
  btnResetHistory.addEventListener('click', () => {
    sendToContent({ action: 'resetHistory' }, () => {
      btnResetHistory.textContent = '✅ History Cleared!';
      statLiked.textContent = '0';
      statCommented.textContent = '0';
      statSkipped.textContent = '0';
      setTimeout(() => { btnResetHistory.textContent = '🔄 Reset Liked/Commented History'; }, 2000);
    });
  });
}

// ── Control Buttons ─────────────────────────────────────────
btnStart.addEventListener('click', () => {
  setRunning(true);
  sendToContent({
    action: 'start',
    mode: selectedMode,
    delayMs: selectedDelayMs,
  }, () => {
    startStatusPolling();
  });
});

btnPause.addEventListener('click', () => {
  sendToContent({ action: 'pause' }, res => {
    if (res) {
      btnPause.textContent = res.paused ? '▶ Resume' : '⏸ Pause';
    }
  });
});

btnStop.addEventListener('click', () => {
  sendToContent({ action: 'stop' }, () => {
    setRunning(false);
    stopStatusPolling();
  });
});

// ── Status & Stats Polling ──────────────────────────────────
function setRunning(running) {
  btnStart.disabled = running;
  btnPause.disabled = !running;
  btnStop.disabled = !running;
  btnPause.textContent = '⏸ Pause';

  if (running) {
    statusBadge.textContent = 'Running';
    statusBadge.className = 'badge badge-running';
  } else {
    statusBadge.textContent = 'Idle';
    statusBadge.className = 'badge badge-idle';
  }
}

function updateUIWithStatus(status) {
  if (!status) return;

  statLiked.textContent = status.liked || 0;
  statCommented.textContent = status.commented || 0;
  statSkipped.textContent = status.skipped || 0;
  if (status.status) currentStatus.textContent = status.status;

  if (status.running) {
    statusBadge.textContent = status.paused ? 'Paused' : 'Running';
    statusBadge.className = status.paused ? 'badge badge-paused' : 'badge badge-running';
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnPause.textContent = status.paused ? '▶ Resume' : '⏸ Pause';
  } else {
    statusBadge.textContent = 'Idle';
    statusBadge.className = 'badge badge-idle';
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    stopStatusPolling();
  }
}

function startStatusPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    sendToContent({ action: 'getStatus' }, updateUIWithStatus);
  }, 800);
}

function stopStatusPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Initial check
sendToContent({ action: 'getStatus' }, status => {
  if (status && status.running) {
    setRunning(true);
    startStatusPolling();
    updateUIWithStatus(status);
  }
});

// Also trigger in-page HUD
sendToContent({ action: 'showHud' }, null);
