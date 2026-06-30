'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

let globalShowImageLightbox: ((url: string) => void) | null = null;

export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    globalShowImageLightbox = (url: string) => {
      setLightboxUrl(url);
    };
    return () => {
      globalShowImageLightbox = null;
    };
  }, []);

  return (
    <>
      {children}
      {lightboxUrl && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-4 -right-4 z-10 flex size-9 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg transition hover:bg-slate-950 font-bold border border-slate-700/50"
            >
              ✕
            </button>
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-h-[88vh] max-w-[90vw] rounded-lg object-contain shadow-2xl select-none"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function showFullscreenImage(url: string) {
  if (globalShowImageLightbox) {
    globalShowImageLightbox(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
