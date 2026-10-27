# Soundspace

A single-screen, local-first soundboard built with React, TypeScript and Vite. No accounts, paid packages, backend, cloud storage or API keys.

## Run locally

Use Node.js 22.12+ (Node 24 is validated).

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Microphone recording works on **localhost or HTTPS**; an HTTP LAN address will not have microphone access.

```sh
npm run build
npm run preview
```

The production app includes the offline service worker. Development intentionally does not register it.

## Use the board

Use **Night mode** in the top toolbar for a dark interface, or **Normal mode** to switch back. On phones the toggle uses a moon/sun icon. Your choice is saved in that browser on that device; custom button colors and board backups remain unchanged.

- In **Edit**, add a sound button, drag to position it, and drag its bottom-right handle to resize. Buttons overlap freely; Bring forward and Send back set their order. Snap to the 20 px grid is optional and off by default.
- Select a button to change its label, emoji or image, colors, font, shape, size, and position. Circle and square buttons keep equal dimensions. Duplicate shares the audio while keeping independent playback.
- Upload MP3, WAV, M4A or other browser-compatible audio, preview it, then save it to the button. Select any previously imported sound in Assigned sound to reuse it.
- Record sound → Start recording → Stop → preview → Save to button. Retry discards the take; Cancel stops recording and releases the microphone. Browser permission is required.
- **Play** hides editing controls. Each tap restarts that button's sound at zero; different buttons play concurrently. Stop all sounds silences all buttons. Volume and loop are per button.
- The canvas scrolls in both directions and expands when buttons move beyond its edges. Zoom controls scale the view without altering layout. Browser pinch zoom remains available; there is no custom pinch gesture that could conflict with scrolling.
- Changes, sounds, images and preferences save automatically in IndexedDB. Wait for “All changes saved” before closing. Export creates a JSON backup including audio; Import replaces the current board after confirmation.

**Local data is not a permanent backup. Clearing browser data, private browsing, storage pressure, or deleting the app can erase sounds. Export backups regularly.** Each browser/device has separate storage. Save failures display an error; exporting remains available. Uploads are limited to 100 MB each, images to 2 MB, and backup imports to 250 MB to protect low-memory devices.

## Record a whole performance

Click **Record performance**, then tap your sound buttons. The app switches to Play mode and captures all button audio, overlaps, volume settings, loops, and silence into one recording. It records the app's sound directly, not your room or microphone. Click **Stop recording performance** to finish; the latest take saves separately in IndexedDB without changing your buttons or uploaded audio.

Click **Play performance**, then choose **0.5×, 1.0×, 1.5×, 2.0×, or 4.0×**. One speed applies to the whole performance, including pauses; you can also change it during playback. The browser preserves pitch where supported. Playback restarts from the beginning when pressed again. **Stop all sounds** stops playback and live buttons; while recording it captures silence until you press **Stop recording performance**.

Wait for **Performance saved on this device** before closing. **Download performance (1×)** exports the mixed audio at its original recorded speed (WebM/Opus or M4A depending on the browser). The speed selector changes playback, not the downloaded file. Only the latest take is retained locally; recording again asks before replacing it. Download takes you want to keep. Board JSON backups do **not** include the separate performance: download it separately. Neither boards nor performances sync between devices.

Keep the app in the foreground and the device awake while recording: mobile browsers may suspend audio in the background. Performance recording requires Web Audio and MediaRecorder support. Mixing many loud overlapping sounds can clip; lower individual button volumes. Storage errors leave the take available for download in the current tab.

## Cloudflare Pages (free static hosting)

1. Push this project to your GitHub repository.
2. In Cloudflare, create a **Workers & Pages → Pages** project and connect the repository.
3. Use build command `npm run build`, output directory `dist`, and the project root as the build root. Set Node version to 24 if requested.
4. Deploy. Cloudflare supplies an HTTPS `pages.dev` address, enabling recording and offline installation.

Alternatively, run `npm run build` locally and upload `dist` as a Pages Direct Upload project. No server functions, credentials or database are required. Cloudflare's free-plan terms and limits apply; a custom domain is optional.

## Install / offline use

Visit the HTTPS production site online first and let the app finish loading. Chrome/Edge on desktop and Android: use the browser's Install app or Add to home screen command. Safari on iPhone/iPad: Share → Add to Home Screen; on recent macOS Safari: File → Add to Dock. Availability and wording vary by browser. The app also works as a normal webpage.

The service worker caches the application shell and built assets; IndexedDB holds your sounds. Reopen the app after the first online load to use it offline. Installing the PWA is optional. Offline readiness needs a successful initial load and browser support, and microphone permissions still apply. For updated releases, revisit online; close and reopen all app tabs if a new service worker is waiting.

## Validation

```sh
npx playwright install chromium
npm test
```

On a cloud machine with system Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm test
```

The tests build and serve the production app and cover free positioning/resizing, shape constraints, layers, persistence, audio restart and simultaneous playback, stop all, export/import, microphone recording with a synthetic browser microphone, mobile viewport layout, zoom and offline reload. They do not establish real-device Safari compatibility or physical microphone quality. Manually check real microphones, permission denial, touch dragging, storage exhaustion, and installation on your target devices before wide distribution.

## Known limitations

- Optional online sound search is deferred. Upload and recording work independently with no external service or API credential.
- Audio codec availability depends on the browser. MP3 and WAV are the safest interchange formats; MediaRecorder chooses a native recording format (typically WebM/Opus or MP4/AAC). A recording may not play in an older browser on a different device.
- No time trimming, cloud sync, multi-board library or undo history. New board and Import replace the current board after confirmation.
- Audio uses HTMLAudioElement; latency depends on device and codec and is not suitable for sample-accurate musical performance.
- Up to 1,000 buttons per imported board; practical limits depend on device memory, audio size and browser quotas.
