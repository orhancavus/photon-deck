import React from 'react';
import { Camera, Clock, Film, Images, Layers, Pause, Play, Square } from 'lucide-react';
import { CameraSettings, CaptureMode, MediaItem } from '../types/camera';

interface ShutterBarProps {
  settings: CameraSettings;
  updateSettings: (partial: Partial<CameraSettings>) => void;
  isRecording: boolean;
  isPaused: boolean;
  burstActive: boolean;
  timelapseActive: boolean;
  onTriggerPrimary: () => void;
  onTogglePause: () => void;
  onQuickSnapshot: () => void;
  mediaItems: MediaItem[];
  onOpenGallery: () => void;
}

const MODES: Array<{ id: CaptureMode; label: string; icon: React.ReactNode; shortcut: string }> = [
  { id: 'single', label: 'Photo', icon: <Camera className="w-3.5 h-3.5" />, shortcut: '1' },
  { id: 'video', label: 'Video', icon: <Film className="w-3.5 h-3.5" />, shortcut: '2' },
  { id: 'burst', label: 'Burst', icon: <Layers className="w-3.5 h-3.5" />, shortcut: '3' },
  { id: 'timelapse', label: 'Time-Lapse', icon: <Clock className="w-3.5 h-3.5" />, shortcut: '4' },
];

export const ShutterBar: React.FC<ShutterBarProps> = ({
  settings,
  updateSettings,
  isRecording,
  isPaused,
  burstActive,
  timelapseActive,
  onTriggerPrimary,
  onTogglePause,
  onQuickSnapshot,
  mediaItems,
  onOpenGallery,
}) => {
  const latestItem = mediaItems[0];

  return (
    <footer className="h-24 px-6 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/90 flex items-center justify-between gap-4 z-20 shrink-0 select-none">
      {/* Left: Capture Mode Selector Pills */}
      <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
        {MODES.map((m) => {
          const active = settings.captureMode === m.id;
          return (
            <button
              key={m.id}
              disabled={isRecording}
              onClick={() => updateSettings({ captureMode: m.id })}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                active
                  ? m.id === 'video'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-40'
              }`}
              title={`Switch to ${m.label} mode (${m.shortcut})`}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Center: Tactile Shutter / Record Controls */}
      <div className="flex items-center gap-4">
        {/* Pause/Resume button while recording video */}
        {isRecording && (
          <button
            onClick={onTogglePause}
            className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-700 hover:border-amber-400 flex items-center justify-center text-zinc-200 transition-all shadow-lg"
            title={isPaused ? 'Resume Recording' : 'Pause Recording'}
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            ) : (
              <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
            )}
          </button>
        )}

        {/* Primary Shutter / Record Button */}
        <button
          onClick={onTriggerPrimary}
          className="group relative w-16 h-16 rounded-full p-1 border-2 border-zinc-300 hover:border-amber-400 transition-all flex items-center justify-center active:scale-95 shadow-xl"
          title="Trigger Shutter / Record (Spacebar)"
        >
          {settings.captureMode === 'video' ? (
            isRecording ? (
              <div className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center transition-all">
                <Square className="w-4 h-4 text-white fill-white" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-red-500 group-hover:bg-red-400 transition-all shadow-inner" />
            )
          ) : burstActive || timelapseActive ? (
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center">
              <Square className="w-4 h-4 text-zinc-950 fill-zinc-950" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-amber-400 transition-colors shadow-inner" />
          )}
        </button>

        {/* Still Frame Snapshot while Video Recording */}
        {isRecording && (
          <button
            onClick={onQuickSnapshot}
            className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-400 flex items-center justify-center text-zinc-200 transition-all shadow-lg"
            title="Take Still Photo Snapshot While Recording"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Right: Media Gallery Quick Preview Button */}
      <div className="flex items-center justify-end min-w-[150px]">
        <button
          onClick={onOpenGallery}
          className="flex items-center gap-3 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 rounded-xl p-1.5 pr-3.5 transition-all group"
          title="Open Media Gallery & Inspector (M)"
        >
          <div className="w-11 h-11 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center relative">
            {latestItem ? (
              latestItem.type === 'photo' ? (
                <img
                  src={latestItem.dataUrl || latestItem.url}
                  alt={latestItem.filename}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={latestItem.dataUrl || latestItem.url}
                  className="w-full h-full object-cover"
                  muted
                />
              )
            ) : (
              <Images className="w-5 h-5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            )}
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300 transition-colors">
              Media Gallery
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              {mediaItems.length} {mediaItems.length === 1 ? 'capture' : 'captures'}
            </div>
          </div>
        </button>
      </div>
    </footer>
  );
};
