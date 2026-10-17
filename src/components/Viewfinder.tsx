import React from 'react';
import { CameraSettings, RESOLUTION_PRESETS } from '../types/camera';
import { HistogramData } from '../hooks/useHistogram';
import { HistogramWidget } from './HistogramWidget';
import { AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';

interface ViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hostImgRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: CameraSettings;
  updateSettings: (partial: Partial<CameraSettings>) => void;
  histogramData: HistogramData;
  shutterFlash: boolean;
  countdownRemaining: number | null;
  burstProgress: { current: number; total: number } | null;
  timelapseProgress: { current: number; total: number } | null;
  errorMsg: string | null;
}

export const Viewfinder: React.FC<ViewfinderProps> = ({
  videoRef,
  hostImgRef,
  canvasRef,
  settings,
  updateSettings,
  histogramData,
  shutterFlash,
  countdownRemaining,
  burstProgress,
  timelapseProgress,
  errorMsg,
}) => {
  const preset = RESOLUTION_PRESETS[settings.resolution];
  const hostStreamUrl = `/api/host-stream?deviceId=${encodeURIComponent(
    settings.selectedVideoDeviceId
  )}&width=${preset.width}&height=${preset.height}&fps=${settings.fps}`;

  return (
    <div className="relative flex-1 bg-zinc-950 flex items-center justify-center overflow-hidden select-none p-3 sm:p-6">
      {/* Hidden raw media elements feeding the real-time compositor canvas */}
      <video ref={videoRef} playsInline muted className="hidden" />
      {settings.engineMode === 'host' && (
        <img
          ref={hostImgRef}
          src={hostStreamUrl}
          crossOrigin="anonymous"
          alt="Host Stream"
          className="hidden"
          onError={() => {
            updateSettings({ engineMode: 'test-pattern' });
          }}
        />
      )}

      {/* Main Viewfinder Frame */}
      <div className="relative max-w-full max-h-full flex items-center justify-center rounded-xl overflow-hidden shadow-2xl border border-zinc-800/90 bg-black">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[calc(100vh-11rem)] w-auto h-auto object-contain block"
        />

        {/* Cinema Corner Reticles */}
        <div className="pointer-events-none absolute inset-3">
          <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-amber-400/60" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-amber-400/60" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-amber-400/60" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-amber-400/60" />
        </div>

        {/* Grid Overlays */}
        {settings.gridOverlay === 'thirds' && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            <div className="border-r border-b border-white/25" />
            <div className="border-r border-b border-white/25" />
            <div className="border-b border-white/25" />
            <div className="border-r border-b border-white/25" />
            <div className="border-r border-b border-white/25" />
            <div className="border-b border-white/25" />
            <div className="border-r border-white/25" />
            <div className="border-r border-white/25" />
            <div />
          </div>
        )}

        {settings.gridOverlay === 'golden' && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-[38.2%] border-l border-amber-300/35" />
            <div className="absolute inset-y-0 left-[61.8%] border-l border-amber-300/35" />
            <div className="absolute inset-x-0 top-[38.2%] border-t border-amber-300/35" />
            <div className="absolute inset-x-0 top-[61.8%] border-t border-amber-300/35" />
          </div>
        )}

        {settings.gridOverlay === 'crosshair' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-[1px] bg-amber-400/80" />
            <div className="h-12 w-[1px] bg-amber-400/80 absolute" />
            <div className="w-6 h-6 rounded-full border border-amber-400/60 absolute" />
          </div>
        )}

        {settings.gridOverlay === 'safe' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[90%] h-[90%] border border-dashed border-sky-400/45 flex items-center justify-center">
              <div className="w-[88.8%] h-[88.8%] border border-white/25" />
            </div>
          </div>
        )}

        {/* Shutter Flash Effect */}
        {shutterFlash && (
          <div className="pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-100" />
        )}

        {/* Self-Timer Countdown Overlay */}
        {countdownRemaining !== null && (
          <div className="pointer-events-none absolute inset-0 bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center">
            <div className="w-28 h-28 rounded-full border-4 border-amber-400/80 flex items-center justify-center bg-zinc-950/80 shadow-2xl animate-pulse">
              <span className="text-6xl font-bold font-mono text-amber-400">
                {countdownRemaining}
              </span>
            </div>
            <span className="mt-3 text-xs font-mono uppercase tracking-widest text-zinc-200">
              Self-Timer Armed
            </span>
          </div>
        )}

        {/* Burst / Time-lapse Active Progress Pill */}
        {(burstProgress || timelapseProgress) && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-zinc-950/90 border border-amber-500/50 text-amber-300 px-4 py-1.5 rounded-full font-mono text-xs shadow-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            {burstProgress && (
              <span>
                BURST CAPTURE {burstProgress.current} / {burstProgress.total}
              </span>
            )}
            {timelapseProgress && (
              <span>
                TIME-LAPSE FRAME {timelapseProgress.current} / {timelapseProgress.total} (
                {settings.timelapseIntervalSec}s interval)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Floating Live Histogram */}
      {settings.showHistogram && (
        <div className="absolute top-4 left-4 z-10">
          <HistogramWidget
            data={histogramData}
            onClose={() => updateSettings({ showHistogram: false })}
          />
        </div>
      )}

      {/* Floating Digital Zoom Pill */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800 rounded-full px-3 py-1.5 shadow-xl">
        <button
          onClick={() =>
            updateSettings({
              digitalZoom: Math.max(1, Number((settings.digitalZoom - 0.5).toFixed(1))),
            })
          }
          className="text-zinc-400 hover:text-zinc-100"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1 text-[11px] font-mono">
          {[1, 1.5, 2, 3, 5].map((z) => (
            <button
              key={z}
              onClick={() => updateSettings({ digitalZoom: z })}
              className={`px-1.5 py-0.5 rounded-full transition-colors ${
                settings.digitalZoom === z
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {z}x
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            updateSettings({
              digitalZoom: Math.min(5, Number((settings.digitalZoom + 0.5).toFixed(1))),
            })
          }
          className="text-zinc-400 hover:text-zinc-100"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Notice Banner if fell back to Test Signal */}
      {errorMsg && (
        <div className="absolute top-4 right-4 max-w-sm bg-zinc-900/95 border border-amber-500/40 text-zinc-200 px-3.5 py-2 rounded-xl text-xs flex items-start gap-2.5 shadow-xl z-10">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-amber-300 block">Studio Signal Active</span>
            <span className="text-zinc-400 text-[11px]">{errorMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
};
