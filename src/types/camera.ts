export type EngineMode = 'webrtc' | 'host' | 'test-pattern';

export type ResolutionPreset = '4k' | '1080p' | '720p' | '480p';

export type AspectRatioOption = '16:9' | '4:3' | '1:1' | '9:16';

export type FrameRateOption = 24 | 30 | 60;

export type PhotoFormat = 'jpeg' | 'png' | 'webp';

export type VideoFormat = 'mp4' | 'webm';

export type CaptureMode = 'single' | 'video' | 'burst' | 'timelapse';

export type GridOverlayType = 'none' | 'thirds' | 'golden' | 'crosshair' | 'safe';

export interface ResolutionSpec {
  id: ResolutionPreset;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: Record<ResolutionPreset, ResolutionSpec> = {
  '4k': { id: '4k', label: '4K UHD (3840×2160)', shortLabel: '4K UHD', width: 3840, height: 2160 },
  '1080p': { id: '1080p', label: '1080p FHD (1920×1080)', shortLabel: '1080p FHD', width: 1920, height: 1080 },
  '720p': { id: '720p', label: '720p HD (1280×720)', shortLabel: '720p HD', width: 1280, height: 720 },
  '480p': { id: '480p', label: '480p SD (640×480)', shortLabel: '480p SD', width: 640, height: 480 },
};

export interface CameraSettings {
  engineMode: EngineMode;
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
  resolution: ResolutionPreset;
  aspectRatio: AspectRatioOption;
  fps: FrameRateOption;
  photoFormat: PhotoFormat;
  photoQuality: number; // 10 - 100
  videoFormat: VideoFormat;
  videoBitrateMbps: number; // 2.5 - 35
  audioEnabled: boolean;
  captureMode: CaptureMode;
  timerDelaySec: 0 | 3 | 5 | 10;
  burstCount: 3 | 5 | 10;
  burstIntervalMs: 100 | 250 | 500;
  timelapseIntervalSec: 1 | 2 | 5 | 10 | 30;
  timelapseMaxFrames: number; // 10 - 300
  gridOverlay: GridOverlayType;
  showHistogram: boolean;
  mirrorHorizontal: boolean;
  rotationDeg: 0 | 90 | 180 | 270;
  digitalZoom: number; // 1.0 - 5.0
  shutterSound: boolean;
}

export interface CameraDeviceOption {
  id: string;
  label: string;
  source: 'webrtc' | 'host' | 'virtual';
}

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  dataUrl?: string;
  type: 'photo' | 'video';
  format: string;
  mimeType: string;
  width: number;
  height: number;
  fps?: number;
  durationSec?: number;
  sizeBytes: number;
  createdAt: string;
  captureMode: 'single' | 'video' | 'burst' | 'timelapse' | 'timer';
  deviceLabel: string;
  platform: string;
  quality?: number;
  bitrateMbps?: number;
}

export interface SystemInfoResponse {
  platform: 'macos' | 'raspberrypi' | 'linux' | 'windows';
  platformLabel: string;
  arch: string;
  hostname: string;
  driver: string;
  ffmpegAvailable: boolean;
  rpicamAvailable: boolean;
  hostCameras: Array<{
    id: string;
    label: string;
    driver: string;
    inputArg: string;
  }>;
  serverTime: string;
}
