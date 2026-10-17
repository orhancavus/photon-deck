import { MediaItem, SystemInfoResponse } from '../types/camera';
import {
  getLocalMediaItems,
  saveLocalMediaItem,
  deleteLocalMediaItem,
} from './localDb';

export async function fetchSystemInfo(forceRefresh = false): Promise<SystemInfoResponse> {
  try {
    const res = await fetch(forceRefresh ? '/api/system-info?refresh=1' : '/api/system-info');
    if (!res.ok) throw new Error('Backend unreachable');
    return await res.json();
  } catch {
    // Client-side OS detection fallback if running standalone
    const ua = navigator.userAgent.toLowerCase();
    let platform: SystemInfoResponse['platform'] = 'macos';
    let platformLabel = 'macOS (Browser WebRTC)';
    if (ua.includes('win')) {
      platform = 'windows';
      platformLabel = 'Windows (Browser WebRTC)';
    } else if (ua.includes('aarch64') || ua.includes('arm') || ua.includes('raspbian')) {
      platform = 'raspberrypi';
      platformLabel = 'Raspberry Pi (Browser WebRTC)';
    } else if (ua.includes('linux')) {
      platform = 'linux';
      platformLabel = 'Linux (Browser WebRTC)';
    }

    return {
      platform,
      platformLabel,
      arch: 'native',
      hostname: window.location.hostname || 'localhost',
      driver: 'WebRTC',
      ffmpegAvailable: false,
      rpicamAvailable: false,
      hostCameras: [],
      serverTime: new Date().toISOString(),
    };
  }
}

export async function fetchAllMedia(): Promise<MediaItem[]> {
  const localItems = await getLocalMediaItems();
  try {
    const res = await fetch('/api/media');
    if (!res.ok) return localItems;
    const data = await res.json();
    const serverItems: MediaItem[] = data.items || [];
    const map = new Map<string, MediaItem>();
    for (const item of localItems) map.set(item.id, item);
    for (const item of serverItems) map.set(item.id, item);
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return localItems;
  }
}

export async function persistMediaItem(
  payload: Omit<MediaItem, 'url' | 'sizeBytes' | 'createdAt'> & { dataUrl: string }
): Promise<MediaItem> {
  const approxBytes = Math.round((payload.dataUrl.length * 3) / 4);
  const fallbackItem: MediaItem = {
    ...payload,
    url: payload.dataUrl,
    sizeBytes: approxBytes,
    createdAt: new Date().toISOString(),
  };

  await saveLocalMediaItem(fallbackItem);

  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.item) {
        return data.item as MediaItem;
      }
    }
  } catch {
    // Fallback to IndexedDB copy already saved
  }

  return fallbackItem;
}

export async function removeMediaItem(id: string): Promise<void> {
  await deleteLocalMediaItem(id);
  try {
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
  } catch {
    // ignore
  }
}

export async function removeMultipleMediaItems(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteLocalMediaItem(id);
  }
  try {
    await fetch('/api/media/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch {
    // ignore
  }
}
