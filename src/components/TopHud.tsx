import React from 'react';
import {
  Activity,
  Camera,
  Cpu,
  FlipHorizontal,
  Grid,
  Monitor,
  RefreshCw,
  RotateCw,
  Server,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CameraDeviceOption,
  CameraSettings,
  EngineMode,
  GridOverlayType,
  SystemInfoResponse,
} from '../types/camera';

interface TopHudProps {
  settings: CameraSettings;
  updateSettings: (partial: Partial<CameraSettings>) => void;
  actualWidth: number;
  actualHeight: number;
  measuredFps: number;
  isRecording: boolean;
  recordingElapsedMs: number;
  audioLevel: number;
  videoDevices: CameraDeviceOption[];
  systemInfo: SystemInfoResponse | null;
  onRefreshDevices: () => void;
  dockOpen: boolean;
  onToggleDock: () => void;
}

const GRID_CYCLE: GridOverlayType[] = ['none', 'thirds', 'golden', 'crosshair', 'safe'];

export const TopHud: React.FC<TopHudProps> = ({
  settings,
  updateSettings,
  actualWidth,
  actualHeight,
  measuredFps,
  isRecording,
  recordingElapsedMs,
  audioLevel,
  videoDevices,
  systemInfo,
  onRefreshDevices,
  dockOpen,
  onToggleDock,
}) => {
  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    const tenths = String(Math.floor((ms % 1000) / 100));
    return `${hrs}:${mins}:${secs}.${tenths}`;
  };

  const cycleGrid = () => {
    const idx = GRID_CYCLE.indexOf(settings.gridOverlay);
    const next = GRID_CYCLE[(idx + 1) % GRID_CYCLE.length];
    updateSettings({ gridOverlay: next });
  };

  const rotateNext = () => {
    const next = ((settings.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    updateSettings({ rotationDeg: next });
  };

  const handleEngineSwitch = (mode: EngineMode) => {
    if (mode === 'host') {
      const currentDev = videoDevices.find((d) => d.id === settings.selectedVideoDeviceId);
      const firstHost = videoDevices.find((d) => d.source === 'host');
      updateSettings({
        engineMode: 'host',
        selectedVideoDeviceId:
          currentDev?.source === 'host'
            ? currentDev.id
            : firstHost?.id || settings.selectedVideoDeviceId,
      });
    } else if (mode === 'webrtc') {
      const currentDev = videoDevices.find((d) => d.id === settings.selectedVideoDeviceId);
      const firstWebrtc = videoDevices.find((d) => d.source === 'webrtc');
      updateSettings({
        engineMode: 'webrtc',
        selectedVideoDeviceId:
          currentDev?.source === 'webrtc' ? currentDev.id : firstWebrtc?.id || 'default',
      });
    } else {
      updateSettings({ engineMode: mode });
    }
  };

  const platformBadge = systemInfo?.platformLabel || 'Multi-Platform Studio';

  return (
    <header className="h-14 px-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between gap-3 z-20 shrink-0">
      {/* Left: Brand + OS Platform Badge + Engine Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Camera className="w-4 h-4 text-zinc-950 stroke-[2.5]" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-sm text-zinc-100">PHOTONDECK</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                PRO
              </span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 truncate">
              <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">{platformBadge}</span>
            </div>
          </div>
        </div>

        {/* Engine Mode Switcher (WebRTC / Host OS / Signal) */}
        <div className="hidden md:flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800 text-xs">
          <button
            onClick={() => handleEngineSwitch('webrtc')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              settings.engineMode === 'webrtc'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Direct Browser WebRTC Hardware Access"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>WebRTC</span>
          </button>
          <button
            onClick={() => handleEngineSwitch('host')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              settings.engineMode === 'host'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Host OS Camera Stream (Raspberry Pi V4L2 / macOS AVFoundation / Windows DirectShow)"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Host OS</span>
          </button>
          <button
            onClick={() => handleEngineSwitch('test-pattern')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              settings.engineMode === 'test-pattern'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="60fps Optical Test Signal Generator"
          >
            <span>Test Signal</span>
          </button>
        </div>

        {/* Camera Device Dropdown */}
        <div className="flex items-center gap-1">
          <select
            value={settings.selectedVideoDeviceId}
            onChange={(e) => {
              const val = e.target.value;
              const matched = videoDevices.find((d) => d.id === val);
              if (matched?.source === 'virtual') {
                updateSettings({ selectedVideoDeviceId: val, engineMode: 'test-pattern' });
              } else if (matched?.source === 'host') {
                updateSettings({ selectedVideoDeviceId: val, engineMode: 'host' });
              } else {
                updateSettings({ selectedVideoDeviceId: val, engineMode: 'webrtc' });
              }
            }}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 max-w-[210px] truncate focus:outline-none focus:border-amber-500"
          >
            <option value="default">Default Camera Input</option>
            {videoDevices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onRefreshDevices()}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            title="Rescan Camera Hardware"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Live Telemetry Pill & Recording Timer */}
      <div className="hidden lg:flex items-center gap-2 bg-zinc-900/90 border border-zinc-800/90 px-3 py-1 rounded-full font-mono text-xs">
        {isRecording ? (
          <div className="flex items-center gap-2 text-red-400 font-semibold pr-2 border-r border-zinc-800">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span>REC {formatTimecode(recordingElapsedMs)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-emerald-400 pr-2 border-r border-zinc-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>STANDBY</span>
          </div>
        )}
        <span className="text-zinc-200 font-semibold">
          {actualWidth}×{actualHeight}
        </span>
        <span className="text-zinc-600">•</span>
        <span className="text-amber-400">{measuredFps} FPS</span>
        <span className="text-zinc-600">•</span>
        <span className="text-zinc-300">{settings.aspectRatio}</span>
        <span className="text-zinc-600">•</span>
        <span className="text-sky-400 uppercase">
          {settings.captureMode === 'video'
            ? `${settings.videoFormat} (${settings.videoBitrateMbps}M)`
            : `${settings.photoFormat} (${settings.photoQuality}%)`}
        </span>

        {settings.audioEnabled && (
          <div className="flex items-center gap-1 pl-2 border-l border-zinc-800" title="Live Microphone Level">
            <div className="w-12 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 transition-all duration-75"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right: Quick Viewfinder Tools & Control Dock Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={cycleGrid}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors ${
            settings.gridOverlay !== 'none'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Cycle Grid Overlays (G)"
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="hidden xl:inline uppercase">{settings.gridOverlay}</span>
        </button>

        <button
          onClick={() => updateSettings({ showHistogram: !settings.showHistogram })}
          className={`p-1.5 rounded-lg border transition-colors ${
            settings.showHistogram
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle Live RGB Histogram (H)"
        >
          <Activity className="w-4 h-4" />
        </button>

        <button
          onClick={() => updateSettings({ mirrorHorizontal: !settings.mirrorHorizontal })}
          className={`p-1.5 rounded-lg border transition-colors ${
            settings.mirrorHorizontal
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Mirror Horizontal"
        >
          <FlipHorizontal className="w-4 h-4" />
        </button>

        <button
          onClick={rotateNext}
          className={`px-2 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 transition-colors ${
            settings.rotationDeg !== 0
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Rotate Viewfinder 90°"
        >
          <RotateCw className="w-3.5 h-3.5" />
          {settings.rotationDeg > 0 && <span>{settings.rotationDeg}°</span>}
        </button>

        <button
          onClick={() => updateSettings({ shutterSound: !settings.shutterSound })}
          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={settings.shutterSound ? 'Mute Shutter & Timer Tones' : 'Unmute Shutter & Timer Tones'}
        >
          {settings.shutterSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-zinc-600" />}
        </button>

        <button
          onClick={onToggleDock}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
            dockOpen
              ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle Format & Capture Settings Panel"
        >
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Controls</span>
        </button>
      </div>
    </header>
  );
};
