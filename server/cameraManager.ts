import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export interface HostCameraDevice {
  id: string;
  label: string;
  driver: 'avfoundation' | 'v4l2' | 'libcamera' | 'dshow' | 'simulated';
  inputArg: string;
}

export interface PlatformInfo {
  platform: 'macos' | 'raspberrypi' | 'linux' | 'windows';
  platformLabel: string;
  arch: string;
  hostname: string;
  driver: string;
  ffmpegAvailable: boolean;
  rpicamAvailable: boolean;
}

let cachedPlatformInfo: PlatformInfo | null = null;
let cachedHostCameras: HostCameraDevice[] | null = null;
let cachedHostCamerasAt = 0;

export async function getPlatformInfo(forceRefresh = false): Promise<PlatformInfo> {
  if (cachedPlatformInfo && !forceRefresh) {
    return cachedPlatformInfo;
  }

  const rawPlatform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();

  let isRaspberryPi = false;
  if (rawPlatform === 'linux') {
    try {
      const model = fs.readFileSync('/proc/device-tree/model', 'utf8');
      if (model.toLowerCase().includes('raspberry pi')) {
        isRaspberryPi = true;
      }
    } catch {
      // ignore if /proc/device-tree/model doesn't exist
    }
  }

  let ffmpegAvailable = false;
  try {
    await execAsync('ffmpeg -version');
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }

  let rpicamAvailable = false;
  if (rawPlatform === 'linux') {
    try {
      await execAsync('rpicam-vid --version || libcamera-vid --version');
      rpicamAvailable = true;
    } catch {
      rpicamAvailable = false;
    }
  }

  if (rawPlatform === 'darwin') {
    cachedPlatformInfo = {
      platform: 'macos',
      platformLabel: 'macOS (AVFoundation)',
      arch,
      hostname,
      driver: 'avfoundation',
      ffmpegAvailable,
      rpicamAvailable: false,
    };
  } else if (isRaspberryPi) {
    cachedPlatformInfo = {
      platform: 'raspberrypi',
      platformLabel: 'Raspberry Pi OS (V4L2 / libcamera)',
      arch,
      hostname,
      driver: rpicamAvailable ? 'libcamera' : 'v4l2',
      ffmpegAvailable,
      rpicamAvailable,
    };
  } else if (rawPlatform === 'win32') {
    cachedPlatformInfo = {
      platform: 'windows',
      platformLabel: 'Windows (DirectShow / MediaFoundation)',
      arch,
      hostname,
      driver: 'dshow',
      ffmpegAvailable,
      rpicamAvailable: false,
    };
  } else {
    cachedPlatformInfo = {
      platform: 'linux',
      platformLabel: 'Linux (Video4Linux2)',
      arch,
      hostname,
      driver: 'v4l2',
      ffmpegAvailable,
      rpicamAvailable,
    };
  }

  return cachedPlatformInfo;
}

export async function listHostCameras(forceRefresh = false): Promise<HostCameraDevice[]> {
  const now = Date.now();
  if (cachedHostCameras && !forceRefresh && now - cachedHostCamerasAt < 1500) {
    return cachedHostCameras;
  }

  const info = await getPlatformInfo(forceRefresh);
  const devices: HostCameraDevice[] = [];

  if (!info.ffmpegAvailable) {
    cachedHostCameras = [
      {
        id: 'host-default',
        label: `${info.platformLabel} Default Camera`,
        driver: 'simulated',
        inputArg: '0',
      },
    ];
    cachedHostCamerasAt = Date.now();
    return cachedHostCameras;
  }

  try {
    if (info.platform === 'macos') {
      // 1. Query system_profiler SPCameraDataType first: this wakes up CoreMediaIO Continuity Camera DAL
      // and discovers iPhone Continuity Cameras on the same Apple ID & network even when FFmpeg's
      // deprecated [AVCaptureDevice devicesWithMediaType:] API omits them.
      let profilerNames: string[] = [];
      try {
        const { stdout } = await execAsync('system_profiler SPCameraDataType -json 2>/dev/null || true');
        if (stdout && stdout.trim().startsWith('{')) {
          const parsed = JSON.parse(stdout);
          const items = Array.isArray(parsed?.SPCameraDataType) ? parsed.SPCameraDataType : [];
          for (const item of items) {
            const rawName = typeof item?._name === 'string' ? item._name.trim() : '';
            if (rawName && !rawName.toLowerCase().includes('capture screen')) {
              profilerNames.push(rawName);
            }
          }
        }
      } catch {
        // ignore system_profiler parse errors
      }

      // 2. Query FFmpeg AVFoundation device list
      const { stderr } = await execAsync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true');
      const lines = (stderr || '').split('\n');
      let inVideoSection = false;
      for (const line of lines) {
        if (line.includes('AVFoundation video devices:')) {
          inVideoSection = true;
          continue;
        }
        if (line.includes('AVFoundation audio devices:')) {
          break;
        }
        if (inVideoSection) {
          const match = line.match(/\[(\d+)\]\s+(.+)$/);
          if (match) {
            const index = match[1];
            const name = match[2].trim();
            if (!name.toLowerCase().includes('capture screen')) {
              devices.push({
                id: `avfoundation-${index}`,
                label: `${name} (Host AVFoundation)`,
                driver: 'avfoundation',
                inputArg: `${index}:none`,
              });
            }
          }
        }
      }

      // 3. Ensure any Continuity Camera / iPhone Camera found by macOS system_profiler is also listed
      for (const camName of profilerNames) {
        const norm = camName.toLowerCase();
        const alreadyListed = devices.some((d) => d.label.toLowerCase().includes(norm));
        if (!alreadyListed) {
          const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          devices.push({
            id: `avfoundation-name-${slug}`,
            label: `${camName} (Host AVFoundation)`,
            driver: 'avfoundation',
            inputArg: `${camName}:none`,
          });
        }
      }
    } else if (info.platform === 'linux' || info.platform === 'raspberrypi') {
      // Check /dev/video* devices
      const devFiles = fs.readdirSync('/dev').filter((f) => /^video\d+$/.test(f));
      for (const file of devFiles.slice(0, 4)) {
        devices.push({
          id: `v4l2-${file}`,
          label: `/dev/${file} (${info.platform === 'raspberrypi' ? 'Raspberry Pi V4L2/CSI' : 'V4L2 Camera'})`,
          driver: 'v4l2',
          inputArg: `/dev/${file}`,
        });
      }
    } else if (info.platform === 'windows') {
      const { stderr } = await execAsync('ffmpeg -list_devices true -f dshow -i dummy || true');
      const lines = stderr.split('\n');
      for (const line of lines) {
        const match = line.match(/"([^"]+)"\s+\(video\)/);
        if (match) {
          const name = match[1];
          devices.push({
            id: `dshow-${name}`,
            label: `${name} (Host DirectShow)`,
            driver: 'dshow',
            inputArg: `video=${name}`,
          });
        }
      }
    }
  } catch {
    // Fallback if probing fails
  }

  if (devices.length === 0) {
    devices.push({
      id: 'host-default-0',
      label: `Host Hardware Camera (${info.driver})`,
      driver: info.driver as HostCameraDevice['driver'],
      inputArg: info.platform === 'macos' ? '0:none' : info.platform === 'windows' ? 'video=Integrated Camera' : '/dev/video0',
    });
  }

  cachedHostCameras = devices;
  cachedHostCamerasAt = Date.now();
  return devices;
}
