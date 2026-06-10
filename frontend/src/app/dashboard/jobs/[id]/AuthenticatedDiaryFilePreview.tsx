'use client';

import { useEffect, useRef, useState } from 'react';
import { getBlob } from '../../../apiClient';

type Props = {
  filePath: string;
  contentType: string;
  kind: string;
  token: string | null;
};

/** Diary media is protected, so fetch it as a blob and render a temporary object URL. */
export default function AuthenticatedDiaryFilePreview({ filePath, contentType, kind, token }: Props) {
  const [preview, setPreview] = useState<{ filePath: string; objectUrl: string | null; error: string }>({
    filePath: '',
    objectUrl: null,
    error: '',
  });
  const lastBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !filePath) return;
    let cancelled = false;
    if (lastBlobRef.current) {
      URL.revokeObjectURL(lastBlobRef.current);
      lastBlobRef.current = null;
    }

    void (async () => {
      try {
        const blob = await getBlob(filePath, token);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        lastBlobRef.current = url;
        setPreview({ filePath, objectUrl: url, error: '' });
      } catch (err) {
        if (!cancelled) {
          setPreview({
            filePath,
            objectUrl: null,
            error: err instanceof Error && err.message ? err.message : 'Could not load',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (lastBlobRef.current) {
        URL.revokeObjectURL(lastBlobRef.current);
        lastBlobRef.current = null;
      }
    };
  }, [filePath, token]);

  const ready = preview.filePath === filePath;
  if (ready && preview.error) {
    return <span className="text-xs text-rose-600">{preview.error}</span>;
  }
  if (!ready || !preview.objectUrl) {
    return <span className="text-xs text-slate-400">Loading…</span>;
  }
  if (kind === 'video' || contentType.startsWith('video/')) {
    return (
      <video
        src={preview.objectUrl}
        controls
        className="max-h-64 w-full max-w-md rounded border border-slate-200 bg-black"
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={preview.objectUrl} alt="" className="max-h-52 rounded-md border border-slate-200 bg-slate-50 object-contain" />;
}
