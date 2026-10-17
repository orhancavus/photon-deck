# PhotonDeck

A modern, multi-platform Camera Studio Web Application built for **macOS**, **Raspberry Pi**, **Linux**, and **Windows**. It features a hardware-inspired dark-room UI, multi-engine live video streaming, professional viewfinder tools, real-time RGB histogram analysis, and dual-storage media management.

---

## ✨ Features

### 🎥 Multi-Engine Video Pipeline
- **WebRTC Engine**: Direct low-latency browser camera & microphone capture via `navigator.mediaDevices.getUserMedia`.
- **Host Stream Engine**: Hardware-level MJPEG live streaming powered by FFmpeg (`avfoundation` on macOS, `v4l2`/`libcamera` on Linux & Raspberry Pi, `dshow` on Windows) — ideal for headless Raspberry Pi camera rigs.
- **Test Pattern Generator**: Built-in animated synthetic SMPTE/studio broadcast pattern for testing without physical camera hardware.

### 📸 Capture Modes
- **Single Photo**: High-resolution still capture (`JPEG`, `PNG`, `WebP`) with configurable quality and self-timer delays (`Off`, `3s`, `5s`, `10s`).
- **Video Recording**: Hardware-accelerated video recording (`MP4` / `WebM`) with adjustable target bitrate (`2.5` – `35 Mbps`), live audio VU metering, pause/resume support, and quick still snapshots while recording.
- **Burst Mode**: Rapid sequential photo bursts (`3`, `5`, or `10` frames at `100ms`, `250ms`, or `500ms` intervals).
- **Timelapse Mode**: Automated interval shooting (`1s` to `30s` intervals, up to `300` frames).

### 🎛️ Studio Viewfinder & Optics Controls
- **Resolution & Frame Rate Presets**: `4K UHD (3840×2160)`, `1080p FHD (1920×1080)`, `720p HD (1280×720)`, `480p SD (640×480)` at `24`, `30`, or `60 FPS`.
- **Aspect Ratio Framing**: `16:9`, `4:3`, `1:1`, and `9:16` crop masks.
- **Composition Overlays**: Rule of Thirds, Golden Ratio, Center Crosshair, and Broadcast Safe Area guides.
- **Real-Time RGB & Luma Histogram**: Live canvas-analyzed exposure and color distribution graph.
- **Optics Transforms**: Smooth digital zoom (`1.0x` – `5.0x`), horizontal mirroring, and `90°`/`180°`/`270°` rotation.

### 🗂️ Media Gallery & Persistence
- **Hybrid Storage**: Automatically saves captures to the Node.js host filesystem (`./media`) when connected, with seamless fallback to browser IndexedDB (`localDb`).
- **Batch Export**: Inspect metadata, download individual files, or bulk-export selected captures as a `.zip` archive via `JSZip`.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Trigger shutter / Start or stop recording |
| `1` | Switch to **Single Photo** mode |
| `2` | Switch to **Video** mode |
| `3` | Switch to **Burst** mode |
| `4` | Switch to **Timelapse** mode |
| `G` | Cycle composition grid overlays |
| `H` | Toggle live RGB histogram |
| `M` | Open / close Media Gallery |
| `Esc` | Close Media Gallery modal |

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide Icons, JSZip
- **Backend**: Node.js, Express, `tsx`, FFmpeg (optional, for host camera streaming)

---

## 📂 Project Structure

```text
photon-deck/
├── index.html                   # Main HTML entry point
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite bundler & proxy configuration
├── media/                       # Host-side captured media storage
│   └── index.json               # Media metadata index
├── server/                      # Express backend server
│   ├── index.ts                 # API endpoints & static server
│   ├── cameraManager.ts         # OS detection & hardware camera discovery
│   └── mediaStore.ts            # Disk persistence for photos & videos
└── src/                         # Frontend React application
    ├── main.tsx                 # React DOM entry
    ├── App.tsx                  # Root studio layout & keyboard shortcuts
    ├── index.css                # Tailwind v4 imports & custom styles
    ├── components/              # Studio UI components
    │   ├── TopHud.tsx           # Telemetry, FPS, audio meter & engine selector
    │   ├── Viewfinder.tsx       # Live canvas, overlays & HUD badges
    │   ├── ControlDock.tsx      # Right-hand optics, format & mode settings
    │   ├── ShutterBar.tsx       # Bottom capture triggers & mode switcher
    │   ├── HistogramWidget.tsx  # Real-time RGB/Luma waveform widget
    │   └── MediaGallery.tsx     # Lightbox inspector & ZIP archive exporter
    ├── hooks/                   # Custom React hooks
    │   ├── useCameraEngine.ts   # Core capture, streaming & recording state machine
    │   └── useHistogram.ts      # Live pixel sampling hook
    ├── services/                # Client-side services
    │   ├── api.ts               # Backend REST client
    │   ├── localDb.ts           # IndexedDB offline media fallback
    │   └── soundEffects.ts      # Web Audio API synthesized shutter & timer sounds
    └── types/                   # TypeScript interfaces
        └── camera.ts            # Shared camera, media & system types
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `v18+` (recommended `v20+` or `v22+`)
- **FFmpeg** *(optional)*: Required only if you want to use the **Host Stream** (`/api/host-stream`) mode for OS-level or headless Raspberry Pi streaming.

### Installation

```bash
npm install
```

### Development

Run both the Express backend server (`http://localhost:3001`) and the Vite frontend dev server (`http://localhost:5173`) concurrently:

```bash
npm run dev
```

Or run them individually:

```bash
# Start only the Vite client (port 5173)
npm run dev:client

# Start only the Express server with hot-reload (port 3001)
npm run dev:server
```

### Production Build & Start

Build the frontend bundle to `./dist` and serve both the static frontend and REST API from the Express server:

```bash
npm run build
npm start
```

The production server will listen on `http://0.0.0.0:3001` (or the port specified via the `PORT` environment variable).

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/system-info` | Returns host OS platform, architecture, FFmpeg/rpicam status, and detected host cameras. |
| `GET` | `/api/host-stream` | Streams live `multipart/x-mixed-replace` MJPEG video from a host camera via FFmpeg. |
| `GET` | `/api/media` | Lists all captured media items stored in `./media`. |
| `POST` | `/api/media` | Uploads and persists a new photo or video capture to `./media`. |
| `DELETE` | `/api/media/:id` | Deletes a specific media item by ID. |
| `POST` | `/api/media/batch-delete` | Deletes multiple media items in a single request. |
