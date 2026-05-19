'use client';

import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronUp, Copy, Printer, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCertificateEditor } from '../CertificateEditorContext';
import { emptyCircuit } from '@/lib/electricalCertificates/documentDefaults';
import { cloneBoard, replaceInCircuits } from '@/lib/electricalCertificates/documentHelpers';
import type { BoardRecord, CircuitRow } from '@/lib/electricalCertificates/types';
import { recalculateAllCircuits } from '@/lib/electricalCertificates/circuitCalculations';
import { OutcomeButtons, PASS_FAIL_OPTIONS, SectionCard, TextAreaField, TextField } from './FormFields';
import { CircuitsGrid } from './CircuitsGrid';
import { CircuitsToolbar } from './CircuitsToolbar';
import { FindReplaceModal } from './FindReplaceModal';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';

export function BoardDetailView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const { certificate, document, setDocument } = useCertificateEditor();
  const board = document.boards.find((b) => b.id === boardId);
  const base = `/dashboard/certificates/${certificate.id}`;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const readOnly = board?.status === 'done';

  if (!board) {
    return (
      <p className="text-sm text-slate-600">
        Board not found.{' '}
        <Link href={`${base}/boards`} className="text-[#14B8A6] hover:underline">
          Back to boards
        </Link>
      </p>
    );
  }

  const patchBoard = (patch: Partial<BoardRecord>) => {
    setDocument((d) => ({
      ...d,
      boards: d.boards.map((b) => {
        if (b.id !== boardId) return b;
        const next = { ...b, ...patch };
        if (patch.ipfAtDb !== undefined || patch.maxZsUse100Percent !== undefined) {
          next.circuits = recalculateAllCircuits(
            next.circuits,
            next,
            next.maxZsUse100Percent,
            false,
          );
        }
        return next;
      }),
    }));
  };

  const setCircuits = (circuits: CircuitRow[]) => {
    patchBoard({ circuits });
  };

  const addCircuits = (count: number) => {
    const start = board.circuits.length;
    const prev = board.circuits[board.circuits.length - 1];
    const added = Array.from({ length: count }, (_, i) => {
      const c = emptyCircuit();
      c.circuitNumber = String(start + i + 1);
      if (prev) {
        c.wiringType = prev.wiringType;
        c.refMethod = prev.refMethod;
        c.ocpdBs = prev.ocpdBs;
        c.ocpdType = prev.ocpdType;
        c.ocpdBs = prev.ocpdBs;
      }
      return recalculateAllCircuits([c], board, board.maxZsUse100Percent)[0];
    });
    setCircuits([...board.circuits, ...added]);
  };

  const markDone = () => {
    patchBoard({ status: board.status === 'done' ? 'in_progress' : 'done' });
  };

  const copyBoard = () => {
    const copy = cloneBoard(board);
    setDocument((d) => ({ ...d, boards: [...d.boards, copy] }));
    router.push(`${base}/boards/${copy.id}`);
  };

  const deleteBoard = () => {
    if (document.boards.length <= 1) {
      alert('At least one board is required.');
      return;
    }
    if (!window.confirm(`Delete board "${board.name}"?`)) return;
    setDocument((d) => ({ ...d, boards: d.boards.filter((b) => b.id !== boardId) }));
    router.push(`${base}/boards`);
  };

  const moveCircuit = (circuitId: string, direction: -1 | 1) => {
    const idx = board.circuits.findIndex((c) => c.id === circuitId);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= board.circuits.length) return;
    const list = [...board.circuits];
    const [item] = list.splice(idx, 1);
    list.splice(next, 0, item);
    setCircuits(list);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/boards`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#14B8A6]">
          <ChevronLeft className="size-4" /> Back
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              board.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {board.status === 'done' ? 'Done' : 'In progress'}
          </span>
          <button
            type="button"
            onClick={markDone}
            className="text-sm font-semibold text-[#14B8A6] hover:underline"
          >
            {board.status === 'done' ? 'Mark in progress' : 'Mark as done'}
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={copyBoard}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
          >
            <Copy className="size-3.5" /> Copy board
          </button>
          <button
            type="button"
            disabled={document.boards.length <= 1 || readOnly}
            onClick={deleteBoard}
            className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" /> Delete board
          </button>
          <button
            type="button"
            onClick={() => window.open(`${base}/boards/${boardId}/print`, '_blank')}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
          >
            <Printer className="size-3.5" /> Print schedule
          </button>
        </div>
      </div>

      {readOnly && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Board is marked done — mark in progress to edit circuits and details.
        </p>
      )}

      <div className="max-w-xs">
        <TextField label="Board name" value={board.name} onChange={(v) => patchBoard({ name: v })} />
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        Board details {detailsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {detailsOpen && (
        <SectionCard title="Board details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Manufacturer" value={board.manufacturer} onChange={(v) => patchBoard({ manufacturer: v })} />
            <TextField label="Location" value={board.location} onChange={(v) => patchBoard({ location: v })} />
            <TextField label="Supplied from" value={board.suppliedFrom} onChange={(v) => patchBoard({ suppliedFrom: v })} />
            <TextField label="Number of phases" value={board.phases} onChange={(v) => patchBoard({ phases: v })} />
            <TextField label="Zs at DB (Ω)" value={board.zsAtDb} onChange={(v) => patchBoard({ zsAtDb: v })} />
            <TextField label="Ipf at DB (kA)" value={board.ipfAtDb} onChange={(v) => patchBoard({ ipfAtDb: v })} />
          </div>
          <OutcomeButtons
            label="Supply polarity confirmed"
            value={board.polarityConfirmed}
            onChange={(v) => patchBoard({ polarityConfirmed: v })}
            options={PASS_FAIL_OPTIONS}
          />
          <TextField label="Main switch BS (EN)" value={board.mainSwitchBs} onChange={(v) => patchBoard({ mainSwitchBs: v })} />
          <TextField label="Main switch rated current" value={board.mainSwitchRating} onChange={(v) => patchBoard({ mainSwitchRating: v })} />
          <TextAreaField label="Notes" value={board.notes} onChange={(v) => patchBoard({ notes: v })} rows={2} />
          <CertificatePhotoGallery
            label="Board photographs"
            readOnly={readOnly}
            photos={board.photos}
            onChange={(photos) => patchBoard({ photos })}
          />
        </SectionCard>
      )}

      <SectionCard title="Circuit schedule">
        <CircuitsToolbar
          board={board}
          readOnly={readOnly}
          onFindReplace={() => setFindReplaceOpen(true)}
          onQuickAdd={(n) => addCircuits(n)}
          onAdd={() => addCircuits(1)}
          onRenumber={() => {
            setCircuits(
              board.circuits.map((c, i) => ({ ...c, circuitNumber: String(i + 1) })),
            );
          }}
          onToggle100MaxZs={() => {
            const use100 = !board.maxZsUse100Percent;
            patchBoard({
              maxZsUse100Percent: use100,
              circuits: recalculateAllCircuits(board.circuits, board, use100, false),
            });
          }}
          onRecalculateAll={() => {
            setCircuits(recalculateAllCircuits(board.circuits, board, board.maxZsUse100Percent, true));
          }}
          onFillColumn={(key, value) => {
            setCircuits(board.circuits.map((c) => ({ ...c, [key]: value })));
          }}
          onAutofillFromPrevious={() => {
            if (board.circuits.length < 2) return;
            const prev = board.circuits[board.circuits.length - 2];
            const last = board.circuits[board.circuits.length - 1];
            const filled = {
              ...last,
              wiringType: last.wiringType || prev.wiringType,
              refMethod: last.refMethod || prev.refMethod,
              liveMm2: last.liveMm2 || prev.liveMm2,
              cpcMm2: last.cpcMm2 || prev.cpcMm2,
              ocpdBs: last.ocpdBs || prev.ocpdBs,
              ocpdType: last.ocpdType || prev.ocpdType,
              ocpdRatingA: last.ocpdRatingA || prev.ocpdRatingA,
            };
            setCircuits([
              ...board.circuits.slice(0, -1),
              recalculateAllCircuits([filled], board, board.maxZsUse100Percent)[0],
            ]);
          }}
        />
        <div className="mt-3 min-h-0 flex-1">
          <CircuitsGrid
            boardId={boardId}
            board={board}
            circuits={board.circuits}
            readOnly={readOnly}
            onMoveCircuit={moveCircuit}
          />
        </div>
      </SectionCard>
      <FindReplaceModal
        open={findReplaceOpen}
        onClose={() => setFindReplaceOpen(false)}
        onApply={(col, find, rep) => {
          setCircuits(replaceInCircuits(board.circuits, col, find, rep));
        }}
      />
    </div>
  );
}
