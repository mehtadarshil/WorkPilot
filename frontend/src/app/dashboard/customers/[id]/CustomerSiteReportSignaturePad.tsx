'use client';

import { useCallback, useEffect, useRef } from 'react';

function canvasHasInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { width, height } = canvas;
  if (width === 0 || height === 0) return false;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 8) return true;
  }
  return false;
}

type Props = {
  disabled?: boolean;
  /** Called with PNG blob when user clicks Save */
  onSave: (blob: Blob) => void | Promise<void>;
  busy?: boolean;
};

export default function CustomerSiteReportSignaturePad({ disabled, onSave, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const layoutCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(280, Math.floor(rect.width || 400));
    const h = 160;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    el.width = Math.floor(w * dpr);
    el.height = Math.floor(h * dpr);
    el.style.height = `${h}px`;
    const ctx = el.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => layoutCanvas());
    });
    return () => window.cancelAnimationFrame(id);
  }, [layoutCanvas]);

  const pos = (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent): { x: number; y: number } | null => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let cx: number;
    let cy: number;
    if ('touches' in e && e.touches.length > 0) {
      cx = e.touches[0]!.clientX;
      cy = e.touches[0]!.clientY;
    } else if ('clientX' in e) {
      cx = e.clientX;
      cy = e.clientY;
    } else return null;
    return { x: cx - r.left, y: cy - r.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || busy) return;
    const p = pos(e);
    if (!p) return;
    drawing.current = true;
    last.current = p;
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || disabled || busy) return;
    const p = pos(e);
    if (!p || !last.current) return;
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const prevent = (ev: TouchEvent) => {
      if (drawing.current) ev.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  const clearPad = () => {
    layoutCanvas();
  };

  const savePad = async () => {
    const el = canvasRef.current;
    if (!el || disabled || busy) return;
    if (!canvasHasInk(el)) return;
    const blob = await new Promise<Blob | null>((resolve) => el.toBlob((b) => resolve(b), 'image/png', 0.92));
    if (blob) await onSave(blob);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair bg-white"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={clearPad}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Clear pad
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void savePad()}
          className="rounded-md bg-[#14B8A6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#119f8e] disabled:opacity-50"
        >
          Save signature to report
        </button>
      </div>
    </div>
  );
}
