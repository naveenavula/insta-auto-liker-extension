// content.js - Instagram Profile Auto Liker & AI Commenter Engine (v1.1.0)

(() => {
  if (window.__INSTA_AUTO_BOT_INITIALIZED__) return;
  window.__INSTA_AUTO_BOT_INITIALIZED__ = true;

  const STATE = {
    status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'done'
    likedCount: 0,
    commentedCount: 0,
    skippedCount: 0,
    currentPostUrl: '',
    message: 'Ready. Open a profile to start.',
    settings: {
      mode: 'both', // 'both' | 'like' | 'comment'
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
    }
  };

  let isStopRequested = false;
  let isPauseRequested = false;
  let loopActive = false;

  function cleanDelay(val, defaultVal = 0) {
    let n = parseFloat(val);
    if (isNaN(n) || n < 0) return defaultVal;
    if (n >= 100) n = n / 1000;
    return Math.min(30, Math.max(0, n));
  }

  // Deduplication tracker: guarantees strictly 1 comment per post
  const commentedPostIds = new Set();

  try {
    chrome.storage.local.get({ ial_commented_posts: [] }, (res) => {
      if (res && Array.isArray(res.ial_commented_posts)) {
        res.ial_commented_posts.forEach(id => commentedPostIds.add(id));
      }
    });
  } catch (e) {}

  function saveCommentedPostId(id) {
    if (!id) return;
    commentedPostIds.add(id);
    try {
      chrome.storage.local.get({ ial_commented_posts: [] }, (res) => {
        const list = res.ial_commented_posts || [];
        if (!list.includes(id)) {
          list.push(id);
          if (list.length > 2000) list.shift();
          chrome.storage.local.set({ ial_commented_posts: list });
        }
      });
    } catch (e) {}
  }

  function getPostShortcode() {
    const match = window.location.pathname.match(/\/(p|reel)\/([a-zA-Z0-9_-]+)/);
    if (match) return match[2];
    const link = document.querySelector('div[role="dialog"] a[href*="/p/"], div[role="dialog"] a[href*="/reel/"]');
    if (link) {
      const m = (link.getAttribute('href') || '').match(/\/(p|reel)\/([a-zA-Z0-9_-]+)/);
      if (m) return m[2];
    }
    return window.location.pathname;
  }

  // Load saved settings
  chrome.storage.sync.get(STATE.settings, (stored) => {
    if (stored) {
      STATE.settings = Object.assign(STATE.settings, stored);
      STATE.settings.minDelay = cleanDelay(STATE.settings.minDelay, 0);
      STATE.settings.maxDelay = cleanDelay(STATE.settings.maxDelay, 0);
      updateHudVisibility();
      updateSpeedPills();
      updateModePills();
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
          <span class="ial-brand-gradient">Auto Bot</span>
          <span style="font-size: 10px; color: #888;">v1.1.2</span>
        </div>
        <div class="ial-header-actions">
          <button class="ial-btn-icon" id="ial-btn-toggle" title="Minimize / Expand">_</button>
        </div>
      </div>
      <div class="ial-body">
        <!-- Mode Switcher -->
        <div class="ial-mode-row" id="ial-mode-pills">
          <button class="ial-mode-btn" data-mode="both">❤️+💬 Both</button>
          <button class="ial-mode-btn" data-mode="like">❤️ Like</button>
          <button class="ial-mode-btn" data-mode="comment">💬 Comment</button>
        </div>

        <!-- 4-Stat Grid -->
        <div class="ial-stats">
          <div>
            <div class="ial-stat-number" id="ial-stat-liked">0</div>
            <div class="ial-stat-title">Liked</div>
          </div>
          <div>
            <div class="ial-stat-number" id="ial-stat-commented">0</div>
            <div class="ial-stat-title">Commented</div>
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

        <!-- Speed Selector -->
        <div class="ial-delay-row">
          <span class="ial-delay-label">Delay:</span>
          <div class="ial-delay-pills" id="ial-speed-pills">
            <button class="ial-pill-btn" data-delay="0">⚡ 0s</button>
            <button class="ial-pill-btn" data-delay="1">1s</button>
            <button class="ial-pill-btn" data-delay="3">3s</button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="ial-actions">
          <button class="ial-btn ial-btn-primary" id="ial-hud-start">
            <span>▶</span> <span id="ial-hud-start-text">Start Both</span>
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

    makeDraggable(hud, hud.querySelector('#ial-drag-header'));

    // Mode Pills on HUD
    hud.querySelectorAll('#ial-mode-pills .ial-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        STATE.settings.mode = e.currentTarget.dataset.mode;
        chrome.storage.sync.set({ mode: STATE.settings.mode });
        updateModePills();
        updateHudUi();
        notifyStatus(`Mode: ${STATE.settings.mode.toUpperCase()}`);
      });
    });

    // Speed Pills on HUD
    hud.querySelectorAll('#ial-speed-pills .ial-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sec = parseFloat(e.currentTarget.dataset.delay);
        STATE.settings.minDelay = sec;
        STATE.settings.maxDelay = sec === 0 ? 0 : sec + 1;
        chrome.storage.sync.set({ minDelay: STATE.settings.minDelay, maxDelay: STATE.settings.maxDelay });
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

    updateModePills();
    updateSpeedPills();
    updateHudUi();
  }

  function updateModePills() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;
    const mode = STATE.settings.mode || 'both';
    hud.querySelectorAll('#ial-mode-pills .ial-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const startText = hud.querySelector('#ial-hud-start-text');
    if (startText) {
      if (mode === 'like') startText.textContent = 'Start Liking';
      else if (mode === 'comment') startText.textContent = 'Start Commenting';
      else startText.textContent = 'Start Both';
    }
  }

  function updateSpeedPills() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;
    const currentMin = STATE.settings.minDelay;
    hud.querySelectorAll('#ial-speed-pills .ial-pill-btn').forEach(btn => {
      const d = parseFloat(btn.dataset.delay);
      btn.classList.toggle('active', Math.abs(d - currentMin) < 0.5);
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
    hud.classList.toggle('hidden', !STATE.settings.showHud);
  }

  function updateHudUi() {
    const hud = document.getElementById('ial-floating-hud');
    if (!hud) return;

    hud.querySelector('#ial-stat-liked').textContent = STATE.likedCount;
    hud.querySelector('#ial-stat-commented').textContent = STATE.commentedCount;
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
      hud.querySelector('#ial-hud-start-text').textContent = 'Resume';
      btnPause.disabled = true;
      btnStop.disabled = false;
      statusText.innerHTML = `⏸ Paused`;
    } else {
      btnStart.disabled = false;
      updateModePills();
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
          mode: STATE.settings.mode,
          likedCount: STATE.likedCount,
          commentedCount: STATE.commentedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        }
      });
    } catch (err) {}
  }

  // ==========================================
  // AI Comment Engine & Authentic Prompting
  // ==========================================

  // Extract post details: image URL, alt tags, and caption text
  function getPostContext(modal) {
    const scope = modal || document;

    // 1. High-res image
    const imgs = scope.querySelectorAll('article img, div[role="dialog"] img');
    let imageUrl = '';
    let altText = '';
    for (const img of imgs) {
      if (img.width > 200 || img.height > 200 || img.src.includes('scontent') || img.alt) {
        imageUrl = img.src;
        altText = img.alt || '';
        break;
      }
    }

    // 2. Caption text
    let caption = '';
    const captionEl = scope.querySelector('article ul li h1, article ul li span, div[role="dialog"] h1');
    if (captionEl) {
      caption = captionEl.textContent.trim().substring(0, 300);
    }

    return { imageUrl, altText, caption };
  }

  // Convert image URL to Base64 (if CORS permits)
  async function getBase64Image(imgUrl) {
    if (!imgUrl) return null;
    try {
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve({ base64, mimeType: blob.type || 'image/jpeg' });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  // Generate authentic human comment via AI or Smart Fallback
  async function generateAuthenticComment(postContext) {
    const { imageUrl, altText, caption } = postContext;
    const { aiProvider, aiApiKey, aiModel, aiEndpoint, commentTone } = STATE.settings;

    // Tone descriptions
    const tonePrompts = {
      casual: "casual, chill, authentic friend vibe. Natural phrasing, lowercase or minimal caps.",
      hype: "high-energy, hyped up, genuine excitement with fire/celebration emojis (🔥 🙌).",
      aesthetic: "appreciating the artistic aesthetic, colors, lighting, composition or mood.",
      short: "ultra short and sweet, 1 to 4 words max (e.g. 'unreal 🔥', 'love this so much', 'too clean')."
    };
    const toneGuide = tonePrompts[commentTone] || tonePrompts.casual;

    const systemPrompt = `You are a real human Instagram user scrolling your feed.
Write a single, authentic 1-line comment (or max 2 short lines) for this Instagram post based on the visual content and caption.

STRICT AUTHENTICITY RULES:
- Write naturally like a real person/friend, NOT an AI bot.
- FORBIDDEN phrases: "What a stunning capture", "Breathtaking view", "This image evokes", "Magnificent photograph", "As an AI".
- Keep it concise: between 3 to 10 words.
- Natural emoji use (1 or 2 emojis max like 🔥, 🙌, ✨, 🤩, 👏, 💯).
- Tone: ${toneGuide}
- Output ONLY the comment text. No quotation marks, no hashtags, no filler text.`;

    const userContent = `Post Details:
Image Description: ${altText || "Photo/Reel"}
Caption: ${caption || "No caption provided"}
Write the authentic comment:`;

    // 1. Google Gemini API
    if (aiProvider === 'gemini' && aiApiKey) {
      try {
        notifyStatus('Analyzing photo with Gemini AI...');
        const model = aiModel || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiApiKey}`;

        const parts = [{ text: `${systemPrompt}\n\n${userContent}` }];

        // Try getting image base64
        const imgData = await getBase64Image(imageUrl);
        if (imgData && imgData.base64) {
          parts.push({
            inline_data: {
              mime_type: imgData.mimeType,
              data: imgData.base64
            }
          });
        }

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.95,
              maxOutputTokens: 60
            }
          })
        });

        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return cleanAiOutput(text);
      } catch (err) {
        console.warn('Gemini API failed, falling back to smart engine:', err);
      }
    }

    // 2. OpenAI (ChatGPT) API
    if (aiProvider === 'openai' && aiApiKey) {
      try {
        notifyStatus('Analyzing photo with ChatGPT...');
        const model = aiModel || 'gpt-4o-mini';
        const messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userContent },
              ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }] : [])
            ]
          }
        ];

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiApiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 50,
            temperature: 0.95
          })
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return cleanAiOutput(text);
      } catch (err) {
        console.warn('OpenAI API failed, falling back to smart engine:', err);
      }
    }

    // 3. OpenRouter / Open-Source Vision Model
    if (aiProvider === 'openrouter' && aiApiKey) {
      try {
        notifyStatus('Analyzing with Open-Source AI...');
        const endpoint = aiEndpoint || 'https://openrouter.ai/api/v1/chat/completions';
        const model = aiModel || 'meta-llama/llama-3.2-11b-vision-instruct';

        const messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userContent },
              ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : [])
            ]
          }
        ];

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiApiKey}`
          },
          body: JSON.stringify({ model, messages, max_tokens: 50, temperature: 0.95 })
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return cleanAiOutput(text);
      } catch (err) {
        console.warn('OpenRouter API failed, falling back:', err);
      }
    }

    // 4. Smart Offline Context-Aware Fallback
    return getSmartOfflineComment(altText, caption, commentTone);
  }

  function cleanAiOutput(text) {
    return text.replace(/^["']|["']$/g, '').replace(/[\r\n]+/g, ' ').trim();
  }

  // Dynamic context-based authentic human comments
  function getSmartOfflineComment(altText = '', caption = '', tone = 'casual') {
    const text = `${altText} ${caption}`.toLowerCase();

    if (tone === 'short') {
      const shortPicks = ['unreal 🔥', 'pure vibes', 'too clean 🙌', 'love this ✨', 'so good!', 'perfection 💯', 'obsessed 😍'];
      return shortPicks[Math.floor(Math.random() * shortPicks.length)];
    }

    if (tone === 'hype') {
      const hypePicks = [
        'this goes insanely hard! 🔥',
        'nah this is crazy good 🙌',
        'leveling up every single post 🔥🔥',
        'energy in this is unmatched 💯',
        'absolutely killed this shot! 🚀'
      ];
      return hypePicks[Math.floor(Math.random() * hypePicks.length)];
    }

    if (tone === 'aesthetic') {
      const aestheticPicks = [
        'the color palette and lighting here are unreal ✨',
        'love the whole aesthetic of this shot',
        'composition on this is so satisfying',
        'the mood and tones here are top tier 📸',
        'the lighting in this is immaculate'
      ];
      return aestheticPicks[Math.floor(Math.random() * aestheticPicks.length)];
    }

    // Casual context-aware picks
    if (text.includes('sunset') || text.includes('sunrise') || text.includes('sky')) {
      const picks = ['that sky is unreal 🔥', 'golden hour hits different ✨', 'sunset vibes are unmatched here', 'the colors in the sky are crazy'];
      return picks[Math.floor(Math.random() * picks.length)];
    }
    if (text.includes('nature') || text.includes('mountain') || text.includes('beach') || text.includes('ocean')) {
      const picks = ['views are insane! need to visit here', 'this spot looks unreal 🙌', 'such a peaceful location', 'adding this place to my bucket list 🔥'];
      return picks[Math.floor(Math.random() * picks.length)];
    }
    if (text.includes('food') || text.includes('coffee') || text.includes('cafe')) {
      const picks = ['this looks ridiculously good 🤤', 'now i am definitely hungry haha', '10/10 presentation!', 'looks so delicious'];
      return picks[Math.floor(Math.random() * picks.length)];
    }
    if (text.includes('outfit') || text.includes('standing') || text.includes('person') || text.includes('style')) {
      const picks = ['the fit is looking great! 🔥', 'love the vibe on this 🙌', 'always bringing the best style 💯', 'looking sharp!'];
      return picks[Math.floor(Math.random() * picks.length)];
    }

    const defaultCasual = [
      'the vibes here are immaculate ✨',
      'love everything about this shot! 🙌',
      'the lighting here is so good 🔥',
      'always posting top tier content 💯',
      'love this aesthetic so much'
    ];
    return defaultCasual[Math.floor(Math.random() * defaultCasual.length)];
  }

  // Set value on React-controlled inputs/textareas by triggering the internal React _valueTracker
  function setReactInputValue(el, value) {
    if (!el) return;
    try {
      const isTextArea = el instanceof HTMLTextAreaElement || el.tagName === 'TEXTAREA';
      const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      if (el._valueTracker) {
        el._valueTracker.setValue(value);
      }
    } catch (e) {
      el.value = value;
    }

    // Dispatch rich event sequence to guarantee React state synchronization
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Automated posting of comment into Instagram post lightbox
  async function postCommentOnModal(modal, commentText) {
    const scope = modal || document;

    notifyStatus('Locating comment box...');

    // 1. Find comment input element (textarea or contenteditable)
    let inputEl = scope.querySelector('form textarea, textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], div[role="textbox"][contenteditable="true"], div[contenteditable="true"]');
    
    // If not in modal scope, search full document (Instagram sometimes portals sidebar comments)
    if (!inputEl) {
      inputEl = document.querySelector('div[role="dialog"] form textarea, form textarea, textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], div[role="textbox"][contenteditable="true"]');
    }

    // If still not visible, click the speech bubble / comment icon to open it
    if (!inputEl) {
      const commentSvg = (modal || document).querySelector('svg[aria-label="Comment"], svg[aria-label="Comentar"], svg[aria-label="Commenter"]');
      if (commentSvg) {
        const btn = commentSvg.closest('button, [role="button"]') || commentSvg;
        btn.click();
        await sleep(500);
        inputEl = (modal || document).querySelector('form textarea, textarea[placeholder*="comment" i], div[role="textbox"][contenteditable="true"]');
      }
    }

    if (!inputEl) {
      notifyStatus('⚠️ Comments disabled or comment box not found.');
      return false;
    }

    // 2. Focus and click to activate
    inputEl.focus();
    inputEl.click();
    await sleep(200);

    notifyStatus('Typing comment...');

    // 3. Insert the text using multiple techniques to guarantee React sync
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      // Clear first
      setReactInputValue(inputEl, '');
      await sleep(50);

      // Attempt native execCommand first (best for React cursor)
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, commentText);
      } catch (e) {}

      // Guarantee value set via prototype descriptor
      setReactInputValue(inputEl, commentText);

      // Simulate a small keypress to trigger any key-up validations
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    } else {
      // Contenteditable div
      inputEl.focus();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, commentText);
      } catch (e) {}
      inputEl.innerText = commentText;
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }

    await sleep(400);

    // 4. Find the Post button
    notifyStatus('Submitting comment...');
    const form = inputEl.closest('form') || inputEl.closest('div[role="presentation"]') || (modal || document);

    // Look for post button
    let postBtn = null;
    const candidates = form.querySelectorAll('button, div[role="button"], span[role="button"]');
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === 'post' || text === 'publicar' || text === 'publier' || text === 'posten' || el.getAttribute('type') === 'submit') {
        postBtn = el;
        break;
      }
    }

    // Wait up to 1500ms for Post button to become enabled/clickable
    let attempts = 0;
    while (attempts < 8) {
      if (postBtn) {
        const disabled = postBtn.disabled || 
                         postBtn.getAttribute('aria-disabled') === 'true' || 
                         postBtn.getAttribute('tabindex') === '-1' ||
                         window.getComputedStyle(postBtn).pointerEvents === 'none' ||
                         window.getComputedStyle(postBtn).opacity < 0.5;
        if (!disabled) {
          break; // Button is ready!
        }
      }
      await sleep(150);
      attempts++;
    }

    let submitted = false;

    // Method A: Click the Post button with realistic mouse events
    if (postBtn) {
      try {
        postBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        postBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        postBtn.click();
        submitted = true;
      } catch (e) {}
    }

    // Method B: Form submit
    const parentForm = inputEl.closest('form');
    if (parentForm) {
      try {
        if (typeof parentForm.requestSubmit === 'function') {
          parentForm.requestSubmit();
          submitted = true;
        } else {
          parentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          submitted = true;
        }
      } catch (e) {}
    }

    // Method C: Enter key on textarea
    ['keydown', 'keypress', 'keyup'].forEach(type => {
      inputEl.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    });

    // Wait for submission response
    await sleep(1200);

    // Verify if comment box was cleared or reset (indicates successful submission)
    const isCleared = (inputEl.value === '' || inputEl.innerText === '' || inputEl.value !== commentText);
    if (isCleared || submitted) {
      notifyStatus('Comment posted! ✅');
      return true;
    }

    return true;
  }

  // ==========================================
  // Helper Functions & Selectors
  // ==========================================
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function getRandomDelay(minSec, maxSec) {
    const min = cleanDelay(minSec, 0) * 1000;
    const max = Math.max(min, cleanDelay(maxSec, 0) * 1000);
    if (max <= 100) return 100;
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

  function getOpenModal() {
    return document.querySelector('div[role="dialog"] article, article[role="presentation"], div[role="dialog"]') ||
           (window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/') ? document.querySelector('article') : null);
  }

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

      const fill = svg.getAttribute('fill') || window.getComputedStyle(svg).fill;
      if (fill.includes('255, 48, 64') || fill.toLowerCase() === '#ff3040') {
        return { isLiked: true, element: parentBtn };
      }
    }

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
  // Main Automation Loop (Like & Comment)
  // ==========================================
  async function runLikingLoop() {
    if (loopActive) return;
    loopActive = true;
    isStopRequested = false;
    isPauseRequested = false;
    STATE.status = 'running';

    const mode = STATE.settings.mode || 'both';
    notifyStatus(`Starting in ${mode.toUpperCase()} mode...`);

    const opened = openFirstPost();
    if (!opened) {
      STATE.status = 'idle';
      loopActive = false;
      notifyStatus('No posts found. Open a profile first!');
      return;
    }

    await waitForCondition(() => getOpenModal(), 1500, 100);

    let consecutiveUnchangedCount = 0;
    let lastUrl = window.location.href;

    while (!isStopRequested && !isPauseRequested) {
      if (checkActionBlock()) {
        STATE.status = 'paused';
        loopActive = false;
        notifyStatus('⚠️ Action Block detected! Pausing for safety.');
        alert('Instagram displayed an action block ("Try Again Later"). Pausing automatically to keep your account safe.');
        return;
      }

      // Check max limit
      const currentProcessed = Math.max(STATE.likedCount, STATE.commentedCount);
      if (STATE.settings.maxPosts > 0 && currentProcessed >= STATE.settings.maxPosts) {
        STATE.status = 'done';
        loopActive = false;
        notifyStatus(`🎉 Finished target of ${currentProcessed} posts!`);
        return;
      }

      const modal = getOpenModal();
      if (!modal) {
        notifyStatus('Waiting for post...');
        await sleep(350);
        continue;
      }

      // 1. LIKE ACTION (if mode is 'like' or 'both')
      if (mode === 'like' || mode === 'both') {
        const likeInfo = getLikeButtonInfo(modal);
        if (likeInfo) {
          if (likeInfo.isLiked) {
            if (STATE.settings.skipLiked) {
              STATE.skippedCount++;
              notifyStatus(`Already liked. Skipping...`);
            } else {
              notifyStatus(`Post already liked.`);
            }
          } else {
            likeInfo.element.click();
            STATE.likedCount++;
            notifyStatus(`Liked! (${STATE.likedCount}/${STATE.settings.maxPosts || '∞'})`);
          }
        }
      }

      // 2. COMMENT ACTION (if mode is 'comment' or 'both')
      if ((mode === 'comment' || mode === 'both') && !isStopRequested && !isPauseRequested) {
        const currentPostId = getPostShortcode();

        if (commentedPostIds.has(currentPostId)) {
          notifyStatus('1-comment limit: already commented. Skipping...');
        } else {
          const postCtx = getPostContext(modal);
          notifyStatus('Generating authentic AI comment...');
          const comment = await generateAuthenticComment(postCtx);

          if (comment) {
            notifyStatus(`Posting: "${comment.substring(0, 25)}..."`);
            const posted = await postCommentOnModal(modal, comment);
            if (posted) {
              commentedPostIds.add(currentPostId);
              saveCommentedPostId(currentPostId);
              STATE.commentedCount++;
              notifyStatus(`Commented! (${STATE.commentedCount})`);
            }
          }
        }
      }

      updateHudUi();

      if (isStopRequested || isPauseRequested) break;

      // 3. DELAY
      const isInstant = (STATE.settings.minDelay === 0 && STATE.settings.maxDelay === 0);
      const delayMs = getRandomDelay(STATE.settings.minDelay, STATE.settings.maxDelay);

      if (!isInstant && delayMs > 300) {
        await countdownDelay(delayMs);
      } else {
        await sleep(150);
      }

      if (isStopRequested || isPauseRequested) break;

      // 4. NAVIGATE TO NEXT POST
      lastUrl = window.location.href;
      triggerNextNavigation();

      const maxNavWait = isInstant ? 800 : 1600;
      await waitForCondition(() => window.location.href !== lastUrl, maxNavWait, 80);

      if (window.location.href === lastUrl) {
        consecutiveUnchangedCount++;
        triggerNextNavigation();
        await sleep(500);

        if (window.location.href === lastUrl && consecutiveUnchangedCount >= 2) {
          STATE.status = 'done';
          loopActive = false;
          notifyStatus(`✨ End of posts! Liked: ${STATE.likedCount}, Commented: ${STATE.commentedCount}`);
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
      STATE.settings = Object.assign(STATE.settings, newSettings);
      updateSpeedPills();
      updateModePills();
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
    notifyStatus('Stopping...');
  }

  // ==========================================
  // Message Listener for Popup
  // ==========================================
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    switch (req.action) {
      case 'getStatus':
        sendResponse({
          status: STATE.status,
          mode: STATE.settings.mode,
          likedCount: STATE.likedCount,
          commentedCount: STATE.commentedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'start':
        startLiking(req.settings);
        sendResponse({
          status: STATE.status,
          mode: STATE.settings.mode,
          likedCount: STATE.likedCount,
          commentedCount: STATE.commentedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'pause':
        pauseLiking();
        sendResponse({
          status: STATE.status,
          mode: STATE.settings.mode,
          likedCount: STATE.likedCount,
          commentedCount: STATE.commentedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'stop':
        stopLiking();
        sendResponse({
          status: STATE.status,
          mode: STATE.settings.mode,
          likedCount: STATE.likedCount,
          commentedCount: STATE.commentedCount,
          skippedCount: STATE.skippedCount,
          message: STATE.message
        });
        break;

      case 'updateSettings':
        if (req.settings) {
          STATE.settings = Object.assign(STATE.settings, req.settings);
          updateHudVisibility();
          updateSpeedPills();
          updateModePills();
          updateHudUi();
        }
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createHud);
  } else {
    createHud();
  }
})();
