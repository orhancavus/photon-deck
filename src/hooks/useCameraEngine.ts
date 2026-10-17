import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CameraDeviceOption,
  CameraSettings,
  MediaItem,
  RESOLUTION_PRESETS,
  SystemInfoResponse,
} from '../types/camera';
import { fetchAllMedia, fetchSystemInfo, persistMediaItem } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export interface CameraEngineState {
  isStreaming: boolean;
  isRecording: boolean;
  isPaused: boolean;
  recordingElapsedMs: number;
  countdownRemaining: number | null;
  burstProgress: { current: number; total: number } | null;
  timelapseProgress: { current: number; total: number } | null;
  shutterFlash: boolean;
  actualWidth: number;
  actualHeight: number;
  measuredFps: number;
  audioLevel: number;
  errorMsg: string | null;
  videoDevices: CameraDeviceOption[];
  audioDevices: Array<{ id: string; label: string }>;
  systemInfo: SystemInfoResponse | null;
  mediaItems: MediaItem[];
}

export function useCameraEngine(
  settings: CameraSettings,
  updateSettings: (partial: Partial<CameraSettings>) => void
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hostImgRef = useRef<HTMLImageElement | null>(null);
  const hostBitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordAccumulatedMsRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);

  const timelapseAbortRef = useRef<boolean>(false);
  const burstAbortRef = useRef<boolean>(false);

  const [state, setState] = useState<CameraEngineState>({
    isStreaming: false,
    isRecording: false,
    isPaused: false,
    recordingElapsedMs: 0,
    countdownRemaining: null,
    burstProgress: null,
    timelapseProgress: null,
    shutterFlash: false,
    actualWidth: 1920,
    actualHeight: 1080,
    measuredFps: settings.fps,
    audioLevel: 0,
    errorMsg: null,
    videoDevices: [],
    audioDevices: [],
    systemInfo: null,
    mediaItems: [],
  });

  // Load initial system info, devices, and gallery
  const refreshEnvironment = useCallback(async (forceRefresh = false) => {
    const [sysInfo, media] = await Promise.all([
      fetchSystemInfo(forceRefresh),
      fetchAllMedia(),
    ]);

    const videoList: CameraDeviceOption[] = [];
    const audioList: Array<{ id: string; label: string }> = [];

    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        let vIdx = 1;
        let aIdx = 1;
        for (const d of devs) {
          if (d.kind === 'videoinput') {
            videoList.push({
              id: d.deviceId || `webrtc-cam-${vIdx}`,
              label: d.label || `Local Camera #${vIdx++} (WebRTC)`,
              source: 'webrtc',
            });
          } else if (d.kind === 'audioinput') {
            audioList.push({
              id: d.deviceId || `mic-${aIdx}`,
              label: d.label || `Microphone #${aIdx++}`,
            });
          }
        }
      } catch {
        // ignore enumerate error
      }
    }

    for (const hc of sysInfo.hostCameras || []) {
      videoList.push({
        id: hc.id,
        label: hc.label,
        source: 'host',
      });
    }

    videoList.push({
      id: 'virtual-studio-pattern',
      label: 'Studio Calibration Signal (60fps 4K Generator)',
      source: 'virtual',
    });

    setState((prev) => ({
      ...prev,
      systemInfo: sysInfo,
      mediaItems: media,
      videoDevices: videoList,
      audioDevices: audioList,
    }));
  }, []);

  useEffect(() => {
    refreshEnvironment(false);
  }, [refreshEnvironment]);

  // Compute target output dimensions based on resolution preset + aspect ratio
  const getTargetDimensions = useCallback(() => {
    const base = RESOLUTION_PRESETS[settings.resolution];
    const [aw, ah] = settings.aspectRatio.split(':').map(Number);
    const targetRatio = aw / ah;
    const baseRatio = base.width / base.height;

    let width = base.width;
    let height = base.height;

    if (Math.abs(targetRatio - baseRatio) > 0.01) {
      if (targetRatio < baseRatio) {
        width = Math.round(base.height * targetRatio);
      } else {
        height = Math.round(base.width / targetRatio);
      }
    }
    // Ensure even dimensions for encoders
    width = width - (width % 2);
    height = height - (height % 2);

    if (settings.rotationDeg === 90 || settings.rotationDeg === 270) {
      return { width: height, height: width };
    }
    return { width, height };
  }, [settings.resolution, settings.aspectRatio, settings.rotationDeg]);

  // Start / Restart WebRTC or Host or Virtual stream
  useEffect(() => {
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let audioMeterInterval: number | null = null;
    const hostAbortController = new AbortController();
    let hostPollTimer: number | null = null;

    async function startStream() {
      // Stop existing tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      if (settings.engineMode === 'test-pattern' || settings.selectedVideoDeviceId === 'virtual-studio-pattern') {
        const dims = getTargetDimensions();
        setState((prev) => ({
          ...prev,
          isStreaming: true,
          actualWidth: dims.width,
          actualHeight: dims.height,
          errorMsg: null,
        }));
        return;
      }

      if (settings.engineMode === 'host') {
        const dims = getTargetDimensions();
        const preset = RESOLUTION_PRESETS[settings.resolution];
        setState((prev) => ({
          ...prev,
          isStreaming: true,
          actualWidth: dims.width,
          actualHeight: dims.height,
          errorMsg: null,
        }));

        // Optionally attach microphone for audio meter & video recording while in Host OS camera mode
        if (settings.audioEnabled && navigator.mediaDevices?.getUserMedia) {
          const audioConstraints: boolean | MediaTrackConstraints =
            settings.selectedAudioDeviceId && settings.selectedAudioDeviceId !== 'default'
              ? { deviceId: { exact: settings.selectedAudioDeviceId } }
              : true;
          navigator.mediaDevices
            .getUserMedia({ video: false, audio: audioConstraints })
            .then((audioStream) => {
              if (cancelled) {
                audioStream.getTracks().forEach((t) => t.stop());
                return;
              }
              mediaStreamRef.current = audioStream;
              const AudioContextClass =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              if (AudioContextClass && audioStream.getAudioTracks().length > 0) {
                audioCtx = new AudioContextClass();
                const src = audioCtx.createMediaStreamSource(audioStream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                src.connect(analyser);
                const buf = new Uint8Array(analyser.frequencyBinCount);
                audioMeterInterval = window.setInterval(() => {
                  analyser.getByteFrequencyData(buf);
                  const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
                  setState((prev) => ({
                    ...prev,
                    audioLevel: Math.min(100, Math.round((avg / 140) * 100)),
                  }));
                }, 100);
              }
            })
            .catch(() => {
              // ignore audio error in host mode
            });
        }

        const queryParams = `deviceId=${encodeURIComponent(
          settings.selectedVideoDeviceId
        )}&width=${preset.width}&height=${preset.height}&fps=${settings.fps}`;
        const streamUrl = `/api/host-stream?${queryParams}`;
        const frameUrl = `/api/host-frame?${queryParams}`;

        let isDecoding = false;
        let pendingBytes: Uint8Array | null = null;
        let lastStreamFrameAt = performance.now();

        const decodeNextJpeg = async (jpegBytes: Uint8Array) => {
          if (cancelled) return;
          if (isDecoding) {
            pendingBytes = jpegBytes;
            return;
          }
          isDecoding = true;
          try {
            let current: Uint8Array | null = jpegBytes;
            while (current && !cancelled) {
              const copy = new Uint8Array(current.byteLength);
              copy.set(current);
              const blob = new Blob([copy], { type: 'image/jpeg' });
              const bmp = await createImageBitmap(blob);
              if (cancelled) {
                bmp.close();
                break;
              }
              const old = hostBitmapRef.current;
              hostBitmapRef.current = bmp;
              if (old) {
                old.close();
              }
              current = pendingBytes;
              pendingBytes = null;
            }
          } catch {
            // ignore corrupted partial JPEG
          } finally {
            isDecoding = false;
          }
        };

        // Fallback frame poller in case any intermediate proxy buffers multipart streams
        hostPollTimer = window.setInterval(async () => {
          if (cancelled) return;
          if (performance.now() - lastStreamFrameAt < 450) return;
          try {
            const res = await fetch(`${frameUrl}&_t=${Date.now()}`, {
              signal: hostAbortController.signal,
              cache: 'no-store',
            });
            if (res.status === 200) {
              const ab = await res.arrayBuffer();
              if (ab.byteLength > 0) {
                decodeNextJpeg(new Uint8Array(ab));
              }
            }
          } catch {
            // ignore abort or transient error
          }
        }, 120);

        // Primary continuous low-latency MJPEG stream reader
        (async () => {
          while (!cancelled) {
            try {
              const res = await fetch(streamUrl, {
                signal: hostAbortController.signal,
                cache: 'no-store',
              });
              if (!res.ok || !res.body) {
                await new Promise((r) => setTimeout(r, 500));
                continue;
              }

              const reader = res.body.getReader();
              let accum = new Uint8Array(0);

              while (!cancelled) {
                const { done, value } = await reader.read();
                if (done || !value) break;

                const combined = new Uint8Array(accum.length + value.length);
                combined.set(accum, 0);
                combined.set(value, accum.length);

                const extracted = extractLatestJpegFromBuffer(combined);
                accum = extracted.remaining;

                if (extracted.frame) {
                  lastStreamFrameAt = performance.now();
                  decodeNextJpeg(extracted.frame);
                }
              }
            } catch {
              if (cancelled) break;
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        })();

        return;
      }

      // WebRTC Mode
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((prev) => ({
          ...prev,
          isStreaming: true,
          errorMsg: 'WebRTC camera API unavailable in this context — switched to Live Studio Generator.',
        }));
        updateSettings({ engineMode: 'test-pattern' });
        return;
      }

      const preset = RESOLUTION_PRESETS[settings.resolution];
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: settings.fps },
      };

      if (
        settings.selectedVideoDeviceId &&
        settings.selectedVideoDeviceId !== 'default' &&
        !settings.selectedVideoDeviceId.startsWith('avfoundation-') &&
        !settings.selectedVideoDeviceId.startsWith('v4l2-') &&
        !settings.selectedVideoDeviceId.startsWith('dshow-') &&
        !settings.selectedVideoDeviceId.startsWith('host-')
      ) {
        videoConstraints.deviceId = { exact: settings.selectedVideoDeviceId };
      }

      const audioConstraints: boolean | MediaTrackConstraints = settings.audioEnabled
        ? settings.selectedAudioDeviceId && settings.selectedAudioDeviceId !== 'default'
          ? { deviceId: { exact: settings.selectedAudioDeviceId } }
          : true
        : false;

      try {
        let stream: MediaStream;
        try {
          // Request video first so microphone permission denial or missing mic doesn't break camera capture
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Fallback to relaxed video constraints if exact resolution/device fails
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        // Optionally attach audio track if enabled
        if (audioConstraints) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: audioConstraints,
            });
            for (const aTrack of audioStream.getAudioTracks()) {
              stream.addTrack(aTrack);
            }
          } catch {
            // Continue with video even if audio permission is denied
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        if (videoRef.current) {
          const vEl = videoRef.current;
          vEl.srcObject = stream;
          vEl.onloadedmetadata = () => {
            vEl.play().catch(() => {});
          };
          await vEl.play().catch(() => {});
        }

        // Refresh device labels once permission is granted
        refreshEnvironment(false);

        // Setup live audio VU meter if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const AudioContextClass =
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            const src = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            const buf = new Uint8Array(analyser.frequencyBinCount);
            audioMeterInterval = window.setInterval(() => {
              analyser.getByteFrequencyData(buf);
              const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
              setState((prev) => ({ ...prev, audioLevel: Math.min(100, Math.round((avg / 140) * 100)) }));
            }, 100);
          }
        } else {
          setState((prev) => ({ ...prev, audioLevel: 0 }));
        }

        const vTrack = stream.getVideoTracks()[0];
        const trackSettings = vTrack?.getSettings();
        const dims = getTargetDimensions();

        setState((prev) => ({
          ...prev,
          isStreaming: true,
          actualWidth: dims.width || trackSettings?.width || preset.width,
          actualHeight: dims.height || trackSettings?.height || preset.height,
          errorMsg: null,
        }));
      } catch (err) {
        if (cancelled) return;
        const dims = getTargetDimensions();
        // Check if host OS camera (e.g. macOS AVFoundation via FFmpeg) is available before falling back to test-pattern
        const sysInfo = await fetchSystemInfo();
        const firstHostCam = sysInfo.hostCameras?.find((c) => c.driver !== 'simulated');
        if (sysInfo.ffmpegAvailable && firstHostCam) {
          setState((prev) => ({
            ...prev,
            isStreaming: true,
            actualWidth: dims.width,
            actualHeight: dims.height,
            errorMsg: null,
          }));
          updateSettings({
            engineMode: 'host',
            selectedVideoDeviceId: firstHostCam.id,
          });
          return;
        }

        setState((prev) => ({
          ...prev,
          isStreaming: true,
          actualWidth: dims.width,
          actualHeight: dims.height,
          errorMsg: `Hardware camera busy or permission denied (${err instanceof Error ? err.message : 'switched to Studio Signal Generator'})`,
        }));
        updateSettings({ engineMode: 'test-pattern' });
      }
    }

    startStream();

    return () => {
      cancelled = true;
      hostAbortController.abort();
      if (hostPollTimer) clearInterval(hostPollTimer);
      if (audioMeterInterval) clearInterval(audioMeterInterval);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [
    settings.engineMode,
    settings.selectedVideoDeviceId,
    settings.selectedAudioDeviceId,
    settings.resolution,
    settings.fps,
    settings.audioEnabled,
    getTargetDimensions,
    refreshEnvironment,
    updateSettings,
  ]);

  // Continuous Canvas Compositor Loop (applies aspect ratio crop, digital zoom, mirror, rotation, or renders calibration signal)
  useEffect(() => {
    let animId: number;
    let frameCount = 0;
    let lastFpsCheck = performance.now();

    const renderLoop = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const target = getTargetDimensions();
        if (canvas.width !== target.width || canvas.height !== target.height) {
          canvas.width = target.width;
          canvas.height = target.height;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.fillStyle = '#09090b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Center origin for mirror, rotation, and digital zoom
          ctx.translate(canvas.width / 2, canvas.height / 2);
          if (settings.mirrorHorizontal) {
            ctx.scale(-1, 1);
          }
          if (settings.rotationDeg !== 0) {
            ctx.rotate((settings.rotationDeg * Math.PI) / 180);
          }
          if (settings.digitalZoom > 1) {
            ctx.scale(settings.digitalZoom, settings.digitalZoom);
          }

          const drawW =
            settings.rotationDeg === 90 || settings.rotationDeg === 270
              ? canvas.height
              : canvas.width;
          const drawH =
            settings.rotationDeg === 90 || settings.rotationDeg === 270
              ? canvas.width
              : canvas.height;

          const videoEl = videoRef.current;
          const hostBmp = hostBitmapRef.current;
          const hostImgEl = hostImgRef.current;

          if (
            settings.engineMode === 'webrtc' &&
            videoEl &&
            videoEl.readyState >= 2 &&
            videoEl.videoWidth > 0
          ) {
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;
            const srcRatio = vw / vh;
            const dstRatio = drawW / drawH;

            let sx = 0;
            let sy = 0;
            let sw = vw;
            let sh = vh;

            if (srcRatio > dstRatio) {
              sw = vh * dstRatio;
              sx = (vw - sw) / 2;
            } else {
              sh = vw / dstRatio;
              sy = (vh - sh) / 2;
            }

            ctx.drawImage(videoEl, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
          } else if (settings.engineMode === 'host' && hostBmp && hostBmp.width > 0) {
            const iw = hostBmp.width;
            const ih = hostBmp.height;
            const srcRatio = iw / ih;
            const dstRatio = drawW / drawH;

            let sx = 0;
            let sy = 0;
            let sw = iw;
            let sh = ih;

            if (srcRatio > dstRatio) {
              sw = ih * dstRatio;
              sx = (iw - sw) / 2;
            } else {
              sh = iw / dstRatio;
              sy = (ih - sh) / 2;
            }

            ctx.drawImage(hostBmp, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
          } else if (
            settings.engineMode === 'host' &&
            hostImgEl &&
            hostImgEl.naturalWidth > 0
          ) {
            const iw = hostImgEl.naturalWidth;
            const ih = hostImgEl.naturalHeight;
            const srcRatio = iw / ih;
            const dstRatio = drawW / drawH;

            let sx = 0;
            let sy = 0;
            let sw = iw;
            let sh = ih;

            if (srcRatio > dstRatio) {
              sw = ih * dstRatio;
              sx = (iw - sw) / 2;
            } else {
              sh = iw / dstRatio;
              sy = (ih - sh) / 2;
            }

            ctx.drawImage(hostImgEl, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
          } else if (settings.engineMode === 'host') {
            drawHostWarmupScene(ctx, drawW, drawH);
          } else {
            // Render rich interactive Cinema Calibration & Sensor Simulation Pattern
            drawStudioCalibrationScene(ctx, drawW, drawH, now, settings);
          }

          ctx.restore();
        }
      }

      frameCount++;
      if (now - lastFpsCheck >= 1000) {
        const currentFps = Math.min(settings.fps, Math.round((frameCount * 1000) / (now - lastFpsCheck)));
        setState((prev) => ({
          ...prev,
          measuredFps: currentFps || settings.fps,
        }));
        frameCount = 0;
        lastFpsCheck = now;
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [
    settings,
    getTargetDimensions,
  ]);

  // Capture a single frame from the compositor canvas and save it
  const captureSingleFrame = useCallback(
    async (modeTag: MediaItem['captureMode'] = 'single', sequenceSuffix = ''): Promise<MediaItem | null> => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      if (settings.shutterSound) {
        soundEffects.playShutter();
      }

      setState((prev) => ({ ...prev, shutterFlash: true }));
      setTimeout(() => {
        setState((prev) => ({ ...prev, shutterFlash: false }));
      }, 130);

      const mimeMap: Record<CameraSettings['photoFormat'], string> = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const extMap: Record<CameraSettings['photoFormat'], string> = {
        jpeg: 'jpg',
        png: 'png',
        webp: 'webp',
      };

      const mimeType = mimeMap[settings.photoFormat];
      const ext = extMap[settings.photoFormat];
      const qualityArg = settings.photoFormat === 'png' ? undefined : settings.photoQuality / 100;

      const dataUrl = canvas.toDataURL(mimeType, qualityArg);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `CAM_${timestamp}${sequenceSuffix}.${ext}`;

      const activeDevice =
        state.videoDevices.find((d) => d.id === settings.selectedVideoDeviceId)?.label ||
        (settings.engineMode === 'host' ? 'Host OS Camera' : 'Camera');

      const saved = await persistMediaItem({
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filename,
        dataUrl,
        type: 'photo',
        format: ext.toUpperCase(),
        mimeType,
        width: canvas.width,
        height: canvas.height,
        captureMode: modeTag,
        deviceLabel: activeDevice,
        platform: state.systemInfo?.platformLabel || 'Multi-Platform',
        quality: settings.photoQuality,
      });

      setState((prev) => ({
        ...prev,
        mediaItems: [saved, ...prev.mediaItems.filter((i) => i.id !== saved.id)],
      }));

      return saved;
    },
    [
      settings.photoFormat,
      settings.photoQuality,
      settings.selectedVideoDeviceId,
      settings.engineMode,
      settings.shutterSound,
      state.videoDevices,
      state.systemInfo,
    ]
  );

  // Run countdown helper if timerDelaySec > 0
  const runCountdown = useCallback(
    async (seconds: number): Promise<boolean> => {
      if (seconds <= 0) return true;
      for (let remaining = seconds; remaining >= 1; remaining--) {
        setState((prev) => ({ ...prev, countdownRemaining: remaining }));
        if (settings.shutterSound) {
          soundEffects.playTimerBeep(remaining === 1);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setState((prev) => ({ ...prev, countdownRemaining: null }));
      return true;
    },
    [settings.shutterSound]
  );

  // Trigger Photo / Burst / Time-lapse / Video based on current mode
  const triggerPrimaryAction = useCallback(async () => {
    if (settings.captureMode === 'single') {
      if (settings.timerDelaySec > 0) {
        await runCountdown(settings.timerDelaySec);
        await captureSingleFrame('timer');
      } else {
        await captureSingleFrame('single');
      }
      return;
    }

    if (settings.captureMode === 'burst') {
      if (state.burstProgress) {
        burstAbortRef.current = true;
        return;
      }
      burstAbortRef.current = false;
      if (settings.timerDelaySec > 0) {
        await runCountdown(settings.timerDelaySec);
      }
      const total = settings.burstCount;
      for (let i = 1; i <= total; i++) {
        if (burstAbortRef.current) break;
        setState((prev) => ({ ...prev, burstProgress: { current: i, total } }));
        await captureSingleFrame('burst', `_BURST_${String(i).padStart(2, '0')}`);
        if (i < total) {
          await new Promise((r) => setTimeout(r, settings.burstIntervalMs));
        }
      }
      setState((prev) => ({ ...prev, burstProgress: null }));
      return;
    }

    if (settings.captureMode === 'timelapse') {
      if (state.timelapseProgress) {
        timelapseAbortRef.current = true;
        setState((prev) => ({ ...prev, timelapseProgress: null }));
        return;
      }
      timelapseAbortRef.current = false;
      if (settings.timerDelaySec > 0) {
        await runCountdown(settings.timerDelaySec);
      }
      const total = settings.timelapseMaxFrames;
      for (let i = 1; i <= total; i++) {
        if (timelapseAbortRef.current) break;
        setState((prev) => ({ ...prev, timelapseProgress: { current: i, total } }));
        await captureSingleFrame('timelapse', `_TL_${String(i).padStart(3, '0')}`);
        if (i < total) {
          await new Promise((r) => setTimeout(r, settings.timelapseIntervalSec * 1000));
        }
      }
      setState((prev) => ({ ...prev, timelapseProgress: null }));
      return;
    }

    if (settings.captureMode === 'video') {
      if (state.isRecording) {
        // Stop recording
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        if (settings.shutterSound) {
          soundEffects.playRecordToggle(false);
        }
        return;
      }

      // Start recording
      if (settings.timerDelaySec > 0) {
        await runCountdown(settings.timerDelaySec);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasStream = canvas.captureStream(settings.fps);
      if (settings.audioEnabled && mediaStreamRef.current) {
        for (const audioTrack of mediaStreamRef.current.getAudioTracks()) {
          canvasStream.addTrack(audioTrack);
        }
      }

      const preferredCandidates =
        settings.videoFormat === 'mp4'
          ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm']
          : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

      let chosenMime = 'video/webm';
      for (const candidate of preferredCandidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
          chosenMime = candidate;
          break;
        }
      }

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(canvasStream, {
        mimeType: chosenMime,
        videoBitsPerSecond: Math.round(settings.videoBitrateMbps * 1_000_000),
      });

      const recWidth = canvas.width;
      const recHeight = canvas.height;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const finalDurationSec = Math.max(
          1,
          Math.round(
            (recordAccumulatedMsRef.current +
              (recordStartRef.current ? Date.now() - recordStartRef.current : 0)) /
              1000
          )
        );

        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          recordingElapsedMs: 0,
        }));

        const blob = new Blob(recordedChunksRef.current, { type: chosenMime });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          const ext = settings.videoFormat === 'mp4' ? 'mp4' : 'webm';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `VID_${timestamp}.${ext}`;

          const activeDevice =
            state.videoDevices.find((d) => d.id === settings.selectedVideoDeviceId)?.label ||
            'Camera';

          const saved = await persistMediaItem({
            id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            filename,
            dataUrl,
            type: 'video',
            format: ext.toUpperCase(),
            mimeType: chosenMime,
            width: recWidth,
            height: recHeight,
            fps: settings.fps,
            durationSec: finalDurationSec,
            captureMode: 'video',
            deviceLabel: activeDevice,
            platform: state.systemInfo?.platformLabel || 'Multi-Platform',
            bitrateMbps: settings.videoBitrateMbps,
          });

          setState((prev) => ({
            ...prev,
            mediaItems: [saved, ...prev.mediaItems.filter((i) => i.id !== saved.id)],
          }));
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recordAccumulatedMsRef.current = 0;
      recordStartRef.current = Date.now();
      recorder.start(250);

      if (settings.shutterSound) {
        soundEffects.playRecordToggle(true);
      }

      setState((prev) => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        recordingElapsedMs: 0,
      }));

      recordTimerRef.current = window.setInterval(() => {
        setState((prev) => {
          if (!prev.isRecording || prev.isPaused) return prev;
          return {
            ...prev,
            recordingElapsedMs:
              recordAccumulatedMsRef.current + (Date.now() - recordStartRef.current),
          };
        });
      }, 100);
    }
  }, [
    settings,
    state.burstProgress,
    state.timelapseProgress,
    state.isRecording,
    state.videoDevices,
    state.systemInfo,
    runCountdown,
    captureSingleFrame,
  ]);

  const togglePauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || !state.isRecording) return;

    if (rec.state === 'recording') {
      rec.pause();
      recordAccumulatedMsRef.current += Date.now() - recordStartRef.current;
      recordStartRef.current = 0;
      setState((prev) => ({ ...prev, isPaused: true }));
    } else if (rec.state === 'paused') {
      rec.resume();
      recordStartRef.current = Date.now();
      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording]);

  const setMediaItems = useCallback((updater: (prev: MediaItem[]) => MediaItem[]) => {
    setState((prev) => ({ ...prev, mediaItems: updater(prev.mediaItems) }));
  }, []);

  return {
    videoRef,
    hostImgRef,
    canvasRef,
    state,
    triggerPrimaryAction,
    togglePauseRecording,
    captureSingleFrame,
    setMediaItems,
    refreshEnvironment,
  };
}

