'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { CertificatePhoto } from '@/lib/electricalCertificates/types';
import { newId } from '@/lib/electricalCertificates/documentDefaults';
import { prepareCertificateImage } from '@/lib/electricalCertificates/certificateImageUtils';

type Props = {
  photos: CertificatePhoto[];
  onChange: (photos: CertificatePhoto[]) => void;
  readOnly?: boolean;
  label?: string;
};

export function CertificatePhotoGallery({
  photos,
  onChange,
  readOnly = false,
  label = 'Photographs',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || readOnly) return;
    setUploading(true);
    setError(null);
    try {
      const added: CertificatePhoto[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await prepareCertificateImage(file);
        added.push({
          id: newId('ph'),
          caption: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
        });
      }
      onChange([...photos, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (id: string) => {
    onChange(photos.filter((p) => p.id !== id));
  };

  const updateCaption = (id: string, caption: string) => {
    onChange(photos.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {!readOnly && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ImagePlus className="size-3.5" />
              )}
              Add photos
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void addPhotos(e.target.files)}
            />
          </>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
          No photos yet
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="aspect-video bg-slate-100">
                <img src={p.dataUrl} alt="" className="h-full w-full object-contain" />
              </div>
              <div className="flex items-start gap-2 p-2">
                <input
                  disabled={readOnly}
                  className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
                  value={p.caption}
                  onChange={(e) => updateCaption(p.id, e.target.value)}
                  placeholder="Caption"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
