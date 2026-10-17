import fs from 'fs';
import path from 'path';

export interface StoredMediaMetadata {
  id: string;
  filename: string;
  url: string;
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

const MEDIA_DIR = path.resolve(process.cwd(), 'media');
const INDEX_FILE = path.join(MEDIA_DIR, 'index.json');

export function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

export function getMediaDir(): string {
  ensureMediaDir();
  return MEDIA_DIR;
}

export function listMediaItems(): StoredMediaMetadata[] {
  ensureMediaDir();
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const items = JSON.parse(raw) as StoredMediaMetadata[];
    // Filter out any item whose file was removed manually
    return items
      .filter((item) => fs.existsSync(path.join(MEDIA_DIR, path.basename(item.filename))))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export function saveMediaItem(
  buffer: Buffer,
  meta: Omit<StoredMediaMetadata, 'sizeBytes' | 'url'>
): StoredMediaMetadata {
  ensureMediaDir();
  const safeFilename = path.basename(meta.filename);
  const filePath = path.join(MEDIA_DIR, safeFilename);
  fs.writeFileSync(filePath, buffer);

  const fullItem: StoredMediaMetadata = {
    ...meta,
    filename: safeFilename,
    sizeBytes: buffer.length,
    url: `/media-files/${safeFilename}`,
  };

  const existing = listMediaItems().filter((i) => i.id !== fullItem.id);
  existing.unshift(fullItem);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(existing, null, 2), 'utf8');

  return fullItem;
}

export function deleteMediaItem(id: string): boolean {
  ensureMediaDir();
  const items = listMediaItems();
  const target = items.find((i) => i.id === id);
  if (!target) return false;

  const filePath = path.join(MEDIA_DIR, path.basename(target.filename));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  const remaining = items.filter((i) => i.id !== id);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(remaining, null, 2), 'utf8');
  return true;
}

export function deleteMultipleMediaItems(ids: string[]): number {
  let deleted = 0;
  for (const id of ids) {
    if (deleteMediaItem(id)) deleted++;
  }
  return deleted;
}