// Helper to draw a rich, dynamic Cinema Camera Sensor & Calibration Signal when in test-pattern or fallback mode
function drawStudioCalibrationScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  settings: CameraSettings
) {
  const t = now * 0.001;

  // Deep atmospheric studio gradient
  const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.5, '#1e1b4b');
  bg.addColorStop(1, '#09090b');
  ctx.fillStyle = bg;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Subtle horizon grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  const step = Math.max(40, Math.round(w / 24));
  for (let x = -w / 2; x <= w / 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x, h / 2);
    ctx.stroke();
  }
  for (let y = -h / 2; y <= h / 2; y += step) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y);
    ctx.stroke();
  }

  // Animated SMPTE/Color Checker reference swatches at bottom
  const swatches = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#a855f7',
    '#f4f4f5',
  ];
  const barWidth = (w * 0.56) / swatches.length;
  const barHeight = h * 0.07;
  const startX = -w * 0.28;
  const startY = h * 0.28;

  swatches.forEach((col, idx) => {
    ctx.fillStyle = col;
    ctx.fillRect(startX + idx * barWidth, startY, barWidth - 4, barHeight);
  });

  // Animated orbital lens rings in center
  const radius = Math.min(w, h) * 0.22;
  ctx.save();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -h * 0.04, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Orbiting focus target
  const orbX = Math.cos(t * 1.4) * radius * 0.72;
  const orbY = -h * 0.04 + Math.sin(t * 1.4) * radius * 0.72;

  const glow = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, radius * 0.45);
  glow.addColorStop(0, 'rgba(251, 191, 36, 0.9)');
  glow.addColorStop(0.4, 'rgba(56, 189, 248, 0.35)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(orbX, orbY, radius * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Telemetry readout inside synthetic feed
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.font = `600 ${Math.max(14, Math.round(h * 0.026))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `PHOTONDECK OPTICAL TEST SIGNAL • ${w}×${h} @ ${settings.fps}FPS`,
    0,
    -h * 0.34
  );

  ctx.fillStyle = 'rgba(161, 161, 170, 0.85)';
  ctx.font = `400 ${Math.max(12, Math.round(h * 0.019))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(
    `ISO 400 • SHUTTER 1/${settings.fps * 2} • ${settings.photoFormat.toUpperCase()} / ${settings.videoFormat.toUpperCase()} • TC ${new Date().toISOString().slice(11, 22)}`,
    0,
    -h * 0.29
  );
  ctx.restore();
}

function drawHostWarmupScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#09090b';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
  ctx.font = `600 ${Math.max(14, Math.round(h * 0.024))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('CONNECTING TO HOST HARDWARE CAMERA...', 0, 0);
  ctx.restore();
}

// Extracts the most recent complete JPEG frame (0xFFD8 .. 0xFFD9) from a rolling byte buffer
function extractLatestJpegFromBuffer(buf: Uint8Array): {
  frame: Uint8Array | null;
  remaining: Uint8Array;
} {
  let latestFrame: Uint8Array | null = null;
  let cursor = 0;

  while (cursor < buf.length - 1) {
    let soi = -1;
    for (let i = cursor; i < buf.length - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd8) {
        soi = i;
        break;
      }
    }
    if (soi === -1) {
      return { frame: latestFrame, remaining: new Uint8Array(0) };
    }

    let eoi = -1;
    for (let i = soi + 2; i < buf.length - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
        eoi = i + 2;
        break;
      }
    }
    if (eoi === -1) {
      return { frame: latestFrame, remaining: buf.slice(soi) };
    }

    latestFrame = buf.slice(soi, eoi);
    cursor = eoi;
  }

  return { frame: latestFrame, remaining: new Uint8Array(0) };
}

