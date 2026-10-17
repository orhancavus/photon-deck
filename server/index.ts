import express from 'express';
import cors from 'cors';
import path from 'path';
import { spawn } from 'child_process';
import { getPlatformInfo, listHostCameras } from './cameraManager.ts';
import {
  ensureMediaDir,
  getMediaDir,
  listMediaItems,
  saveMediaItem,
  deleteMediaItem,
  deleteMultipleMediaItems,
} from './mediaStore.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '250mb' }));

ensureMediaDir();
app.use('/media-files', express.static(getMediaDir()));

import { ChildProcess } from 'child_process';

// 1. System & Platform Info
app.get('/api/system-info', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const info = await getPlatformInfo(forceRefresh);
    const hostCameras = await listHostCameras(forceRefresh);
    res.json({
      ...info,
      hostCameras,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

interface StreamClient {
  res: express.Response;
  raw: boolean;
}

// Managed Host Camera Stream State (prevents AVFoundation device lock contention across reconnects)
let activeFfmpeg: ChildProcess | null = null;
let activeStreamKey = '';
let latestJpegFrame: Buffer | null = null;
let latestFrameSeq = 0;
let idleStopTimer: NodeJS.Timeout | null = null;
const streamClients = new Set<StreamClient>();

const SOI_MARKER = Buffer.from([0xff, 0xd8, 0xff]);
const EOI_MARKER = Buffer.from([0xff, 0xd9]);

function stopActiveFfmpeg() {
  if (idleStopTimer) {
    clearTimeout(idleStopTimer);
    idleStopTimer = null;
  }
  if (activeFfmpeg) {
    try {
      activeFfmpeg.kill('SIGTERM');
    } catch {
      // ignore
    }
    activeFfmpeg = null;
  }
  activeStreamKey = '';
}

function sendFrameToClient(client: StreamClient, jpegBuf: Buffer) {
  const { res, raw } = client;
  if (res.writableEnded || res.destroyed) {
    streamClients.delete(client);
    return;
  }
  try {
    if (raw) {
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32BE(jpegBuf.length, 0);
      res.write(Buffer.concat([lenBuf, jpegBuf]));
    } else {
      const header = Buffer.from(
        `--ffserver\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegBuf.length}\r\n\r\n`,
        'ascii'
      );
      const footer = Buffer.from('\r\n', 'ascii');
      res.write(Buffer.concat([header, jpegBuf, footer]));
    }
  } catch {
    streamClients.delete(client);
  }
}

function broadcastJpegFrame(jpegBuf: Buffer) {
  latestJpegFrame = jpegBuf;
  latestFrameSeq++;
  if (streamClients.size === 0) return;

  for (const client of streamClients) {
    sendFrameToClient(client, jpegBuf);
  }
}

function buildFfmpegArgs(
  driver: string,
  inputArg: string,
  width: number,
  height: number,
  fps: number,
  use720pFallback = false
): string[] {
  if (driver === 'avfoundation') {
    // Capture at 1280x720 (universally supported by all Mac FaceTime HD cameras) or 1920x1080 when >=1080p requested,
    // then fast-scale to target dimensions (e.g. 640x480) before JPEG encoding.
    const hwWidth = use720pFallback || width <= 1280 ? 1280 : 1920;
    const hwHeight = use720pFallback || height <= 720 ? 720 : 1080;
    const outW = Math.min(width, hwWidth);
    const outH = Math.min(height, hwHeight);
    const scaleArgs =
      outW !== hwWidth || outH !== hwHeight
        ? ['-vf', `scale=${outW}:${outH}:flags=fast_bilinear`]
        : [];

    return [
      '-hide_banner',
      '-loglevel',
      'error',
      '-probesize',
      '32',
      '-analyzeduration',
      '0',
      '-fflags',
      'nobuffer',
      '-flags',
      'low_delay',
      '-f',
      'avfoundation',
      '-pixel_format',
      'uyvy422',
      '-framerate',
      '30',
      '-video_size',
      `${hwWidth}x${hwHeight}`,
      '-i',
      inputArg,
      ...scaleArgs,
      '-fps_mode',
      'passthrough',
      '-threads',
      '2',
      '-thread_type',
      'slice',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-huffman',
      'default',
      '-q:v',
      '6',
      '-flush_packets',
      '1',
      'pipe:1',
    ];
  } else if (driver === 'v4l2' || driver === 'libcamera') {
    return [
      '-hide_banner',
      '-loglevel',
      'error',
      '-probesize',
      '32',
      '-analyzeduration',
      '0',
      '-fflags',
      'nobuffer',
      '-flags',
      'low_delay',
      '-f',
      'v4l2',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      inputArg,
      '-fps_mode',
      'passthrough',
      '-threads',
      '2',
      '-thread_type',
      'slice',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-huffman',
      'default',
      '-q:v',
      '6',
      '-flush_packets',
      '1',
      'pipe:1',
    ];
  } else {
    return [
      '-hide_banner',
      '-loglevel',
      'error',
      '-probesize',
      '32',
      '-analyzeduration',
      '0',
      '-fflags',
      'nobuffer',
      '-flags',
      'low_delay',
      '-f',
      'dshow',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      inputArg,
      '-fps_mode',
      'passthrough',
      '-threads',
      '2',
      '-thread_type',
      'slice',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-huffman',
      'default',
      '-q:v',
      '6',
      '-flush_packets',
      '1',
      'pipe:1',
    ];
  }
}

function ensureFfmpegStream(
  driver: string,
  inputArg: string,
  width: number,
  height: number,
  fps: number,
  use720pFallback = false
) {
  if (idleStopTimer) {
    clearTimeout(idleStopTimer);
    idleStopTimer = null;
  }

  const desiredKey = `${driver}:${inputArg}:${width}x${height}@${fps}:${use720pFallback}`;
  if (activeFfmpeg && activeStreamKey === desiredKey) {
    return;
  }

  stopActiveFfmpeg();
  activeStreamKey = desiredKey;

  const args = buildFfmpegArgs(driver, inputArg, width, height, fps, use720pFallback);
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeFfmpeg = ff;

  let accum = Buffer.alloc(0);
  let searchOffset = 0;
  let producedFrames = 0;

  ff.stdout?.on('data', (chunk: Buffer) => {
    accum = accum.length === 0 ? chunk : Buffer.concat([accum, chunk]);

    while (true) {
      const soi = accum.indexOf(SOI_MARKER);
      if (soi === -1) {
        accum = Buffer.alloc(0);
        searchOffset = 0;
        break;
      }
      if (soi > 0) {
        accum = accum.subarray(soi);
        searchOffset = Math.max(2, searchOffset - soi);
      } else if (searchOffset < 2) {
        searchOffset = 2;
      }

      const eoiPos = accum.indexOf(EOI_MARKER, searchOffset);
      if (eoiPos === -1) {
        searchOffset = Math.max(2, accum.length - 1);
        break;
      }

      const frameEnd = eoiPos + 2;
      const frame = Buffer.from(accum.subarray(0, frameEnd));
      accum = accum.subarray(frameEnd);
      searchOffset = 2;
      producedFrames++;
      broadcastJpegFrame(frame);
    }
  });

  ff.on('exit', (code) => {
    if (activeFfmpeg === ff) {
      activeFfmpeg = null;
      activeStreamKey = '';
      // If 1080p AVFoundation failed before producing any frames, automatically fallback to 720p
      if (
        code !== 0 &&
        producedFrames === 0 &&
        driver === 'avfoundation' &&
        !use720pFallback
      ) {
        ensureFfmpegStream(driver, inputArg, width, height, fps, true);
      }
    }
  });
}

// 2. Host MJPEG Live Stream Endpoint (supports ?raw=1 length-prefixed binary frames + multipart MJPEG)
app.get('/api/host-stream', async (req, res) => {
  const info = await getPlatformInfo();
  const cameras = await listHostCameras();
  const deviceId = (req.query.deviceId as string) || cameras[0]?.id;
  const width = Number(req.query.width) || 1280;
  const height = Number(req.query.height) || 720;
  const fps = Number(req.query.fps) || 30;
  const raw = req.query.raw === '1';

  const selectedCam = cameras.find((c) => c.id === deviceId) || cameras[0];

  if (!info.ffmpegAvailable || !selectedCam || selectedCam.driver === 'simulated') {
    res.status(503).json({
      error: 'FFmpeg is not installed on host or no host camera driver available. Using WebRTC engine.',
    });
    return;
  }

  req.socket?.setNoDelay(true);
  res.socket?.setNoDelay(true);

  res.writeHead(200, {
    'Content-Type': raw
      ? 'application/octet-stream'
      : 'multipart/x-mixed-replace; boundary=ffserver',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    Pragma: 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const client: StreamClient = { res, raw };
  streamClients.add(client);
  ensureFfmpegStream(selectedCam.driver, selectedCam.inputArg, width, height, fps);

  if (latestJpegFrame) {
    sendFrameToClient(client, latestJpegFrame);
  }

  req.on('close', () => {
    streamClients.delete(client);
    if (streamClients.size === 0) {
      if (idleStopTimer) clearTimeout(idleStopTimer);
      idleStopTimer = setTimeout(() => {
        if (streamClients.size === 0) {
          stopActiveFfmpeg();
        }
      }, 2500);
    }
  });
});

// Single-frame low-latency snapshot endpoint
app.get('/api/host-frame', async (req, res) => {
  const info = await getPlatformInfo();
  const cameras = await listHostCameras();
  const deviceId = (req.query.deviceId as string) || cameras[0]?.id;
  const width = Number(req.query.width) || 1280;
  const height = Number(req.query.height) || 720;
  const fps = Number(req.query.fps) || 30;

  const selectedCam = cameras.find((c) => c.id === deviceId) || cameras[0];
  if (!info.ffmpegAvailable || !selectedCam || selectedCam.driver === 'simulated') {
    res.status(503).end();
    return;
  }

  if (idleStopTimer) {
    clearTimeout(idleStopTimer);
    idleStopTimer = setTimeout(() => {
      if (streamClients.size === 0) {
        stopActiveFfmpeg();
      }
    }, 2500);
  }

  ensureFfmpegStream(selectedCam.driver, selectedCam.inputArg, width, height, fps);

  if (latestJpegFrame) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Length': String(latestJpegFrame.length),
      'X-Frame-Seq': String(latestFrameSeq),
    });
    res.end(latestJpegFrame);
  } else {
    res.status(204).end();
  }
});

// 3. Media Gallery API
app.get('/api/media', (_req, res) => {
  res.json({ items: listMediaItems() });
});

app.post('/api/media', (req, res) => {
  try {
    const {
      id,
      filename,
      dataUrl,
      type,
      format,
      mimeType,
      width,
      height,
      fps,
      durationSec,
      captureMode,
      deviceLabel,
      platform,
      quality,
      bitrateMbps,
    } = req.body;

    if (!dataUrl || !filename) {
      res.status(400).json({ error: 'Missing dataUrl or filename' });
      return;
    }

    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const buffer = Buffer.from(base64Data, 'base64');

    const saved = saveMediaItem(buffer, {
      id: id || `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filename,
      type: type || 'photo',
      format: format || 'jpg',
      mimeType: mimeType || 'image/jpeg',
      width: Number(width) || 1920,
      height: Number(height) || 1080,
      fps: fps ? Number(fps) : undefined,
      durationSec: durationSec ? Number(durationSec) : undefined,
      createdAt: new Date().toISOString(),
      captureMode: captureMode || 'single',
      deviceLabel: deviceLabel || 'Camera',
      platform: platform || 'Unknown',
      quality: quality ? Number(quality) : undefined,
      bitrateMbps: bitrateMbps ? Number(bitrateMbps) : undefined,
    });

    res.status(201).json({ item: saved });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/media/:id', (req, res) => {
  const ok = deleteMediaItem(req.params.id);
  res.json({ deleted: ok });
});

app.post('/api/media/batch-delete', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const count = deleteMultipleMediaItems(ids);
  res.json({ deletedCount: count });
});

// Serve static build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PhotonDeck Host Server] Listening on http://0.0.0.0:${PORT}`);
});
