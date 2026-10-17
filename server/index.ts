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

// 1. System & Platform Info
app.get('/api/system-info', async (_req, res) => {
  try {
    const info = await getPlatformInfo();
    const hostCameras = await listHostCameras();
    res.json({
      ...info,
      hostCameras,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 2. Host MJPEG Live Stream Endpoint (for Headless Raspberry Pi, macOS, Windows host streaming)
app.get('/api/host-stream', async (req, res) => {
  const info = await getPlatformInfo();
  const cameras = await listHostCameras();
  const deviceId = (req.query.deviceId as string) || cameras[0]?.id;
  const width = Number(req.query.width) || 1280;
  const height = Number(req.query.height) || 720;
  const fps = Number(req.query.fps) || 30;

  const selectedCam = cameras.find((c) => c.id === deviceId) || cameras[0];

  if (!info.ffmpegAvailable || !selectedCam || selectedCam.driver === 'simulated') {
    res.status(503).json({
      error: 'FFmpeg is not installed on host or no host camera driver available. Using WebRTC engine.',
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=ffserver',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'close',
    Pragma: 'no-cache',
  });

  let ffmpegArgs: string[] = [];
  if (selectedCam.driver === 'avfoundation') {
    ffmpegArgs = [
      '-f',
      'avfoundation',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      selectedCam.inputArg,
      '-f',
      'mpjpeg',
      '-Boundary_string',
      'ffserver',
      '-q:v',
      '5',
      'pipe:1',
    ];
  } else if (selectedCam.driver === 'v4l2' || selectedCam.driver === 'libcamera') {
    ffmpegArgs = [
      '-f',
      'v4l2',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      selectedCam.inputArg,
      '-f',
      'mpjpeg',
      '-Boundary_string',
      'ffserver',
      '-q:v',
      '5',
      'pipe:1',
    ];
  } else {
    ffmpegArgs = [
      '-f',
      'dshow',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      selectedCam.inputArg,
      '-f',
      'mpjpeg',
      '-Boundary_string',
      'ffserver',
      '-q:v',
      '5',
      'pipe:1',
    ];
  }

  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });

  ff.stdout.pipe(res);

  req.on('close', () => {
    ff.kill('SIGTERM');
  });
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
  console.log(`[CamStudio Host Server] Listening on http://0.0.0.0:${PORT}`);
});
