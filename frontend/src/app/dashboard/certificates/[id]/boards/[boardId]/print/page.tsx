'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJson } from '@/app/apiClient';
import type { ElectricalCertificate } from '@/lib/electricalCertificates/types';
import { BoardSchedulePrintTemplate } from '@/app/dashboard/certificates/components/BoardSchedulePrintTemplate';
import { useCompanyBranding } from '@/app/dashboard/certificates/hooks/useCompanyBranding';

export default function BoardSchedulePrintPage() {
  const params = useParams();
  const id = parseInt(String(params.id), 10);
  const boardId = String(params.boardId ?? '');
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [certificate, setCertificate] = useState<ElectricalCertificate | null>(null);
  const { branding, loading: brandingLoading } = useCompanyBranding();

  useEffect(() => {
    if (!token || !Number.isFinite(id)) return;
    void getJson<{ certificate: ElectricalCertificate }>(`/electrical-certificates/${id}`, token).then(
      (res) => setCertificate(res.certificate),
    );
  }, [id, token]);

  const board = certificate?.document.boards.find((b) => b.id === boardId);

  useEffect(() => {
    if (!board) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [board]);

  if (!certificate || !board || brandingLoading) {
    return <p className="p-8 text-slate-600">Loading…</p>;
  }

  return <BoardSchedulePrintTemplate certificate={certificate} board={board} branding={branding} />;
}
