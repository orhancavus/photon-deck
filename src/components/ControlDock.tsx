import React, { useState } from 'react';
import {
  AspectRatioOption,
  CameraSettings,
  FrameRateOption,
  PhotoFormat,
  RESOLUTION_PRESETS,
  ResolutionPreset,
  VideoFormat,
} from '../types/camera';
import {
  Clock,
  Film,
  Image as ImageIcon,
  Layers,
  Mic,
  MicOff,
  Settings2,
  Sparkles,
  Timer,
} from 'lucide-react';

interface ControlDockProps {
  settings: CameraSettings;
  updateSettings: (partial: Partial<CameraSettings>) => void;
  audioDevices: Array<{ id: string; label: string }>;
  actualWidth: number;
  actualHeight: number;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  settings,
  updateSettings,
  audioDevices,
  actualWidth,
  actualHeight,
}) => {
  const [activeTab, setActiveTab] = useState<'format' | 'capture'>('format');

  // Estimate photo file size in KB based on resolution, format, and quality
  const pixels = actualWidth * actualHeight;
  const formatFactor =
    settings.photoFormat === 'png'
      ? 1.4
      : settings.photoFormat === 'webp'
      ? 0.22 * (settings.photoQuality / 100)
      : 0.34 * (settings.photoQuality / 100);
  const estPhotoSizeKb = Math.max(45, Math.round((pixels * formatFactor) / 1024));

  return (
    <aside className="w-80 bg-zinc-950/95 border-l border-zinc-800/90 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Dock Header Tabs */}
      <div className="grid grid-cols-2 p-2 gap-1 bg-zinc-900/60 border-b border-zinc-800/80">
        <button
          onClick={() => setActiveTab('format')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'format'
              ? 'bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700/80'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Stream & Formats</span>
        </button>
        <button
          onClick={() => setActiveTab('capture')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'capture'
              ? 'bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700/80'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Capture Modes</span>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'format' ? (
          <>
            {/* Resolution Preset */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Sensor Resolution
                </label>
                <span className="text-[11px] font-mono text-amber-400">
                  {actualWidth}×{actualHeight}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(RESOLUTION_PRESETS) as ResolutionPreset[]).map((resKey) => {
                  const spec = RESOLUTION_PRESETS[resKey];
                  const active = settings.resolution === resKey;
                  return (
                    <button
                      key={resKey}
                      onClick={() => updateSettings({ resolution: resKey })}
                      className={`px-3 py-2 rounded-lg border text-left transition-all ${
                        active
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                          : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{spec.shortLabel}</div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {spec.width}×{spec.height}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect Ratio & Frame Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {(['16:9', '4:3', '1:1', '9:16'] as AspectRatioOption[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => updateSettings({ aspectRatio: ratio })}
                      className={`py-1.5 rounded-md border text-xs font-mono transition-colors ${
                        settings.aspectRatio === ratio
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Frame Rate
                </label>
                <div className="grid grid-cols-1 gap-1">
                  {([24, 30, 60] as FrameRateOption[]).map((fps) => (
                    <button
                      key={fps}
                      onClick={() => updateSettings({ fps })}
                      className={`py-1 rounded-md border text-xs font-mono transition-colors ${
                        settings.fps === fps
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {fps} FPS {fps === 24 ? '(Cinema)' : fps === 60 ? '(Smooth)' : '(Std)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Photo Format & Quality */}
            <div className="pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  Photo Format
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  ~{estPhotoSizeKb > 1024 ? `${(estPhotoSizeKb / 1024).toFixed(1)} MB` : `${estPhotoSizeKb} KB`} / shot
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {(
                  [
                    { id: 'jpeg', label: 'JPEG', desc: 'Universal' },
                    { id: 'png', label: 'PNG', desc: 'Lossless' },
                    { id: 'webp', label: 'WebP', desc: 'Modern' },
                  ] as Array<{ id: PhotoFormat; label: string; desc: string }>
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => updateSettings({ photoFormat: fmt.id })}
                    className={`py-2 px-2 rounded-lg border text-center transition-all ${
                      settings.photoFormat === fmt.id
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{fmt.label}</div>
                    <div className="text-[9px] text-zinc-500">{fmt.desc}</div>
                  </button>
                ))}
              </div>

              {settings.photoFormat !== 'png' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Compression Quality</span>
                    <span className="font-mono text-amber-400 font-semibold">
                      {settings.photoQuality}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={2}
                    value={settings.photoQuality}
                    onChange={(e) => updateSettings({ photoQuality: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Video Container, Codec & Bitrate */}
            <div className="pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-sky-400" />
                  Video Container & Bitrate
                </span>
                <span className="text-[10px] font-mono text-sky-400">
                  {settings.videoBitrateMbps} Mbps
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {(
                  [
                    { id: 'mp4', label: 'MP4 (H.264/AVC)', desc: 'macOS / Windows / Pi' },
                    { id: 'webm', label: 'WebM (VP9/VP8)', desc: 'High Web Efficiency' },
                  ] as Array<{ id: VideoFormat; label: string; desc: string }>
                ).map((vfmt) => (
                  <button
                    key={vfmt.id}
                    onClick={() => updateSettings({ videoFormat: vfmt.id })}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      settings.videoFormat === vfmt.id
                        ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{vfmt.label}</div>
                    <div className="text-[9px] text-zinc-500">{vfmt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Target Video Bitrate</span>
                  <span className="font-mono text-sky-400">{settings.videoBitrateMbps} Mbps</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={35}
                  step={0.5}
                  value={settings.videoBitrateMbps}
                  onChange={(e) => updateSettings({ videoBitrateMbps: Number(e.target.value) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1 pt-1">
                  {[
                    { label: 'Low', val: 2.5 },
                    { label: 'Std', val: 8 },
                    { label: 'High', val: 16 },
                    { label: 'Cinema', val: 32 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => updateSettings({ videoBitrateMbps: preset.val })}
                      className={`py-1 rounded text-[10px] font-mono border ${
                        settings.videoBitrateMbps === preset.val
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Self-Timer Delay */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
                <Timer className="w-3.5 h-3.5 text-amber-400" />
                Self-Timer Countdown
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([0, 3, 5, 10] as const).map((sec) => (
                  <button
                    key={sec}
                    onClick={() => updateSettings({ timerDelaySec: sec })}
                    className={`py-2 rounded-lg border text-xs font-mono transition-all ${
                      settings.timerDelaySec === sec
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sec === 0 ? 'OFF' : `${sec}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Burst Mode Settings */}
            <div className="pt-3 border-t border-zinc-800/80">
              <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Burst Sequence Settings
              </label>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Shots per Burst</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([3, 5, 10] as const).map((cnt) => (
                      <button
                        key={cnt}
                        onClick={() => updateSettings({ burstCount: cnt })}
                        className={`py-1.5 rounded-lg border text-xs font-mono ${
                          settings.burstCount === cnt
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {cnt} Shots
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Burst Interval</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([100, 250, 500] as const).map((ms) => (
                      <button
                        key={ms}
                        onClick={() => updateSettings({ burstIntervalMs: ms })}
                        className={`py-1.5 rounded-lg border text-xs font-mono ${
                          settings.burstIntervalMs === ms
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {ms} ms
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Time-Lapse Settings */}
            <div className="pt-3 border-t border-zinc-800/80">
              <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Time-Lapse Intervalometer
              </label>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Capture Interval</span>
                  <div className="grid grid-cols-5 gap-1">
                    {([1, 2, 5, 10, 30] as const).map((sec) => (
                      <button
                        key={sec}
                        onClick={() => updateSettings({ timelapseIntervalSec: sec })}
                        className={`py-1.5 rounded-lg border text-xs font-mono ${
                          settings.timelapseIntervalSec === sec
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Total Frame Limit</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {settings.timelapseMaxFrames} frames
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={settings.timelapseMaxFrames}
                    onChange={(e) =>
                      updateSettings({ timelapseMaxFrames: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Audio Input & Microphone */}
            <div className="pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  {settings.audioEnabled ? (
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  Video Audio Track
                </span>
                <button
                  onClick={() => updateSettings({ audioEnabled: !settings.audioEnabled })}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                    settings.audioEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                  }`}
                >
                  {settings.audioEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>

              {settings.audioEnabled && (
                <select
                  value={settings.selectedAudioDeviceId}
                  onChange={(e) => updateSettings({ selectedAudioDeviceId: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="default">System Default Microphone</option>
                  {audioDevices.map((mic) => (
                    <option key={mic.id} value={mic.id}>
                      {mic.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
