# Instagram Profile Auto-Liker Chrome Extension

A lightweight, automated Chrome Extension (Manifest V3) to like all posts (photos, reels, videos) on any target Instagram profile.

Includes **built-in safety algorithms**, **humanized random delays**, **maximum post limits**, and a **floating on-screen HUD** so you don't lose controls when navigating.

---

## Features

- **Profile Batch Liker:** Automatically opens the first post on a profile and iterates through every photo and reel via lightbox navigation.
- **Floating On-Screen HUD:** A floating control bar directly on the Instagram page with live stats (Liked, Skipped, Limit), Start/Pause/Stop buttons, and status messages.
- **Dual Controls:** Use either the Chrome Extension Popup icon or the on-screen Floating Widget.
- **Smart Skip:** Detects if a post is already liked (red heart) and skips it to save time and actions.
- **Anti-Ban Safety Delays:** Configurable random jitter (e.g. 3 to 6 seconds between likes) to mimic human browsing and protect your account from Instagram action blocks.
- **Action Block Detection:** Automatically detects Instagram "Try Again Later" warnings and pauses execution immediately to protect your account.
- **Draggable & Minimizable:** Move the floating widget anywhere on your screen or collapse it into a minimal pill.

---

## Installation Guide (Chrome / Edge / Brave)

1. Open your browser and go to the Extensions manager:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
2. Turn on **Developer mode** (toggle switch in the top-right corner).
3. Click the **Load unpacked** button in the top-left corner.
4. Select the extension directory:
   ```
   C:\Users\NaveenKumarAvula\.gemini\antigravity\scratch\insta-auto-liker-extension
   ```
5. The extension **"Instagram Auto Liker - Profile Batch Liker"** is now installed! Pin it to your Chrome toolbar for quick access.

---

## How to Use

1. **Log in to Instagram:**
   Go to [https://www.instagram.com](https://www.instagram.com) and log in to your account.
2. **Navigate to the Target Profile:**
   Open the profile page of the person whose posts you want to like (e.g., `https://www.instagram.com/username/`).
3. **Configure & Start:**
   - Look at the bottom-right corner of the page: you will see the **Auto Liker Floating Widget**.
   - (Optional) Click the extension icon in your Chrome toolbar to customize delay (default 3–6s) or set a maximum post limit (default 30).
   - Click **▶ Start Auto-Liking** (on either the floating widget or popup).
4. **Sit back & watch:**
   - The extension opens the first post.
   - It checks if the post is already liked. If not, it likes it.
   - It waits a randomized delay (showing a live countdown).
   - It advances to the next post automatically.
   - You can click **⏸ Pause** or **⏹ Stop** at any time.

---

## Recommended Account Safety Guidelines

Instagram actively monitors rapid automated interactions. To keep your account safe:
- **Keep delays at 3–6 seconds or higher.** Avoid setting delays below 2 seconds.
- **Limit batch runs:** Keep batches to **30–50 posts per session**.
- If Instagram ever shows a "Try Again Later" action block, wait 12–24 hours before liking posts again.
