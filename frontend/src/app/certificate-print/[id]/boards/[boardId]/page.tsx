import { Suspense } from 'react';
import BoardSchedulePrintClient from './BoardSchedulePrintClient';

export default function BoardSchedulePrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-sm text-slate-500">Loading…</div>}>
      <BoardSchedulePrintClient />
    </Suspense>
  );
}
