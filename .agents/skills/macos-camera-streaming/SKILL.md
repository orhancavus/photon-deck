---
name: macos-camera-streaming
description: >-
  Runbook and reference for low-latency FFmpeg AVFoundation camera streaming,
  length-prefixed binary MJPEG decoding onto HTML5 Canvas via createImageBitmap,
  and macOS iPhone Continuity Camera discovery and WebRTC bridging. Use when
  debugging camera framerate, frozen viewfinder frames, or missing hardware devices.
---

# macOS & Host OS Low-Latency Camera Streaming Skill

Use this skill when diagnosing or extending hardware camera discovery, FFmpeg streaming, or `<canvas>` viewfinder performance.

## 1. Diagnosing Missing macOS / Continuity Cameras

1. **Check FFmpeg AVFoundation Enumeration**:
   ```bash
   ffmpeg -hide_banner -f avfoundation -list_devices true -i ""
   ```
2. **Check CoreMediaIO / Continuity Camera Enumeration**:
   Wireless iPhone Continuity Cameras often only appear in `SPCameraDataType`:
   ```bash
   system_profiler SPCameraDataType -json
   ```
   Inspect `SPCameraDataType[].model_id` and `_name` for `iPhone` or `ContinuityCaptureDevice`.
3. **Browser WebRTC Label Unlock**:
   `navigator.mediaDevices.enumerateDevices()` returns empty `label` strings until camera permission is granted. Perform a brief probe first:
   ```ts
   const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
   probe.getTracks().forEach(t => t.stop());
   const devices = await navigator.mediaDevices.enumerateDevices();
   ```
   Match `macos-continuity:*` host entries against WebRTC `videoinput` devices whose label matches `/iphone|continuity/i`.

## 2. Low-Latency FFmpeg MJPEG Pipeline

To achieve 30 FPS with `<35ms` glass-to-glass latency on macOS `avfoundation`:

```bash
ffmpeg -hide_banner -loglevel warning \
  -probesize 32 -analyzeduration 0 -fflags nobuffer -flags low_delay \
  -f avfoundation -framerate 30 -video_size 1280x720 -pixel_format uyvy422 -i "0:none" \
  -vf "scale=640:480:flags=fast_bilinear" \
  -fps_mode passthrough -threads 2 -thread_type slice \
  -f image2pipe -vcodec mjpeg -pix_fmt yuvj422p -huffman default -q:v 6 -flush_packets 1 pipe:1
```

## 3. Binary Length-Prefixed Frame Protocol (`?raw=1`)

- **Server (`server/index.ts`)**:
  - Extract complete JPEG frames from FFmpeg `stdout` using `Buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]))` and `Buffer.indexOf(Buffer.from([0xff, 0xd9]))`.
  - Prepend a 4-byte `UInt32BE` header containing `frame.length` and write `[header, frame]` over `Content-Type: application/octet-stream` with `socket.setNoDelay(true)`.
- **Client (`src/hooks/useCameraEngine.ts`)**:
  - Connect directly to port `3001` (bypassing Vite proxy on `:5173`).
  - Read `const frameLen = new DataView(acc.buffer, acc.byteOffset, acc.byteLength).getUint32(0, false)`.
  - Slice `acc.subarray(4, 4 + frameLen)`, decode off-thread with `createImageBitmap(new Blob([jpegBytes], { type: 'image/jpeg' }))`, swap into `hostBitmapRef.current`, and `.close()` the previous `ImageBitmap`.
