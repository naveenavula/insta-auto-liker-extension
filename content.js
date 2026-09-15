// ============================================================
// Insta Auto Liker & Commenter v1.2.0 - content.js
// Full rewrite: reliable liking, commenting, generate & preview
// ============================================================
(function () {
  'use strict';

  if (window.__instaAutoLikerLoaded) return;
  window.__instaAutoLikerLoaded = true;

  // ── State ────────────────────────────────────────────────
  const STATE = {
    running: false,
    paused: false,
    mode: 'like',        // 'like' | 'comment' | 'both' | 'preview'
    liked: 0,
    commented: 0,
    skipped: 0,
    currentStatus: 'Idle',
    delayMs: 1500,
  };

  // Persistent sets loaded from chrome.storage.local
  let likedPostIds = new Set();
  let commentedPostIds = new Set();
  let usedCommentTexts = [];  // ordered array, keep last 30

  // ── Settings ─────────────────────────────────────────────
  let aiProvider = 'gemini';
  let aiKey = '';
  let aiModel = '';

  function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['aiProvider', 'aiKey', 'aiModel', 'likedPostIds', 'commentedPostIds', 'usedCommentTexts', 'delayMs'],
        r => {
          aiProvider = r.aiProvider || 'offline';
          aiKey = r.aiKey || '';
          aiModel = r.aiModel || '';
          STATE.delayMs = typeof r.delayMs === 'number' ? r.delayMs : 1500;
          likedPostIds = new Set(r.likedPostIds || []);
          commentedPostIds = new Set(r.commentedPostIds || []);
          usedCommentTexts = r.usedCommentTexts || [];
          resolve();
        }
      );
    });
  }

  function saveIds() {
    chrome.storage.local.set({
      likedPostIds: [...likedPostIds],
      commentedPostIds: [...commentedPostIds],
      usedCommentTexts: usedCommentTexts,
    });
  }

  // ── HUD ──────────────────────────────────────────────────
  let hud = null;
  let hudStatus, hudLiked, hudCommented, hudSkipped, hudPreviewBox;

  function createHud() {
    if (document.getElementById('ial-hud')) return;

    hud = document.createElement('div');
    hud.id = 'ial-hud';
    hud.innerHTML = `
      <div id="ial-header">
        <span id="ial-title">🤖 Auto Liker v1.2</span>
        <button id="ial-close">✕</button>
      </div>
      <div id="ial-status-row">
        <span id="ial-status-dot" class="dot dot-idle"></span>
        <span id="ial-status-text">Idle</span>
      </div>
      <div id="ial-stats">
        <div class="ial-stat"><span id="ial-liked">0</span><small>Liked</small></div>
        <div class="ial-stat"><span id="ial-commented">0</span><small>Commented</small></div>
        <div class="ial-stat"><span id="ial-skipped">0</span><small>Skipped</small></div>
      </div>
      <div id="ial-preview-box" style="display:none">
        <div id="ial-preview-label">💬 Generated Comment:</div>
        <div id="ial-preview-text"></div>
        <button id="ial-copy-btn">📋 Copy</button>
      </div>
    `;
    document.body.appendChild(hud);

    hudStatus = document.getElementById('ial-status-text');
    hudLiked = document.getElementById('ial-liked');
    hudCommented = document.getElementById('ial-commented');
    hudSkipped = document.getElementById('ial-skipped');
    hudPreviewBox = document.getElementById('ial-preview-box');

    document.getElementById('ial-close').addEventListener('click', () => {
      hud.style.display = 'none';
    });

    document.getElementById('ial-copy-btn').addEventListener('click', () => {
      const txt = document.getElementById('ial-preview-text').textContent;
      navigator.clipboard.writeText(txt).then(() => {
        document.getElementById('ial-copy-btn').textContent = '✅ Copied!';
        setTimeout(() => { document.getElementById('ial-copy-btn').textContent = '📋 Copy'; }, 2000);
      });
    });

    makeDraggable(hud);
    updateHud();
  }

  function makeDraggable(el) {
    const header = el.querySelector('#ial-header');
    let ox = 0, oy = 0, mx = 0, my = 0;
    header.addEventListener('mousedown', e => {
      e.preventDefault();
      mx = e.clientX; my = e.clientY;
      document.onmousemove = ev => {
        ox = mx - ev.clientX; oy = my - ev.clientY;
        mx = ev.clientX; my = ev.clientY;
        el.style.top = (el.offsetTop - oy) + 'px';
        el.style.left = (el.offsetLeft - ox) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      };
      document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
    });
  }

  function setStatus(msg, type = 'running') {
    STATE.currentStatus = msg;
    if (!hudStatus) return;
    hudStatus.textContent = msg;
    const dot = document.getElementById('ial-status-dot');
    if (dot) {
      dot.className = 'dot dot-' + type;
    }
  }

  function updateHud() {
    if (!hud) return;
    if (hudLiked) hudLiked.textContent = STATE.liked;
    if (hudCommented) hudCommented.textContent = STATE.commented;
    if (hudSkipped) hudSkipped.textContent = STATE.skipped;
  }

  function showPreview(text) {
    if (!hudPreviewBox) return;
    document.getElementById('ial-preview-text').textContent = text;
    hudPreviewBox.style.display = 'block';
  }

  function hidePreview() {
    if (!hudPreviewBox) return;
    hudPreviewBox.style.display = 'none';
  }

  // ── Sleep ────────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms)));
  }

  // ── Get post shortcode from URL ──────────────────────────
  function getPostId() {
    const m = window.location.href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[2] : null;
  }

  // ── Find Like button ─────────────────────────────────────
  function findLikeButton() {
    // Search globally for heart SVG with aria-label Like
    const svgs = document.querySelectorAll('svg[aria-label="Like"], svg[aria-label="Unlike"]');
    for (const svg of svgs) {
      const btn = svg.closest('button');
      if (btn) return { btn, isLiked: svg.getAttribute('aria-label') === 'Unlike' };
    }

    // Fallback: search by button title
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      const svg = btn.querySelector('svg');
      if (!svg) continue;
      const label = svg.getAttribute('aria-label') || '';
      if (label === 'Like' || label === 'Unlike') {
        return { btn, isLiked: label === 'Unlike' };
      }
    }
    return null;
  }

  async function likeCurrentPost() {
    const info = findLikeButton();
    if (!info) {
      console.log('[IAL] Like button not found');
      return false;
    }
    if (info.isLiked) {
      console.log('[IAL] Already liked');
      return true; // already liked
    }
    info.btn.click();
    await sleep(600);
    // Verify
    const after = findLikeButton();
    return after ? after.isLiked : true;
  }

  // ── Find comment textarea ────────────────────────────────
  function findCommentTextarea() {
    // Try regular textarea first
    const ta = document.querySelector('textarea[placeholder*="comment" i], textarea[aria-label*="comment" i]');
    if (ta) return { el: ta, type: 'textarea' };

    // Try contenteditable div
    const ce = document.querySelector('div[contenteditable="true"][placeholder*="comment" i], div[contenteditable="true"][aria-label*="comment" i]');
    if (ce) return { el: ce, type: 'contenteditable' };

    // Generic fallback: any visible textarea
    const allTA = document.querySelectorAll('textarea');
    for (const t of allTA) {
      if (t.offsetParent !== null) return { el: t, type: 'textarea' };
    }
    return null;
  }

  // Click the "Add a comment..." placeholder to activate the input
  async function activateCommentBox() {
    const placeholder = document.querySelector('span[class*="placeholder" i]');
    if (placeholder) placeholder.click();

    // Click the Add a comment area
    const commentArea = document.querySelector(
      '[data-testid="comment-input-field"], ' +
      'textarea[placeholder], ' +
      'div[contenteditable]'
    );
    if (commentArea) commentArea.click();

    await sleep(500);
  }

  // Set value on textarea using React's native setter (proven approach)
  function setNativeValue(el, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }
    // Dispatch events React needs
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setContentEditable(el, value) {
    el.focus();
    el.textContent = '';
    // Use execCommand (works in contenteditable)
    document.execCommand('insertText', false, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Find and click Submit/Post button
  async function clickSubmitButton() {
    // Look for Post / Submit button that is enabled
    const candidates = [...document.querySelectorAll('button')].filter(b => {
      const txt = b.textContent.trim().toLowerCase();
      return (txt === 'post' || txt === 'submit' || txt === 'reply') && !b.disabled;
    });

    for (const btn of candidates) {
      if (btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }

    // Fallback: Enter key on active element
    const ae = document.activeElement;
    if (ae) {
      ae.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      ae.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
      ae.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
    }
    return false;
  }

  async function postComment(text) {
    setStatus('Opening comment box...', 'running');
    await activateCommentBox();
    await sleep(600);

    let box = findCommentTextarea();
    if (!box) {
      // Try clicking the comment icon first
      const commentIcon = document.querySelector('svg[aria-label="Comment"]');
      if (commentIcon) commentIcon.closest('button')?.click();
      await sleep(800);
      box = findCommentTextarea();
    }

    if (!box) {
      console.log('[IAL] Comment box not found');
      return false;
    }

    setStatus('Typing comment...', 'running');
    box.el.focus();
    await sleep(300);

    if (box.type === 'textarea') {
      setNativeValue(box.el, text);
    } else {
      setContentEditable(box.el, text);
    }

    await sleep(700);

    setStatus('Submitting comment...', 'running');
    const submitted = await clickSubmitButton();
    await sleep(1000);

    // Blur everything to free focus
    if (document.activeElement) document.activeElement.blur();
    document.body.focus();

    return submitted;
  }

  // ── Navigate to next post ────────────────────────────────
  async function navigateToNext() {
    // First blur all focused elements
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    await sleep(200);

    // Close any open overlays with Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(300);

    // Strategy 1: Click Next (chevron) button in lightbox
    const nextBtns = [
      ...document.querySelectorAll('button[aria-label="Next"], button[aria-label="Go Forward"], svg[aria-label="Next"]'),
    ];
    for (const el of nextBtns) {
      const btn = el.tagName === 'BUTTON' ? el : el.closest('button');
      if (btn && btn.offsetParent !== null) {
        btn.click();
        await sleep(800);
        return true;
      }
    }

    // Strategy 2: ArrowRight key
    document.body.focus();
    await sleep(100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
    await sleep(800);

    return true;
  }

  // ── AI Comment Generation ─────────────────────────────────
  const OFFLINE_POOL = [
    "love this 🔥", "this is everything", "okay this is amazing",
    "absolutely stunning", "the vibe here is immaculate", "this is so good",
    "obsessed with this", "this made my day honestly", "genuinely love this",
    "the energy here 👏", "this hits different", "need more of this",
    "so beautiful omg", "this is top tier", "can't stop looking at this",
    "this is art 🎨", "the aesthetic is everything", "so peaceful and beautiful",
    "pure perfection", "this made me smile", "so wholesome 🥰",
    "the way this looks 😍", "absolutely love the vibe", "this is goals",
    "okay i'm obsessed", "the colors in this are insane", "stunning as always",
    "this is a mood", "love everything about this", "honestly so beautiful",
    "the composition here 🙌", "this is giving me life rn", "wow just wow",
    "okay i needed this today", "such a great shot", "this is pure joy",
    "the lighting is perfect", "love love love this", "this is iconic",
    "this looks incredible", "the texture and colors 😍", "so so good",
    "this is exactly my vibe", "okay this is a masterpiece", "literally gorgeous",
    "the detail here is unreal", "this is 🔥🔥", "absolutely beautiful",
    "love the perspective on this", "the feeling this gives 💯",
    "this picture is everything", "cannot get enough of this",
    "the way this is captured 📸", "love how real this feels",
    "this is the content i needed", "stunning work here", "honestly breathtaking",
    "the composition is chef's kiss", "this vibe is unmatched",
    "the colors are doing something to me", "this photo is a whole mood",
    "loving the realness of this", "this is giving me good vibes all day",
    "the aesthetic is *chefs kiss*", "okay you really captured something here",
    "beautiful doesn't even cover it", "this is seriously so good",
    "the warmth in this 🥰", "okay i'm saving this one",
    "this literally stopped my scroll", "stunning in the best way",
    "the energy here is unmatched", "love everything you post",
  ];

  function getUniqueOfflineComment() {
    const available = OFFLINE_POOL.filter(c => !usedCommentTexts.includes(c));
    const pool = available.length > 0 ? available : OFFLINE_POOL;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick;
  }

  function buildPrompt(context) {
    const recent = usedCommentTexts.slice(-15);
    const avoidStr = recent.length > 0
      ? `\n\nIMPORTANT: Do NOT use or rephrase any of these previous comments:\n${recent.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

    return `You are a real Instagram user commenting on a post. Write ONE short, authentic comment (1-2 lines max) for this Instagram post.

Rules:
- Sound like a real young person, not AI
- Lowercase is fine, casual tone
- No hashtags, no emojis overload (0-1 emoji max)
- No generic phrases like "amazing content" or "great post"
- Be specific to what you see if context helps
- Max 15 words
- Just output the comment text, nothing else${avoidStr}

Post context: ${context}`;
  }

  async function callGemini(prompt) {
    const model = aiModel || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.1, maxOutputTokens: 60 },
      }),
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  async function callOpenAI(prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: aiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 1.1,
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }

  async function callOpenRouter(prompt) {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: aiModel || 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 1.1,
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }

  async function generateComment() {
    // Build context from page
    const altTexts = [...document.querySelectorAll('img[alt]')]
      .map(i => i.alt)
      .filter(a => a && a.length > 10)
      .slice(0, 3)
      .join('; ');

    const captionEl = document.querySelector('h1, [class*="caption"]');
    const caption = captionEl ? captionEl.textContent.slice(0, 150) : '';
    const context = [altTexts, caption].filter(Boolean).join(' | ') || 'an Instagram photo';

    const prompt = buildPrompt(context);

    let result = null;

    try {
      if (aiKey && aiProvider === 'gemini') result = await callGemini(prompt);
      else if (aiKey && aiProvider === 'openai') result = await callOpenAI(prompt);
      else if (aiKey && aiProvider === 'openrouter') result = await callOpenRouter(prompt);
    } catch (e) {
      console.warn('[IAL] AI call failed:', e);
    }

    if (!result) result = getUniqueOfflineComment();

    // Clean up quotes
    result = result.replace(/^["']|["']$/g, '').trim();

    // Track uniqueness
    usedCommentTexts.push(result);
    if (usedCommentTexts.length > 30) usedCommentTexts.shift();
    saveIds();

    return result;
  }

  // ── Main Loop ─────────────────────────────────────────────
  async function mainLoop() {
    await loadSettings();
    createHud();
    setStatus('Starting...', 'running');

    let consecutiveFails = 0;
    const MAX_FAILS = 5;

    while (STATE.running) {
      if (STATE.paused) {
        setStatus('Paused', 'paused');
        await sleep(1000);
        continue;
      }

      const postId = getPostId();
      setStatus(`Post: ${postId || 'scanning...'}`, 'running');

      await sleep(500);

      // ── LIKE ──────────────────────────────────────────────
      if (STATE.mode === 'like' || STATE.mode === 'both') {
        if (postId && likedPostIds.has(postId)) {
          setStatus('Already liked, moving on', 'running');
        } else {
          setStatus('Liking post...', 'running');
          const liked = await likeCurrentPost();
          if (liked) {
            STATE.liked++;
            if (postId) {
              likedPostIds.add(postId);
              saveIds();
            }
            updateHud();
            setStatus('✅ Liked!', 'running');
          } else {
            STATE.skipped++;
            updateHud();
            setStatus('⚠ Could not like, skipping', 'running');
          }
        }
        await sleep(300);
      }

      // ── COMMENT ───────────────────────────────────────────
      if (STATE.mode === 'comment' || STATE.mode === 'both') {
        if (postId && commentedPostIds.has(postId)) {
          setStatus('Already commented, moving on', 'running');
        } else {
          setStatus('Generating comment...', 'running');
          const comment = await generateComment();
          setStatus('Posting comment...', 'running');
          const ok = await postComment(comment);
          if (ok) {
            STATE.commented++;
            if (postId) {
              commentedPostIds.add(postId);
              saveIds();
            }
            updateHud();
            setStatus('✅ Commented!', 'running');
          } else {
            STATE.skipped++;
            updateHud();
            setStatus('⚠ Comment failed, skipping', 'running');
          }
        }
        await sleep(500);
      }

      // ── PREVIEW ───────────────────────────────────────────
      if (STATE.mode === 'preview') {
        setStatus('Generating preview comment...', 'running');
        const comment = await generateComment();
        showPreview(comment);
        setStatus('📋 Comment ready — copy & paste it!', 'running');
        // Wait for user to copy, then navigate after delay
        await sleep(Math.max(STATE.delayMs, 3000));
      }

      consecutiveFails = 0;

      // ── Delay between posts ────────────────────────────────
      if (STATE.delayMs > 0 && STATE.mode !== 'preview') {
        setStatus(`Waiting ${(STATE.delayMs / 1000).toFixed(1)}s...`, 'running');
        await sleep(STATE.delayMs);
      }

      if (!STATE.running) break;

      // ── Navigate to next post ──────────────────────────────
      if (STATE.mode !== 'preview') hidePreview();
      setStatus('Navigating to next post...', 'running');
      await navigateToNext();
      await sleep(1200);

      // Check if navigation worked
      const newId = getPostId();
      if (newId === postId && postId !== null) {
        consecutiveFails++;
        setStatus(`Navigation stuck (${consecutiveFails}/${MAX_FAILS})`, 'running');
        if (consecutiveFails >= MAX_FAILS) {
          setStatus('⛔ Navigation stuck, stopping', 'idle');
          STATE.running = false;
          break;
        }
      }
    }

    setStatus('Stopped', 'idle');
  }

  // ── Message Listener ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'start':
        if (!STATE.running) {
          STATE.running = true;
          STATE.paused = false;
          STATE.mode = msg.mode || 'like';
          STATE.delayMs = typeof msg.delayMs === 'number' ? msg.delayMs : 1500;
          STATE.liked = 0;
          STATE.commented = 0;
          STATE.skipped = 0;
          mainLoop().catch(e => {
            console.error('[IAL] mainLoop error:', e);
            STATE.running = false;
            setStatus('Error: ' + e.message, 'idle');
          });
        }
        sendResponse({ ok: true });
        break;

      case 'pause':
        STATE.paused = !STATE.paused;
        sendResponse({ paused: STATE.paused });
        break;

      case 'stop':
        STATE.running = false;
        STATE.paused = false;
        setStatus('Stopped', 'idle');
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
        createHud();
        if (hud) hud.style.display = 'block';
        sendResponse({ ok: true });
        break;

      case 'saveSettings':
        aiProvider = msg.aiProvider || 'offline';
        aiKey = msg.aiKey || '';
        aiModel = msg.aiModel || '';
        chrome.storage.local.set({
          aiProvider: aiProvider,
          aiKey: aiKey,
          aiModel: aiModel,
          delayMs: msg.delayMs || 1500,
        });
        sendResponse({ ok: true });
        break;
    }
    return true; // async response
  });

  // Auto-show HUD when on a post page
  if (/\/(p|reel|tv)\//.test(window.location.pathname)) {
    createHud();
  }

})();
