import { useEffect, useRef, useState } from 'react';

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
  avgLuma: number;
}

const BINS = 64;

export function useHistogram(
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean
): HistogramData {
  const [data, setData] = useState<HistogramData>(() => ({
    r: new Array(BINS).fill(0),
    g: new Array(BINS).fill(0),
    b: new Array(BINS).fill(0),
    luma: new Array(BINS).fill(0),
    avgLuma: 128,
  }));

  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (!sampleCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 54;
      sampleCanvasRef.current = c;
    }

    const interval = setInterval(() => {
      const src = sourceCanvasRef.current;
      const sample = sampleCanvasRef.current;
      if (!src || !sample || src.width === 0 || src.height === 0) return;

      const ctx = sample.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      try {
        ctx.drawImage(src, 0, 0, sample.width, sample.height);
        const imgData = ctx.getImageData(0, 0, sample.width, sample.height).data;

        const rBins = new Array(BINS).fill(0);
        const gBins = new Array(BINS).fill(0);
        const bBins = new Array(BINS).fill(0);
        const lumaBins = new Array(BINS).fill(0);

        let totalLuma = 0;
        const pixelCount = imgData.length / 4;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

          totalLuma += l;
          rBins[Math.min(BINS - 1, Math.floor((r / 256) * BINS))]++;
          gBins[Math.min(BINS - 1, Math.floor((g / 256) * BINS))]++;
          bBins[Math.min(BINS - 1, Math.floor((b / 256) * BINS))]++;
          lumaBins[Math.min(BINS - 1, Math.floor((l / 256) * BINS))]++;
        }

        const maxVal = Math.max(
          1,
          ...rBins,
          ...gBins,
          ...bBins,
          ...lumaBins
        );

        setData({
          r: rBins.map((v) => v / maxVal),
          g: gBins.map((v) => v / maxVal),
          b: bBins.map((v) => v / maxVal),
          luma: lumaBins.map((v) => v / maxVal),
          avgLuma: Math.round(totalLuma / Math.max(1, pixelCount)),
        });
      } catch {
        // Ignore cross-origin or transient canvas read errors
      }
    }, 150);

    return () => clearInterval(interval);
  }, [enabled, sourceCanvasRef]);

  return data;
}
