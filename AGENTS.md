# PhotonDeck Workspace Rules & Architectural Invariants

## 1. Host OS Video Streaming & Canvas Compositing
- **Never use offscreen `<img>` with `multipart/x-mixed-replace`** as a source for `<canvas>` `drawImage()`. Browser rendering engines throttle or freeze detached multipart image elements after the first frame.
- **Always use the Binary `ReadableStream` + `createImageBitmap` pipeline** (`/api/host-stream?raw=1`) for Host OS camera streams:
  - Server frames each JPEG with a 4-byte `UInt32BE` length header (`Content-Type: application/octet-stream`) using native `Buffer.indexOf()` for SOI (`0xFFD8FF`) and EOI (`0xFFD9`).
  - Client reads frame lengths in $O(1)$ via `DataView.prototype.getUint32(0, false)`, decodes via `createImageBitmap(blob)`, and **must** call `.close()` on the previous `ImageBitmap` to prevent GPU memory leaks.
- **Bypass the Vite Dev Proxy for Streaming**: In development (`window.location.port === '5173'`), always connect directly to `http://<hostname>:3001/api/host-stream` via `getStreamBaseUrl()`. Routing continuous binary streams through Vite's HTTP proxy introduces chunk buffering and severe FPS drops.

## 2. FFmpeg AVFoundation & Low-Latency Capture
- **macOS Sensor Resolution Negotiation**: macOS `avfoundation` cameras (such as FaceTime HD) frequently reject arbitrary capture resolutions like `640x480`. Always capture from the sensor at `-video_size 1280x720 -framerate 30 -pixel_format uyvy422` (with fallbacks to `yuyv422`, `nv12`) and downscale to the requested target resolution using `-vf scale=<w>:<h>:flags=fast_bilinear`.
- **Zero-Probe & Slice Encoding Flags**: Maintain `-probesize 32 -analyzeduration 0 -fflags nobuffer -flags low_delay -fps_mode passthrough -threads 2 -thread_type slice -f image2pipe -vcodec mjpeg -pix_fmt yuvj422p -huffman default -q:v 6 -flush_packets 1 pipe:1`.

## 3. macOS Continuity Camera (iPhone) Discovery & Bridging
- **Dual Discovery on macOS**: `ffmpeg -f avfoundation -list_devices true` does not reliably list wireless iPhone Continuity Cameras managed by CoreMediaIO (`ContinuityCaptureAgent`). Always merge FFmpeg's device list with `system_profiler SPCameraDataType -json` (`spcamera_datatype`) in `server/cameraManager.ts`.
- **WebRTC Label Unlock & Bridge**: In `useCameraEngine.ts`, run a brief `navigator.mediaDevices.getUserMedia({ video: true, audio: false })` permission probe before `enumerateDevices()` so browser device labels are populated, listen to `navigator.mediaDevices` `devicechange` events, and bridge `macos-continuity:*` selections to the matching WebRTC `deviceId`.
