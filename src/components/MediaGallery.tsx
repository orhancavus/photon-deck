import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  CheckSquare,
  Download,
  Film,
  Image as ImageIcon,
  Info,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { MediaItem } from '../types/camera';
import { removeMediaItem, removeMultipleMediaItems } from '../services/api';

interface MediaGalleryProps {
  items: MediaItem[];
  setMediaItems: (updater: (prev: MediaItem[]) => MediaItem[]) => void;
  onClose: () => void;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  items,
  setMediaItems,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'burst' | 'timelapse'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<MediaItem | null>(items[0] || null);
  const [isZipping, setIsZipping] = useState(false);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'photo') return item.type === 'photo';
      if (filter === 'video') return item.type === 'video';
      if (filter === 'burst') return item.captureMode === 'burst';
      if (filter === 'timelapse') return item.captureMode === 'timelapse';
      return true;
    });
  }, [items, filter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleSingleDownload = (item: MediaItem) => {
    const a = document.createElement('a');
    a.href = item.dataUrl || item.url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBatchZipDownload = async () => {
    const targets = items.filter((i) => selectedIds.has(i.id));
    if (targets.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of targets) {
        const src = item.dataUrl || item.url;
        if (src.startsWith('data:')) {
          const base64 = src.split(',')[1];
          zip.file(item.filename, base64, { base64: true });
        } else {
          const resp = await fetch(src);
          const blob = await resp.blob();
          zip.file(item.filename, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CamStudio_Export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  };

  const handleDeleteSingle = async (item: MediaItem) => {
    await removeMediaItem(item.id);
    setMediaItems((prev) => prev.filter((i) => i.id !== item.id));
    if (activeItem?.id === item.id) {
      setActiveItem(null);
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await removeMultipleMediaItems(ids);
    setMediaItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    if (activeItem && selectedIds.has(activeItem.id)) {
      setActiveItem(null);
    }
    setSelectedIds(new Set());
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-xl flex flex-col select-none">
      {/* Top Bar */}
      <div className="h-16 px-6 border-b border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-bold tracking-tight text-zinc-100">
            Media Gallery & Inspector
          </h2>
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'photo', label: 'Photos' },
                { id: 'video', label: 'Videos' },
                { id: 'burst', label: 'Bursts' },
                { id: 'timelapse', label: 'Time-Lapse' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-zinc-800 text-amber-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Batch Actions & Close */}
        <div className="flex items-center gap-2">
          {filteredItems.length > 0 && (
            <button
              onClick={selectAllFiltered}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 flex items-center gap-1.5"
            >
              {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Square className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span>Select All ({filteredItems.length})</span>
            </button>
          )}

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleBatchZipDownload}
                disabled={isZipping}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>
                  {isZipping ? 'Packaging ZIP...' : `Download ZIP (${selectedIds.size})`}
                </span>
              </button>

              <button
                onClick={handleDeleteSelected}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 text-red-300 text-xs flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedIds.size})</span>
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 ml-2"
            title="Close Gallery (Esc or M)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Split View: Thumbnail Grid + Media Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <ImageIcon className="w-12 h-12 stroke-[1.2] mb-3 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">No media captures yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Press the Shutter button or Spacebar to capture photos and videos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const isActive = activeItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveItem(item)}
                    className={`group relative rounded-xl overflow-hidden border bg-zinc-900 aspect-video cursor-pointer transition-all ${
                      isActive
                        ? 'border-amber-400 ring-2 ring-amber-400/30'
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {item.type === 'photo' ? (
                      <img
                        src={item.dataUrl || item.url}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.dataUrl || item.url}
                        className="w-full h-full object-cover"
                        muted
                      />
                    )}

                    {/* Checkbox overlay */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(item.id);
                      }}
                      className="absolute top-2 left-2 p-1 rounded bg-zinc-950/80 border border-zinc-700 text-zinc-200 hover:border-amber-400"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </button>

                    {/* Format Badge */}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-zinc-950/85 border border-zinc-800 text-[10px] font-mono text-zinc-200 flex items-center gap-1">
                      {item.type === 'video' ? (
                        <Film className="w-3 h-3 text-sky-400" />
                      ) : (
                        <ImageIcon className="w-3 h-3 text-amber-400" />
                      )}
                      <span>{item.format}</span>
                    </div>

                    {/* Bottom Info Strip */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 flex items-end justify-between text-[10px] font-mono text-zinc-300">
                      <span className="truncate">{item.width}×{item.height}</span>
                      <span>{formatBytes(item.sizeBytes)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Lightbox & Technical Metadata Inspector */}
        {activeItem && (
          <div className="w-96 border-l border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 overflow-y-auto p-5">
            <div className="rounded-xl overflow-hidden bg-black border border-zinc-800 aspect-video flex items-center justify-center mb-4">
              {activeItem.type === 'photo' ? (
                <img
                  src={activeItem.dataUrl || activeItem.url}
                  alt={activeItem.filename}
                  className="max-w-full max-h-64 object-contain"
                />
              ) : (
                <video
                  src={activeItem.dataUrl || activeItem.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-64 object-contain"
                />
              )}
            </div>

            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => handleSingleDownload(activeItem)}
                className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
              <button
                onClick={() => handleDeleteSingle(activeItem)}
                className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-300 transition-colors"
                title="Delete Capture"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800 pb-2">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <span>Technical Metadata</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Filename</span>
                <span className="col-span-2 font-mono text-zinc-200 break-all">
                  {activeItem.filename}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Dimensions</span>
                <span className="col-span-2 font-mono text-amber-400">
                  {activeItem.width} × {activeItem.height} px
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Format / MIME</span>
                <span className="col-span-2 font-mono text-zinc-200">
                  {activeItem.format} ({activeItem.mimeType})
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">File Size</span>
                <span className="col-span-2 font-mono text-zinc-200">
                  {formatBytes(activeItem.sizeBytes)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Capture Mode</span>
                <span className="col-span-2 font-mono uppercase text-emerald-400">
                  {activeItem.captureMode}
                </span>
              </div>

              {activeItem.fps && (
                <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Frame Rate</span>
                  <span className="col-span-2 font-mono text-zinc-200">{activeItem.fps} FPS</span>
                </div>
              )}

              {activeItem.bitrateMbps && (
                <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Bitrate</span>
                  <span className="col-span-2 font-mono text-sky-400">
                    {activeItem.bitrateMbps} Mbps
                  </span>
                </div>
              )}

              {activeItem.quality && (
                <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                  <span className="text-zinc-500">Quality</span>
                  <span className="col-span-2 font-mono text-zinc-200">{activeItem.quality}%</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Camera Source</span>
                <span className="col-span-2 font-mono text-zinc-300">{activeItem.deviceLabel}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">OS Platform</span>
                <span className="col-span-2 font-mono text-zinc-300">{activeItem.platform}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="text-zinc-500">Captured At</span>
                <span className="col-span-2 font-mono text-zinc-400">
                  {new Date(activeItem.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
