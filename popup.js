// popup.js - Insta Auto Liker v1.2.0
'use strict';

let selectedMode = 'like';
let selectedDelayMs = 0;
let pollInterval = null;

// ── DOM refs ──────────────────────────────────────────────
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const statusBadge = document.getElementById('status-badge');
const currentStatus = document.getElementById('current-status');
const statLiked = document.getElementById('stat-liked');
const statCommented = document.getElementById('stat-commented');
const statSkipped = document.getElementById('stat-skipped');
const aiProvider = document.getElementById('ai-provider');
const aiKey = document.getElementById('ai-key');
const aiModel = document.getElementById('ai-model');
const customDelay = document.getElementById('custom-delay');

// ── Mode buttons ──────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// ── Speed pills ───────────────────────────────────────────
document.querySelectorAll('.speed-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedDelayMs = parseInt(pill.dataset.ms, 10);
    customDelay.value = '';
  });
});

customDelay.addEventListener('input', () => {
  const v = parseInt(customDelay.value, 10);
  if (!isNaN(v) && v >= 0) {
    selectedDelayMs = v;
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
  }
});

// ── Load saved settings ───────────────────────────────────
chrome.storage.local.get(['aiProvider', 'aiKey', 'aiModel', 'delayMs'], r => {
  if (r.aiProvider) aiProvider.value = r.aiProvider;
  if (r.aiKey) aiKey.value = r.aiKey;
  if (r.aiModel) aiModel.value = r.aiModel;
  if (typeof r.delayMs === 'number') {
    selectedDelayMs = r.delayMs;
    customDelay.value = r.delayMs;
    // Highlight matching pill
    document.querySelectorAll('.speed-pill').forEach(p => {
      if (parseInt(p.dataset.ms, 10) === r.delayMs) {
        p.classList.add('active');
        customDelay.value = '';
      }
    });
  }
});

// ── Save AI settings ──────────────────────────────────────
document.getElementById('btn-save-ai').addEventListener('click', () => {
  sendToContent({
    action: 'saveSettings',
    aiProvider: aiProvider.value,
    aiKey: aiKey.value,
    aiModel: aiModel.value,
    delayMs: selectedDelayMs,
  }, () => {
    const btn = document.getElementById('btn-save-ai');
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '💾 Save AI Settings'; }, 2000);
  });
});

// ── Controls ──────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  sendToContent({
    action: 'start',
    mode: selectedMode,
    delayMs: selectedDelayMs,
  }, () => {
    setRunning(true);
    startPolling();
  });
});

btnPause.addEventListener('click', () => {
  sendToContent({ action: 'pause' }, r => {
    if (r) btnPause.textContent = r.paused ? '▶ Resume' : '⏸ Pause';
  });
});

btnStop.addEventListener('click', () => {
  sendToContent({ action: 'stop' }, () => {
    setRunning(false);
    stopPolling();
  });
});

// ── Helpers ───────────────────────────────────────────────
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

function updateStats(r) {
  if (!r) return;
  statLiked.textContent = r.liked || 0;
  statCommented.textContent = r.commented || 0;
  statSkipped.textContent = r.skipped || 0;
  if (r.status) currentStatus.textContent = r.status;
  if (r.running) {
    statusBadge.textContent = r.paused ? 'Paused' : 'Running';
    statusBadge.className = r.paused ? 'badge badge-paused' : 'badge badge-running';
  } else {
    statusBadge.textContent = 'Idle';
    statusBadge.className = 'badge badge-idle';
    setRunning(false);
    stopPolling();
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    sendToContent({ action: 'getStatus' }, updateStats);
  }, 1000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function sendToContent(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) { if (cb) cb(null); return; }
    chrome.tabs.sendMessage(tabs[0].id, msg, r => {
      if (chrome.runtime.lastError) {
        console.warn('[IAL Popup]', chrome.runtime.lastError.message);
        if (cb) cb(null);
        return;
      }
      if (cb) cb(r);
    });
  });
}

// ── Init: poll current status ─────────────────────────────
sendToContent({ action: 'getStatus' }, r => {
  if (r && r.running) {
    setRunning(true);
    startPolling();
    updateStats(r);
  }
});

// Also ensure HUD is visible
sendToContent({ action: 'showHud' }, null);
