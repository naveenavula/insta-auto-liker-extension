# Instagram Auto Liker & AI Commenter (v1.1.0)

A powerful Chrome Extension (Manifest V3) to automatically like posts and generate **authentic, human-sounding AI comments** on any target Instagram profile.

Powered by **Google Gemini**, **OpenAI ChatGPT**, and **Open-Source Vision Models (Llama 3.2 Vision via OpenRouter)**, with a **smart offline fallback** that works without any API keys.

---

## What's New in v1.1.0

- 🤖 **AI-Powered Photo Commenting:** Analyzes the image and post caption using multimodal vision AI and writes genuine, 1-line human comments.
- 🎯 **3 Action Modes:**
  - `❤️ Like Only`: Pure auto-liking.
  - `💬 Comment Only`: Auto-analyzes each photo and posts authentic comments.
  - `❤️+💬 Like & Comment`: Likes and leaves an authentic comment on each post.
- 🧠 **Multiple AI Providers:**
  - **Google Gemini (Recommended):** Generous free tier via `gemini-1.5-flash`.
  - **OpenAI (ChatGPT):** `gpt-4o-mini` / `gpt-4o`.
  - **Open-Source / OpenRouter:** Llama 3.2 Vision and any OpenAI-compatible endpoint.
  - **Smart Offline Engine:** Generates natural context-aware comments without any API key.
- 🗣️ **Human Authenticity Prompting:** Strict anti-bot prompts prevent robotic clichés (e.g. *"What a splendid photograph"*) and outputs natural follower comments (e.g. *"the lighting here is so good 🔥"*, *"the fit goes hard 🙌"*, *"views are insane"*).
- 🎨 **Comment Tones:** Choose between *Casual & Authentic*, *Hype & High Energy*, *Aesthetic & Artistic*, or *Short & Sweet (1-3 words)*.
- ⚡ **0s Instant Speed & Dual Controls:** Floating draggable HUD on Instagram + Toolbar Popup.

---

## Installation Guide (Chrome / Edge / Brave)

1. Go to `chrome://extensions` in your browser.
2. Turn on **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked** (top-left).
4. Select the directory on your Desktop:
   ```
   C:\Users\<YourUsername>\Desktop\insta-auto-liker-extension
   ```
5. Pin **"Instagram Auto Liker & AI Commenter"** to your Chrome toolbar.

---

## How to Set Up AI Commenting

### Option A: Google Gemini (Free Tier - Recommended)
1. Get a free API key at [Google AI Studio](https://aistudio.google.com).
2. Click the extension icon in Chrome.
3. Under **AI Comment Engine**, select **Google Gemini**.
4. Paste your API key.

### Option B: OpenAI ChatGPT
1. Get an API key from [OpenAI Platform](https://platform.openai.com).
2. Select **OpenAI (ChatGPT / GPT-4o)** in the extension popup and paste your key.

### Option C: Smart Offline Fallback (Zero Setup)
1. Select **Smart Offline Fallback**.
2. No API key needed! The extension uses built-in context-aware comment libraries matching the post caption and image tags.

---

## How to Use

1. Log in to [instagram.com](https://www.instagram.com).
2. Go to any user profile page (`https://www.instagram.com/<username>/`).
3. On the floating on-screen HUD (or extension popup):
   - Choose your mode: **❤️+💬 Both**, **❤️ Like**, or **💬 Comment**.
   - Choose your speed: **⚡ 0s**, **1s**, or **3s**.
   - Set your limit (e.g. 20, 50 posts).
4. Click **▶ Start**.
5. The extension will open posts, like and/or analyze photos, post authentic comments, and advance automatically!
