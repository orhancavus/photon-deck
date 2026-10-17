import React, { useEffect, useRef } from 'react';
import { HistogramData } from '../hooks/useHistogram';
import { Activity, X } from 'lucide-react';

interface HistogramWidgetProps {
  data: HistogramData;
  onClose: () => void;
}

export const HistogramWidget: React.FC<HistogramWidgetProps> = ({ data, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle vertical EV guide lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const drawCurve = (values: number[], strokeColor: string, fillColor: string) => {
      if (!values.length) return;
      ctx.beginPath();
      ctx.moveTo(0, h);
      values.forEach((v, idx) => {
        const x = (idx / (values.length - 1)) * w;
        const y = h - v * (h - 6);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.beginPath();
      values.forEach((v, idx) => {
        const x = (idx / (values.length - 1)) * w;
        const y = h - v * (h - 6);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    ctx.globalCompositeOperation = 'screen';
    drawCurve(data.r, 'rgba(239, 68, 68, 0.9)', 'rgba(239, 68, 68, 0.22)');
    drawCurve(data.g, 'rgba(34, 197, 94, 0.9)', 'rgba(34, 197, 94, 0.22)');
    drawCurve(data.b, 'rgba(59, 130, 246, 0.9)', 'rgba(59, 130, 246, 0.22)');
    drawCurve(data.luma, 'rgba(250, 250, 250, 0.85)', 'rgba(250, 250, 250, 0.12)');
    ctx.globalCompositeOperation = 'source-over';
  }, [data]);

  const evApprox = (((data.avgLuma - 128) / 128) * 2).toFixed(1);
  const evDisplay = Number(evApprox) >= 0 ? `+${evApprox} EV` : `${evApprox} EV`;

  return (
    <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/90 rounded-xl p-2.5 shadow-2xl w-56 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-300">
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span>RGB / Luma</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-amber-400 border border-zinc-800">
            {evDisplay}
          </span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Hide Histogram (H)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={200}
        height={68}
        className="w-full h-[68px] rounded bg-zinc-900/90 border border-zinc-800/80"
      />
      <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-1 px-0.5">
        <span>SHADOWS</span>
        <span>MID</span>
        <span>HIGHLIGHTS</span>
      </div>
    </div>
  );
};
