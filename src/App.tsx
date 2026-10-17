import React, { useCallback, useEffect, useState } from 'react';
import { CameraSettings, GridOverlayType } from './types/camera';
import { useCameraEngine } from './hooks/useCameraEngine';
import { useHistogram } from './hooks/useHistogram';
import { TopHud } from './components/TopHud';
import { Viewfinder } from './components/Viewfinder';
import { ControlDock } from './components/ControlDock';
import { ShutterBar } from './components/ShutterBar';
import { MediaGallery } from './components/MediaGallery';

const DEFAULT_SETTINGS: CameraSettings = {
  engineMode: 'webrtc',
  selectedVideoDeviceId: 'default',
  selectedAudioDeviceId: 'default',
  resolution: '1080p',
  aspectRatio: '16:9',
  fps: 30,
  photoFormat: 'jpeg',
  photoQuality: 92,
  videoFormat: 'mp4',
  videoBitrateMbps: 12,
  audioEnabled: true,
  captureMode: 'single',
  timerDelaySec: 0,
  burstCount: 5,
  burstIntervalMs: 250,
  timelapseIntervalSec: 2,
  timelapseMaxFrames: 30,
  gridOverlay: 'thirds',
  showHistogram: true,
  mirrorHorizontal: false,
  rotationDeg: 0,
  digitalZoom: 1,
  shutterSound: true,
};

const GRID_ORDER: GridOverlayType[] = ['none', 'thirds', 'golden', 'crosshair', 'safe'];

export function App() {
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [galleryOpen, setGalleryOpen] = useState<boolean>(false);

  const updateSettings = useCallback((partial: Partial<CameraSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const {
    videoRef,
    hostImgRef,
    canvasRef,
    state,
    triggerPrimaryAction,
    togglePauseRecording,
    captureSingleFrame,
    setMediaItems,
    refreshEnvironment,
  } = useCameraEngine(settings, updateSettings);

  const histogramData = useHistogram(canvasRef, settings.showHistogram);

  // Global Studio Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!galleryOpen) {
          triggerPrimaryAction();
        }
      } else if (e.key === '1' && !state.isRecording) {
        updateSettings({ captureMode: 'single' });
      } else if (e.key === '2' && !state.isRecording) {
        updateSettings({ captureMode: 'video' });
      } else if (e.key === '3' && !state.isRecording) {
        updateSettings({ captureMode: 'burst' });
      } else if (e.key === '4' && !state.isRecording) {
        updateSettings({ captureMode: 'timelapse' });
      } else if (e.key.toLowerCase() === 'g') {
        const nextIdx = (GRID_ORDER.indexOf(settings.gridOverlay) + 1) % GRID_ORDER.length;
        updateSettings({ gridOverlay: GRID_ORDER[nextIdx] });
      } else if (e.key.toLowerCase() === 'h') {
        updateSettings({ showHistogram: !settings.showHistogram });
      } else if (e.key.toLowerCase() === 'm') {
        setGalleryOpen((prev) => !prev);
      } else if (e.key === 'Escape' && galleryOpen) {
        setGalleryOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    galleryOpen,
    triggerPrimaryAction,
    state.isRecording,
    settings.gridOverlay,
    settings.showHistogram,
    updateSettings,
  ]);

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Top Camera Telemetry & Hardware HUD */}
      <TopHud
        settings={settings}
        updateSettings={updateSettings}
        actualWidth={state.actualWidth}
        actualHeight={state.actualHeight}
        measuredFps={state.measuredFps}
        isRecording={state.isRecording}
        recordingElapsedMs={state.recordingElapsedMs}
        audioLevel={state.audioLevel}
        videoDevices={state.videoDevices}
        systemInfo={state.systemInfo}
        onRefreshDevices={refreshEnvironment}
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((prev) => !prev)}
      />

      {/* Center Workspace: Viewfinder + Collapsible Right Control Dock */}
      <div className="flex-1 flex overflow-hidden relative">
        <Viewfinder
          videoRef={videoRef}
          hostImgRef={hostImgRef}
          canvasRef={canvasRef}
          settings={settings}
          updateSettings={updateSettings}
          histogramData={histogramData}
          shutterFlash={state.shutterFlash}
          countdownRemaining={state.countdownRemaining}
          burstProgress={state.burstProgress}
          timelapseProgress={state.timelapseProgress}
          errorMsg={state.errorMsg}
        />

        {dockOpen && (
          <ControlDock
            settings={settings}
            updateSettings={updateSettings}
            audioDevices={state.audioDevices}
            actualWidth={state.actualWidth}
            actualHeight={state.actualHeight}
          />
        )}
      </div>

      {/* Bottom Tactile Shutter & Mode Bar */}
      <ShutterBar
        settings={settings}
        updateSettings={updateSettings}
        isRecording={state.isRecording}
        isPaused={state.isPaused}
        burstActive={Boolean(state.burstProgress)}
        timelapseActive={Boolean(state.timelapseProgress)}
        onTriggerPrimary={triggerPrimaryAction}
        onTogglePause={togglePauseRecording}
        onQuickSnapshot={() => captureSingleFrame('single', '_SNAP')}
        mediaItems={state.mediaItems}
        onOpenGallery={() => setGalleryOpen(true)}
      />

      {/* Fullscreen Media Gallery & Inspector Modal */}
      {galleryOpen && (
        <MediaGallery
          items={state.mediaItems}
          setMediaItems={setMediaItems}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
