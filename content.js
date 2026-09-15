// ============================================================
// Insta Auto Liker & Commenter v1.3.0 - content.js
// Complete Robust Engine: Auto-Like, Auto-Comment, Like+Comment,
// Generate & Manual Post, Profile Traversal, Multi-Language Support
// ============================================================
(function () {
  'use strict';

  if (window.__instaAutoEngineLoaded) return;
  window.__instaAutoEngineLoaded = true;

  const STATE = {
    running: false,
    paused: false,
    mode: 'like',
    liked: 0,
    commented: 0,
    skipped: 0,
    currentStatus: 'Ready',
    delayMs: 1500,
    manualWaiting: false,
  };

  let likedPostIds = new Set();
  let commentedPostIds = new Set();
  let usedCommentTexts = [];

  let aiConfig = {
    provider: 'offline',
    apiKey: '',
    model: '',
  };

  async function loadStorage() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['likedPostIds', 'commentedPostIds', 'usedCommentTexts', 'aiProvider', 'aiKey', 'aiModel', 'delayMs', 'mode'],
        r => {
          if (r.likedPostIds) likedPostIds = new Set(r.likedPostIds);
          if (r.commentedPostIds) commentedPostIds = new Set(r.commentedPostIds);
          if (r.usedCommentTexts) usedCommentTexts = r.usedCommentTexts;
          if (r.aiProvider) aiConfig.provider = r.aiProvider;
          if (r.aiKey) aiConfig.apiKey = r.aiKey;
          if (r.aiModel) aiConfig.model = r.aiModel;
          if (typeof r.delayMs === 'number') STATE.delayMs = r.delayMs;
          if (r.mode) STATE.mode = r.mode;
          resolve();
        }
      );
    });
  }

  function saveStorage() {
    chrome.storage.local.set({
      likedPostIds: Array.from(likedPostIds),
      commentedPostIds: Array.from(commentedPostIds),
      usedCommentTexts: usedCommentTexts.slice(-50),
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  function getPostId() {
    const match = window.location.href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match) return match[2];

    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      const a = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (a) {
        const m = (a.getAttribute('href') || '').match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return m[2];
      }
    }
    return null;
  }

  function isPostOpen() {
    return !!(
      document.querySelector('div[role="dialog"]') ||
      document.querySelector('article[role="presentation"]') ||
      /\/(p|reel|tv)\//.test(window.location.pathname)
    );
  }

  let hudEl = null;
  let hudStatus, hudLiked, hudCommented, hudSkipped, hudManualBox, hudCommentPreview;

  function createOrShowHud() {
    if (document.getElementById('ial-hud-widget')) {
      document.getElementById('ial-hud-widget').style.display = 'block';
      return;
    }

    hudEl = document.createElement('div');
    hudEl.id = 'ial-hud-widget';
    hudEl.innerHTML = `
      <div id="ial-hud-header">
        <div id="ial-hud-title">
          <span style="color:#e1306c;font-weight:bold;">⚡ InstaBot</span>
          <span style="font-size:10px;opacity:0.7;">v1.3</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="ial-hud-min" title="Minimize" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:14px;padding:0 3px;">−</button>
          <button id="ial-hud-close" title="Close HUD" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:14px;padding:0 3px;">✕</button>
        </div>
      </div>
      <div id="ial-hud-body">
        <div id="ial-hud-status-row">
          <span id="ial-hud-dot" class="ial-dot ial-dot-idle"></span>
          <span id="ial-hud-status-text">Ready</span>
        </div>
        <div id="ial-hud-stats">
          <div class="ial-hud-stat"><b id="ial-hud-liked">0</b><small>Liked</small></div>
          <div class="ial-hud-stat"><b id="ial-hud-commented">0</b><small>Commented</small></div>
          <div class="ial-hud-stat"><b id="ial-hud-skipped">0</b><small>Skipped</small></div>
        </div>
        <div id="ial-manual-box" style="display:none;">
          <div style="font-size:10px;color:#bbb;margin-bottom:4px;font-weight:600;">💬 Generated Comment:</div>
          <div id="ial-comment-preview" style="background:#181818;border:1px solid #333;border-radius:6px;padding:6px;font-size:11px;color:#eee;max-height:60px;overflow-y:auto;word-break:break-word;margin-bottom:6px;"></div>
          <div style="display:flex;gap:4px;">
            <button id="ial-btn-copy" style="flex:1;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#fff;padding:4px;cursor:pointer;font-size:10px;">📋 Copy</button>
            <button id="ial-btn-submit-manual" style="flex:1;background:#e1306c;border:none;border-radius:4px;color:#fff;padding:4px;cursor:pointer;font-size:10px;font-weight:bold;">🚀 Post Now</button>
            <button id="ial-btn-next-manual" style="flex:1;background:#1a3a1a;border:1px solid #2e7d32;border-radius:4px;color:#4caf50;padding:4px;cursor:pointer;font-size:10px;font-weight:bold;">⏭ Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(hudEl);

    hudStatus = document.getElementById('ial-hud-status-text');
    hudLiked = document.getElementById('ial-hud-liked');
    hudCommented = document.getElementById('ial-hud-commented');
    hudSkipped = document.getElementById('ial-hud-skipped');
    hudManualBox = document.getElementById('ial-manual-box');
    hudCommentPreview = document.getElementById('ial-comment-preview');

    document.getElementById('ial-hud-close').addEventListener('click', () => {
      hudEl.style.display = 'none';
    });

    let minimized = false;
    document.getElementById('ial-hud-min').addEventListener('click', () => {
      minimized = !minimized;
      document.getElementById('ial-hud-body').style.display = minimized ? 'none' : 'block';
      document.getElementById('ial-hud-min').textContent = minimized ? '+' : '−';
    });

    document.getElementById('ial-btn-copy').addEventListener('click', () => {
      const text = hudCommentPreview.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('ial-btn-copy');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
      });
    });

    document.getElementById('ial-btn-submit-manual').addEventListener('click', async () => {
      updateStatus('Submitting comment...', 'running');
      await submitCommentForm();
      STATE.commented++;
      const currentId = getPostId();
      if (currentId) commentedPostIds.add(currentId);
      saveStorage();
      updateHudNumbers();
      updateStatus('✅ Comment submitted! Click Next to advance.', 'running');
    });

    document.getElementById('ial-btn-next-manual').addEventListener('click', () => {
      STATE.manualWaiting = false;
    });

    makeDraggable(hudEl, document.getElementById('ial-hud-header'));
    updateHudNumbers();
  }

  function makeDraggable(el, handle) {
    let startX = 0, startY = 0, initialX = 0, initialY = 0;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      function onMouseMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        el.style.left = (initialX + dx) + 'px';
        el.style.top = (initialY + dy) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function updateStatus(msg, type = 'running') {
    STATE.currentStatus = msg;
    if (hudStatus) hudStatus.textContent = msg;
    const dot = document.getElementById('ial-hud-dot');
    if (dot) dot.className = 'ial-dot ial-dot-' + type;
  }

  function updateHudNumbers() {
    if (hudLiked) hudLiked.textContent = STATE.liked;
    if (hudCommented) hudCommented.textContent = STATE.commented;
    if (hudSkipped) hudSkipped.textContent = STATE.skipped;
  }

  function showManualComment(commentText) {
    if (!hudManualBox || !hudCommentPreview) return;
    hudCommentPreview.textContent = commentText;
    hudManualBox.style.display = 'block';
  }

  function hideManualComment() {
    if (!hudManualBox) return;
    hudManualBox.style.display = 'none';
  }

  async function openFirstPostIfOnProfile() {
    if (isPostOpen()) return true;

    updateStatus('Finding first post on profile...', 'running');
    const postLinks = Array.from(document.querySelectorAll('main article a[href*="/p/"], main a[href*="/p/"], main a[href*="/reel/"], a[href*="/p/"]'));
    if (postLinks.length > 0) {
      updateStatus('Opening first post...', 'running');
      postLinks[0].click();
      for (let i = 0; i < 20; i++) {
        await sleep(200);
        if (isPostOpen()) {
          await sleep(600);
          return true;
        }
      }
    }
    return false;
  }

  const LIKE_LABELS = ['like', 'me gusta', 'curtir', 'j’aime', "j'aime", 'gefällt mir', 'mi piace', '좋아요', 'いいね！'];
  const UNLIKE_LABELS = ['unlike', 'ya no me gusta', 'não curtir', 'descurtir', 'je n’aime plus', "je n'aime plus", 'gefällt mir nicht mehr', 'non mi piace', '좋아요 취소', 'いいね！を取り消す'];

  function findLikeButtonElement() {
    const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document;

    const svgs = scope.querySelectorAll('svg');
    for (const svg of svgs) {
      const label = (svg.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!label) continue;

      if (UNLIKE_LABELS.some(ul => label.includes(ul))) {
        const btn = svg.closest('button, [role="button"], a') || svg;
        return { element: btn, isLiked: true };
      }
      if (LIKE_LABELS.some(l => label === l || label.includes(l))) {
        const btn = svg.closest('button, [role="button"], a') || svg;
        return { element: btn, isLiked: false };
      }
    }

    const buttons = scope.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
      if (UNLIKE_LABELS.some(ul => label.includes(ul))) {
        return { element: btn, isLiked: true };
      }
      if (LIKE_LABELS.some(l => label === l || label.includes(l))) {
        return { element: btn, isLiked: false };
      }
    }

    const sections = scope.querySelectorAll('section');
    for (const sec of sections) {
      const secBtns = sec.querySelectorAll('button, [role="button"]');
      if (secBtns.length >= 2) {
        const firstBtn = secBtns[0];
        const svg = firstBtn.querySelector('svg');
        if (svg) {
          const fill = (svg.getAttribute('fill') || window.getComputedStyle(svg).fill || '').toLowerCase();
          const isLiked = fill.includes('255, 48, 64') || fill.includes('#ff3040') || fill.includes('red') || (svg.getAttribute('aria-label') || '').toLowerCase().includes('unlike');
          return { element: firstBtn, isLiked };
        }
      }
    }

    const paths = scope.querySelectorAll('svg path');
    for (const path of paths) {
      const d = path.getAttribute('d') || '';
      if (d.includes('16.792') || d.includes('34.6') || d.includes('21.35') || d.includes('M12 21')) {
        const btn = path.closest('button, [role="button"]') || path.closest('svg');
        const svg = path.closest('svg');
        const fill = (svg ? svg.getAttribute('fill') || window.getComputedStyle(svg).fill : '').toLowerCase();
        const isLiked = fill.includes('255, 48, 64') || fill.includes('#ff3040');
        if (btn) return { element: btn, isLiked };
      }
    }

    return null;
  }

  async function performLike() {
    const info = findLikeButtonElement();

    if (info) {
      if (info.isLiked) {
        updateStatus('Already liked! ❤️', 'running');
        return true;
      }

      try {
        info.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await sleep(150);
        info.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        info.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        info.element.click();
        await sleep(400);

        const after = findLikeButtonElement();
        if (after && after.isLiked) return true;
      } catch (e) {
        console.warn('[IAL] Like click error:', e);
      }
    }

    updateStatus('Double-clicking image to like...', 'running');
    const mediaContainer = document.querySelector('div[role="dialog"] article div[role="button"], article div[role="button"], div[role="dialog"] img, article img');
    if (mediaContainer) {
      try {
        const rect = mediaContainer.getBoundingClientRect();
        const evtInit = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        mediaContainer.dispatchEvent(new MouseEvent('dblclick', evtInit));
        await sleep(500);
        return true;
      } catch (e) {
        console.warn('[IAL] Double-click error:', e);
      }
    }

    return false;
  }

  function findCommentInput() {
    const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document;

    const ta = scope.querySelector('form textarea, textarea');
    if (ta && ta.offsetParent !== null) return { el: ta, isTextarea: true };

    const ce = scope.querySelector('div[contenteditable="true"][role="textbox"], div[contenteditable="true"]');
    if (ce && ce.offsetParent !== null) return { el: ce, isTextarea: false };

    return null;
  }

  async function ensureCommentBoxOpen() {
    let input = findCommentInput();
    if (input) return input;

    const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document;
    const commentIcons = scope.querySelectorAll('svg[aria-label*="Comment" i], svg[aria-label*="Comentar" i], svg[aria-label*="Commenter" i]');
    for (const icon of commentIcons) {
      const btn = icon.closest('button, [role="button"]') || icon;
      btn.click();
      await sleep(500);
      break;
    }

    const placeholder = scope.querySelector('span[class*="placeholder" i]');
    if (placeholder) {
      placeholder.click();
      await sleep(400);
    }

    return findCommentInput();
  }

  function setReactInputValue(el, text) {
    el.focus();

    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, text);
    } catch (e) {}

    try {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, text);
      } else {
        el.value = text;
      }
      if (el._valueTracker) {
        el._valueTracker.setValue('');
      }
    } catch (e) {}

    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function typeComment(text) {
    const inputObj = await ensureCommentBoxOpen();
    if (!inputObj) {
      updateStatus('⚠️ Comment box not found', 'running');
      return false;
    }

    const { el, isTextarea } = inputObj;
    el.focus();
    el.click();
    await sleep(200);

    if (isTextarea) {
      setReactInputValue(el, text);
    } else {
      el.focus();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } catch (e) {}
      el.innerText = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }

    await sleep(400);
    return true;
  }

  async function submitCommentForm() {
    const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document;
    const inputObj = findCommentInput();

    const candidates = Array.from(scope.querySelectorAll('button, div[role="button"], span[role="button"]'));
    const postLabels = ['post', 'publicar', 'publier', 'posten', 'invia', '댓글 달기'];

    for (const btn of candidates) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const type = (btn.getAttribute('type') || '').toLowerCase();
      if ((postLabels.includes(txt) || type === 'submit') && !btn.disabled && btn.offsetParent !== null) {
        btn.click();
        await sleep(800);
        return true;
      }
    }

    if (inputObj && inputObj.el) {
      const el = inputObj.el;
      const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      el.dispatchEvent(enterDown);
      el.dispatchEvent(enterUp);
      await sleep(800);
    }

    const form = inputObj?.el?.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await sleep(600);
    }

    return true;
  }

  function findNextChevronButton() {
    const labels = ['next', 'siguiente', 'avançar', 'suivant', 'weiter', 'avanti', '다음'];

    const svgs = document.querySelectorAll('svg');
    for (const svg of svgs) {
      const label = (svg.getAttribute('aria-label') || '').trim().toLowerCase();
      const title = (svg.querySelector('title')?.textContent || '').trim().toLowerCase();
      if (labels.some(l => label === l || label.includes(l) || title === l || title.includes(l))) {
        return svg.closest('button, [role="button"], a') || svg;
      }
    }

    const btn = document.querySelector('button[aria-label*="Next" i], [aria-label*="Next" i], a[aria-label*="Next" i]');
    if (btn) return btn;

    return null;
  }

  async function advanceToNextPost() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      try { document.activeElement.blur(); } catch (e) {}
    }
    if (document.body) document.body.focus();
    await sleep(200);

    const oldUrl = window.location.href;
    const oldId = getPostId();

    const nextBtn = findNextChevronButton();
    if (nextBtn) {
      try {
        nextBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        nextBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        nextBtn.click();
      } catch (e) {}
    }

    const arrowEvt = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', arrowEvt));
    window.dispatchEvent(new KeyboardEvent('keydown', arrowEvt));
    if (document.body) document.body.dispatchEvent(new KeyboardEvent('keydown', arrowEvt));

    for (let i = 0; i < 12; i++) {
      await sleep(150);
      if (window.location.href !== oldUrl || (getPostId() && getPostId() !== oldId)) {
        return true;
      }
    }

    updateStatus('Finding next post in grid...', 'running');
    const allLinks = Array.from(document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]'));
    for (const a of allLinks) {
      const match = (a.getAttribute('href') || '').match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      if (match) {
        const id = match[2];
        if (!likedPostIds.has(id) && !commentedPostIds.has(id)) {
          const closeBtn = document.querySelector('svg[aria-label="Close" i], svg[aria-label="Fechar" i], svg[aria-label="Cerrar" i]');
          if (closeBtn) {
            (closeBtn.closest('button, [role="button"]') || closeBtn).click();
            await sleep(400);
          }
          a.scrollIntoView({ block: 'center' });
          a.click();
          await sleep(1200);
          return true;
        }
      }
    }

    return false;
  }

  const AUTHENTIC_COMMENTS = [
    "pure vibes honestly ✨", "this is so well captured", "love the energy in this 🔥",
    "such an incredible shot 🙌", "the lighting here is top tier", "unreal perspective honestly",
    "the colors in this are amazing 🎨", "clean and effortless ✨", "this goes so hard! 🔥",
    "honestly obsessed with this", "the vibe here is immaculate 💯", "needed this on my feed today",
    "so good! keep creating 👏", "absolutely beautiful shot", "top tier content as always 🔥",
    "everything about this works 🙌", "such a mood honestly", "the composition here is so clean",
    "this brought a genuine smile 😊", "effortless style 💯", "this deserves all the love ✨",
    "so inspiring honestly", "the details here are unreal 📸", "pure aesthetic perfection",
    "can't stop looking at this 😍", "this hits so different 🔥", "never miss with these posts 👏",
    "such a peaceful vibe 🌿", "golden hour perfection ✨", "this looks so good honestly",
    "such great energy right here", "masterpiece in a single frame 🎨", "vibes are unmatched 💯",
    "so well done! 👏", "the aesthetic is everything ✨", "this is straight heat 🔥",
    "loving every bit of this 🙌", "so clean and vibrant", "simply breathtaking 📸",
    "this is top notch 💯", "always bringing the best vibes ✨", "such a gorgeous capture",
    "leveling up every post 🔥", "this is genuinely amazing", "so pleasing to look at ✨",
    "pure artistic talent 🎨", "the atmosphere here is unreal", "too clean with it 🙌",
    "love the realness of this 💯", "stunning as always ✨", "this photo is a whole vibe",
    "brilliant shot 📸", "the tones on this are beautiful", "such a wholesome moment 🥰",
    "you killed this shot! 🔥", "unbelievably good 👏", "this makes me so happy 😊",
    "aesthetic on point as always ✨", "perfection from every angle 💯", "so creative and clean"
  ];

  function getUniqueOfflineComment() {
    const available = AUTHENTIC_COMMENTS.filter(c => !usedCommentTexts.includes(c));
    const pool = available.length > 0 ? available : AUTHENTIC_COMMENTS;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    usedCommentTexts.push(chosen);
    saveStorage();
    return chosen;
  }

  async function generateAIComment(context) {
    const recent = usedCommentTexts.slice(-15);
    const negativeRule = recent.length > 0
      ? `\nDO NOT use or rephrase any of these recent comments:\n${recent.map(c => `- ${c}`).join('\n')}`
      : '';

    const prompt = `Write ONE short, casual, authentic Instagram comment (1-2 lines max) for this post.
Rules:
- Speak like a real human, genuine and friendly
- 1 emoji max or no emojis
- No generic AI clichés (no "stunning capture!", no "masterpiece!", no hashtags)
- Casual lowercase is great
- Max 12 words${negativeRule}

Post context: ${context}`;

    if (aiConfig.apiKey && aiConfig.provider === 'gemini') {
      const model = aiConfig.model || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.1, maxOutputTokens: 50 },
        }),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text.replace(/^["']|["']$/g, '');
    } else if (aiConfig.apiKey && aiConfig.provider === 'openai') {
      const model = aiConfig.model || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 1.1,
          max_tokens: 50,
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text.replace(/^["']|["']$/g, '');
    } else if (aiConfig.apiKey && aiConfig.provider === 'openrouter') {
      const model = aiConfig.model || 'meta-llama/llama-3.1-8b-instruct:free';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 1.1,
          max_tokens: 50,
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text.replace(/^["']|["']$/g, '');
    }

    return getUniqueOfflineComment();
  }

  async function getCommentForCurrentPost() {
    const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document;
    const altTexts = Array.from(scope.querySelectorAll('img[alt]'))
      .map(i => i.alt)
      .filter(a => a && a.length > 5 && !a.toLowerCase().includes('profile picture'))
      .slice(0, 2)
      .join(', ');

    const captionEl = scope.querySelector('h1, [class*="caption"], article span');
    const caption = captionEl ? captionEl.textContent.slice(0, 100) : '';
    const context = [altTexts, caption].filter(Boolean).join(' - ') || 'an aesthetic Instagram post';

    let comment = null;
    try {
      comment = await generateAIComment(context);
    } catch (e) {
      console.warn('[IAL] AI generate fallback:', e);
      comment = getUniqueOfflineComment();
    }

    usedCommentTexts.push(comment);
    saveStorage();
    return comment;
  }

  async function runMainLoop() {
    await loadStorage();
    createOrShowHud();
    updateStatus('Starting automation...', 'running');

    if (!isPostOpen()) {
      const opened = await openFirstPostIfOnProfile();
      if (!opened) {
        updateStatus('⚠️ Please open an Instagram post or profile', 'idle');
        STATE.running = false;
        return;
      }
    }

    let consecutiveErrors = 0;

    while (STATE.running) {
      if (STATE.paused) {
        updateStatus('Paused ⏸', 'paused');
        await sleep(800);
        continue;
      }

      const postId = getPostId();
      updateStatus(`Post ${postId ? '#' + postId : 'processing...'}`, 'running');
      await sleep(400);

      if (STATE.mode === 'like' || STATE.mode === 'both') {
        if (postId && likedPostIds.has(postId)) {
          updateStatus('Already liked, skipping like', 'running');
        } else {
          updateStatus('Liking post ❤️...', 'running');
          const liked = await performLike();
          if (liked) {
            STATE.liked++;
            if (postId) likedPostIds.add(postId);
            saveStorage();
            updateHudNumbers();
            updateStatus('✅ Liked!', 'running');
          } else {
            STATE.skipped++;
            updateHudNumbers();
            updateStatus('⚠️ Could not like post', 'running');
          }
        }
        await sleep(300);
      }

      if (STATE.mode === 'comment' || STATE.mode === 'both') {
        if (postId && commentedPostIds.has(postId)) {
          updateStatus('Already commented, skipping comment', 'running');
        } else {
          updateStatus('Generating unique comment...', 'running');
          const comment = await getCommentForCurrentPost();
          updateStatus(`Commenting: "${comment}"`, 'running');
          const typed = await typeComment(comment);
          if (typed) {
            await sleep(600);
            await submitCommentForm();
            STATE.commented++;
            if (postId) commentedPostIds.add(postId);
            saveStorage();
            updateHudNumbers();
            updateStatus('✅ Commented!', 'running');
          } else {
            STATE.skipped++;
            updateHudNumbers();
            updateStatus('⚠️ Could not comment', 'running');
          }
        }
        await sleep(400);
      }

      if (STATE.mode === 'manual_comment') {
        updateStatus('Generating comment for manual post...', 'running');
        const comment = await getCommentForCurrentPost();
        await typeComment(comment);
        showManualComment(comment);
        updateStatus('💬 Comment typed! Review & post, or click Next', 'running');

        STATE.manualWaiting = true;
        const waitStart = Date.now();
        while (STATE.manualWaiting && STATE.running && !STATE.paused) {
          await sleep(400);
          if (Date.now() - waitStart > 45000) break;
        }
        hideManualComment();
      }

      consecutiveErrors = 0;

      if (STATE.delayMs > 0 && STATE.mode !== 'manual_comment') {
        updateStatus(`Waiting ${(STATE.delayMs / 1000).toFixed(1)}s...`, 'running');
        await sleep(STATE.delayMs);
      }

      if (!STATE.running) break;

      updateStatus('Advancing to next post ⏭...', 'running');
      const advanced = await advanceToNextPost();
      await sleep(1000);

      if (!advanced) {
        consecutiveErrors++;
        updateStatus(`Waiting for next post (${consecutiveErrors}/4)...`, 'running');
        if (consecutiveErrors >= 4) {
          updateStatus('✨ End of posts reached or navigation stopped', 'idle');
          STATE.running = false;
          break;
        }
      }
    }

    updateStatus('Finished / Stopped', 'idle');
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'ping':
        sendResponse({ ok: true });
        break;

      case 'start':
        STATE.running = true;
        STATE.paused = false;
        STATE.mode = msg.mode || 'like';
        STATE.delayMs = typeof msg.delayMs === 'number' ? msg.delayMs : 1500;
        STATE.liked = 0;
        STATE.commented = 0;
        STATE.skipped = 0;
        runMainLoop().catch(e => {
          console.error('[IAL] Engine error:', e);
          STATE.running = false;
          updateStatus('Error: ' + e.message, 'idle');
        });
        sendResponse({ ok: true });
        break;

      case 'pause':
        STATE.paused = !STATE.paused;
        sendResponse({ paused: STATE.paused });
        break;

      case 'stop':
        STATE.running = false;
        STATE.paused = false;
        STATE.manualWaiting = false;
        updateStatus('Stopped', 'idle');
        sendResponse({ ok: true });
        break;

      case 'getStatus':
        sendResponse({
          running: STATE.running,
          paused: STATE.paused,
          liked: STATE.liked,
          commented: STATE.commented,
          skipped: STATE.skipped,
          status: STATE.currentStatus,
          mode: STATE.mode,
        });
        break;

      case 'showHud':
        createOrShowHud();
        sendResponse({ ok: true });
        break;

      case 'saveSettings':
        aiConfig.provider = msg.aiProvider || 'offline';
        aiConfig.apiKey = msg.aiKey || '';
        aiConfig.model = msg.aiModel || '';
        chrome.storage.local.set({
          aiProvider: aiConfig.provider,
          aiKey: aiConfig.apiKey,
          aiModel: aiConfig.model,
          delayMs: msg.delayMs || 1500,
        });
        sendResponse({ ok: true });
        break;
    }
    return true;
  });

  createOrShowHud();
})();
