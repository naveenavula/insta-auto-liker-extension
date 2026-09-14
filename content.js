// content.js - Instagram Profile Auto-Liker Engine

(() => {
  // Prevent multiple injections
  if (window.__INSTA_AUTO_LIKER_INITIALIZED__) return;
  window.__INSTA_AUTO_LIKER_INITIALIZED__ = true;

  const STATE = {
    status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'done'
    likedCount: 0,
    skippedCount: 0,
    currentPostUrl: '',
    message: 'Ready. Open a profile to start.',
    settings: {
      minDelay: 0,
      maxDelay: 0,
      maxPosts: 50,
      skipLiked: true,
      showHud: true
    }
  };

  let isStopRequested = false;
  let isPauseRequested = false;
  let loopActive = false;

  // Sanitizes delay value. Converts millisecond inputs (e.g. 500, 750) to seconds (0.5, 0.75), allows 0.
  function cleanDelay(val, defaultVal = 0) {
    let n = parseFloat(val);
    if (isNaN(n) || n < 0) return defaultVal;
    if (n >= 100) n = n / 1000; // User entered ms
    // Cap unreasonable values at 30 seconds max
    return Math.min(30, Math.max(0, n));
  }

  // Load saved settings
  chrome.storage.sync.get(STATE.settings, (stored) => {
    if (stored) {
      STATE.settings = {
        minDelay: cleanDelay(stored.minDelay, 0),
        maxDelay: cleanDelay(stored.maxDelay, 0),
        maxPosts: Math.max(0, parseInt(stored.maxPosts, 10) || 0),
        skipLiked: stored.skipLiked !== undefined ? stored.skipLiked : true,
        showHud: stored.showHud !== undefined ? stored.showHud : true
      };
      updateHudVisibility();
      updateSpeedPills();
      updateHudUi();
    }
  });

  // ==========================================
  // Floating HUD (On-Screen Controller)
  // ==========================================
  function createHud() {
    if (document.getElementById('ial-floating-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'ial-floating-hud';
    hud.innerHTML = `
      <div class="ial-header" id="ial-drag-header">
        <div class="ial-brand">
          <svg class="ial-brand-icon" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <span class="ial-brand-gradient">Auto Liker</span>
        </div>
        <div class="ial-header-actions">
          <button class="ial-btn-icon" id="ial-btn-toggle" title="Minimize / Expand">_</button>
        </div>
      </div>
      <div class="ial-body">
        <div class="ial-stats">
          <div>
            <div class="ial-stat-number" id="ial-stat-liked">0</div>
            <div class="ial-stat-title">Liked</div>
          </div>
          <div>
            <div class="ial-stat-number" id="ial-stat-skipped">0</div>
            <div class="ial-stat-title">Skipped</div>
          </div>
          <div>
            <div class="ial-stat-number" id="ial-stat-limit">50</div>
            <div class="ial-stat-title">Limit</div>
          </div>
        </div>

        <div class="ial-delay-row">
          <span class="ial-delay-label">Delay:</span>
          <div class="ial-delay-pills" id="ial-speed-pills">
            <button class="ial-pill-btn" data-delay="0">⚡ 0s (Instant)</button>
            <button class="ial-pill-btn" data-delay="1">1s</button>
            <button class="ial-pill-btn" data-delay="3">3s</button>
          </div>
        </div>

        <div class="ial-actions">
          <button class="ial-btn ial-btn-primary" id="ial-hud-start">
            <span>▶</span> Start Liking
          </button>
          <div class="ial-sub-actions">
            <button class="ial-btn ial-btn-secondary" id="ial-hud-pause" disabled>⏸ Pause</button>
            <button class="ial-btn ial-btn-danger" id="ial-hud-stop" disabled>⏹ Stop</button>
          </div>
        </div>
        <div class="ial-status-bar" id="ial-hud-status">
          <span class="ial-status-pulse"></span> Ready
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    // Minimize toggle
    const toggleBtn = hud.querySelector('#ial-btn-toggle');
    toggleBtn.addEventListener('click', () => {
      hud.classList.toggle('minimized');
      toggleBtn.textContent = hud.classList.contains('minimized') ? '□' : '_';
    });

    // Make HUD draggable
    makeDraggable(hud, hud.querySelector('#ial-drag-header'));

    // Speed pill buttons
    hud.querySelectorAll('#ial-speed-pills .ial-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sec = parseFloat(e.currentTarget.dataset.delay);
        STATE.settings.minDelay = sec;
        STATE.settings.maxDelay = sec === 0 ? 0 : sec + 1;
        chrome.storage.sync.set(STATE.settings);
        updateSpeedPills();
        notifyStatus(`Delay set to ${sec}s`);
      });
    });

    // HUD Button Events
    hud.querySelector('#ial-hud-start').addEventListener('click', () => {
      if (STATE.status === 'paused') {
        resumeLiking();
      } else {
        startLiking();
      }
    });
    hud.querySelector('#ial-hud-pause').addEventListener('click', () => pauseLiking());
    hud.querySelector('#ial-hud-stop').addEventListener('click', () => stopLiking());

    updateSpeedPills();
    updateHudUi();
  }

  function updateSpeedPills() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;
    const currentMin = STATE.settings.minDelay;
    hud.querySelectorAll('#ial-speed-pills .ial-pill-btn').forEach(btn => {
      const d = parseFloat(btn.dataset.delay);
      if (Math.abs(d - currentMin) < 0.5) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + 'px';
      el.style.left = (el.offsetLeft - pos1) + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function updateHudVisibility() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;
    if (STATE.settings.showHud) {
      hud.classList.remove('hidden');
    } else {
      hud.classList.add('hidden');
    }
  }

  function updateHudUi() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;

    hud.querySelector('#ial-stat-liked').textContent = STATE.likedCount;
    hud.querySelector('#ial-stat-skipped').textContent = STATE.skippedCount;
    hud.querySelector('#ial-stat-limit').textContent = STATE.settings.maxPosts > 0 ? STATE.settings.maxPosts : '∞';

    const btnStart = hud.querySelector('#ial-hud-start');
    const btnPause = hud.querySelector('#ial-hud-pause');
    const btnStop = hud.querySelector('#ial-hud-stop');
    const statusText = hud.querySelector('#ial-hud-status');

    if (STATE.status === 'running') {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnStop.disabled = false;
      statusText.innerHTML = `<span class="ial-status-pulse"></span> ${escapeHtml(STATE.message)}`;
    } else if (STATE.status === 'paused') {
      btnStart.disabled = false;
      btnStart.innerHTML = '<span>▶</span> Resume';
      btnPause.disabled = true;
      btnStop.disabled = false;
      statusText.innerHTML = `⏸ Paused`;
    } else {
      btnStart.disabled = false;
      btnStart.innerHTML = '<span>▶</span> Start Liking';
      btnPause.disabled = true;
      btnStop.disabled = true;
      statusText.innerHTML = `Ready`;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function notifyStatus(msg) {
    if (msg) STATE.message = msg;
    updateHudUi();
    try {
      chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        state: {
          status: STATE.status,
          likedCount: STATE.likedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        }
      });
    } catch (err) {
      // Popup might not be open
    }
  }

  // ==========================================
  // Helper Functions & Selectors
  // ==========================================
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function getRandomDelay(minSec, maxSec) {
    const min = cleanDelay(minSec, 0) * 1000;
    const max = Math.max(min, cleanDelay(maxSec, 0) * 1000);
    if (max <= 100) return 100; // 0s / Instant mode: 100ms
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  async function countdownDelay(ms) {
    if (ms <= 300) {
      await sleep(ms);
      return;
    }
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (isStopRequested || isPauseRequested) return;
      const remainingSec = ((ms - (Date.now() - start)) / 1000).toFixed(1);
      notifyStatus(`Waiting ${remainingSec}s...`);
      await sleep(200);
    }
  }

  // Check if an Action Block warning popup is visible
  function checkActionBlock() {
    const textElements = document.querySelectorAll('div[role="dialog"] h3, div[role="dialog"] span, div[role="dialog"] div');
    for (const el of textElements) {
      const txt = (el.textContent || '').toLowerCase();
      if (txt.includes('try again later') || txt.includes('action blocked') || txt.includes('compromised')) {
        return true;
      }
    }
    return false;
  }

  // Find the post modal / lightbox
  function getOpenModal() {
    return document.querySelector('div[role="dialog"] article, article[role="presentation"], div[role="dialog"]') ||
           (window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/') ? document.querySelector('article') : null);
  }

  // Wait adaptively for an element with timeout
  async function waitForCondition(conditionFn, maxWaitMs = 1500, pollIntervalMs = 100) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (isStopRequested || isPauseRequested) return null;
      const res = conditionFn();
      if (res) return res;
      await sleep(pollIntervalMs);
    }
    return conditionFn();
  }

  // Find Like button inside post modal
  function getLikeButtonInfo(modal) {
    const scope = modal || document;

    const likeLabels = ['like', 'me gusta', 'curtir', 'j’aime', "j'aime", 'gefällt mir'];
    const unlikeLabels = ['unlike', 'ya no me gusta', 'não curtir', 'descurtir', 'je n’aime plus', "je n'aime plus", 'gefällt mir nicht mehr'];

    const allSvgs = scope.querySelectorAll('svg');
    for (const svg of allSvgs) {
      const label = (svg.getAttribute('aria-label') || '').trim().toLowerCase();
      const parentBtn = svg.closest('button, [role="button"]') || svg;

      if (unlikeLabels.includes(label)) {
        return { isLiked: true, element: parentBtn };
      }
      if (likeLabels.includes(label)) {
        return { isLiked: false, element: parentBtn };
      }

      // Check SVG fill color for red heart (#ff3040 / rgb(255, 48, 64))
      const fill = svg.getAttribute('fill') || window.getComputedStyle(svg).fill;
      if (fill.includes('255, 48, 64') || fill.toLowerCase() === '#ff3040') {
        return { isLiked: true, element: parentBtn };
      }
    }

    // Fallback: Search section buttons with heart shape paths
    const buttons = scope.querySelectorAll('section button, div[role="dialog"] button');
    for (const btn of buttons) {
      const svg = btn.querySelector('svg');
      if (!svg) continue;
      const label = (svg.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('like')) {
        return { isLiked: label.includes('unlike'), element: btn };
      }
    }

    return null;
  }

  // Find Next button to advance to the next post
  function getNextButton(modal) {
    const scope = modal || document;

    const nextLabels = ['next', 'siguiente', 'avançar', 'suivant', 'weiter'];
    const nextSvgs = scope.querySelectorAll('svg');
    for (const svg of nextSvgs) {
      const label = (svg.getAttribute('aria-label') || '').trim().toLowerCase();
      if (nextLabels.includes(label)) {
        return svg.closest('button, [role="button"], a') || svg;
      }
    }

    const nextChevron = document.querySelector('svg[aria-label="Next"], [aria-label="Next"]');
    if (nextChevron) {
      return nextChevron.closest('button, [role="button"], a') || nextChevron;
    }

    return null;
  }

  function triggerNextNavigation() {
    const nextBtn = getNextButton(getOpenModal());
    if (nextBtn) {
      nextBtn.click();
      return true;
    }

    // Keyboard fallback: right arrow
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
    return true;
  }

  // Click the first post on the profile grid
  function openFirstPost() {
    if (getOpenModal() || window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/')) {
      return true;
    }

    const firstPostLink = document.querySelector('main a[href*="/p/"], main a[href*="/reel/"], article a[href*="/p/"], article a[href*="/reel/"]');
    if (firstPostLink) {
      firstPostLink.click();
      return true;
    }
    return false;
  }

  // ==========================================
  // Auto-Liker Loop
  // ==========================================
  async function runLikingLoop() {
    if (loopActive) return;
    loopActive = true;
    isStopRequested = false;
    isPauseRequested = false;
    STATE.status = 'running';

    notifyStatus('Starting auto-liker...');

    // 1. Open first post
    const opened = openFirstPost();
    if (!opened) {
      STATE.status = 'idle';
      loopActive = false;
      notifyStatus('No posts found. Open a profile first!');
      return;
    }

    // Wait adaptively for modal to render (max 1.5s)
    await waitForCondition(() => getOpenModal(), 1500, 100);

    let consecutiveUnchangedCount = 0;
    let lastUrl = window.location.href;

    while (!isStopRequested && !isPauseRequested) {
      // Check for action blocks
      if (checkActionBlock()) {
        STATE.status = 'paused';
        loopActive = false;
        notifyStatus('⚠️ Action Block detected! Pausing for safety.');
        alert('Insta Auto Liker: Instagram displayed an action block ("Try Again Later"). Pausing automatically to keep your account safe.');
        return;
      }

      // Check max limit
      if (STATE.settings.maxPosts > 0 && STATE.likedCount >= STATE.settings.maxPosts) {
        STATE.status = 'done';
        loopActive = false;
        notifyStatus(`🎉 Done! Reached target of ${STATE.likedCount} likes.`);
        return;
      }

      const modal = getOpenModal();
      if (!modal) {
        notifyStatus('Waiting for post...');
        await sleep(400);
        continue;
      }

      const likeInfo = getLikeButtonInfo(modal);

      if (likeInfo) {
        if (likeInfo.isLiked) {
          if (STATE.settings.skipLiked) {
            STATE.skippedCount++;
            notifyStatus(`Post already liked. Skipping...`);
          } else {
            notifyStatus(`Post is already liked.`);
          }
        } else {
          // Click Like
          likeInfo.element.click();
          STATE.likedCount++;
          notifyStatus(`Liked! (${STATE.likedCount}/${STATE.settings.maxPosts || '∞'})`);
        }
      } else {
        notifyStatus('Like button not found. Advancing...');
      }

      updateHudUi();

      if (isStopRequested || isPauseRequested) break;

      // Calculate delay
      const isInstant = (STATE.settings.minDelay === 0 && STATE.settings.maxDelay === 0);
      const delayMs = getRandomDelay(STATE.settings.minDelay, STATE.settings.maxDelay);

      // Only run countdown if delay is noticeable (> 300ms)
      if (!isInstant && delayMs > 300) {
        await countdownDelay(delayMs);
      } else {
        // Instant mode minimum debounce for Instagram React state
        await sleep(150);
      }

      if (isStopRequested || isPauseRequested) break;

      // Advance to next post
      lastUrl = window.location.href;
      triggerNextNavigation();

      // Wait adaptively for post transition (max 1s if instant, max 1.8s if normal)
      const maxNavWait = isInstant ? 800 : 1600;
      await waitForCondition(() => window.location.href !== lastUrl, maxNavWait, 80);

      // Check if URL changed
      if (window.location.href === lastUrl) {
        consecutiveUnchangedCount++;
        // Retry navigation once more
        triggerNextNavigation();
        await sleep(500);

        if (window.location.href === lastUrl && consecutiveUnchangedCount >= 2) {
          STATE.status = 'done';
          loopActive = false;
          notifyStatus(`✨ End of posts! Total liked: ${STATE.likedCount}`);
          return;
        }
      } else {
        consecutiveUnchangedCount = 0;
      }
    }

    loopActive = false;
    if (isStopRequested) {
      STATE.status = 'stopped';
      notifyStatus('Stopped by user.');
    } else if (isPauseRequested) {
      STATE.status = 'paused';
      notifyStatus('Paused. Click Resume when ready.');
    }
  }

  function startLiking(newSettings) {
    if (newSettings) {
      if (newSettings.minDelay !== undefined) STATE.settings.minDelay = cleanDelay(newSettings.minDelay, 0);
      if (newSettings.maxDelay !== undefined) STATE.settings.maxDelay = cleanDelay(newSettings.maxDelay, 0);
      if (newSettings.maxPosts !== undefined) STATE.settings.maxPosts = Math.max(0, parseInt(newSettings.maxPosts, 10) || 0);
      if (newSettings.skipLiked !== undefined) STATE.settings.skipLiked = newSettings.skipLiked;
      if (newSettings.showHud !== undefined) STATE.settings.showHud = newSettings.showHud;
      updateSpeedPills();
      updateHudUi();
    }
    isStopRequested = false;
    isPauseRequested = false;
    runLikingLoop();
  }

  function pauseLiking() {
    isPauseRequested = true;
    STATE.status = 'paused';
    notifyStatus('Pausing...');
  }

  function resumeLiking() {
    isPauseRequested = false;
    isStopRequested = false;
    STATE.status = 'running';
    runLikingLoop();
  }

  function stopLiking() {
    isStopRequested = true;
    isPauseRequested = false;
    STATE.status = 'stopped';
    notifyStatus('Stopped by user.');
  }

  // ==========================================
  // Message Listener for Popup
  // ==========================================
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    switch (req.action) {
      case 'getStatus':
        sendResponse({
          status: STATE.status,
          likedCount: STATE.likedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'start':
        startLiking(req.settings);
        sendResponse({
          status: STATE.status,
          likedCount: STATE.likedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'pause':
        pauseLiking();
        sendResponse({
          status: STATE.status,
          likedCount: STATE.likedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'stop':
        stopLiking();
        sendResponse({
          status: STATE.status,
          likedCount: STATE.likedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'updateSettings':
        if (req.settings) {
          if (req.settings.minDelay !== undefined) STATE.settings.minDelay = cleanDelay(req.settings.minDelay, 0);
          if (req.settings.maxDelay !== undefined) STATE.settings.maxDelay = cleanDelay(req.settings.maxDelay, 0);
          if (req.settings.maxPosts !== undefined) STATE.settings.maxPosts = Math.max(0, parseInt(req.settings.maxPosts, 10) || 0);
          if (req.settings.skipLiked !== undefined) STATE.settings.skipLiked = req.settings.skipLiked;
          if (req.settings.showHud !== undefined) STATE.settings.showHud = req.settings.showHud;
          updateHudVisibility();
          updateSpeedPills();
          updateHudUi();
        }
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // Inject Floating HUD when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createHud);
  } else {
    createHud();
  }
})();
