'use client';

import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useCertificateEditor } from '../CertificateEditorContext';
import { emptyCircuit } from '@/lib/electricalCertificates/documentDefaults';
import type { BoardRecord, CircuitRow } from '@/lib/electricalCertificates/types';
import { recalculateAllCircuits } from '@/lib/electricalCertificates/circuitCalculations';
import { OutcomeButtons, PASS_FAIL_OPTIONS, SectionCard, TextAreaField, TextField } from './FormFields';
import { CircuitsGrid } from './CircuitsGrid';
import { CircuitsToolbar } from './CircuitsToolbar';

export function BoardDetailView({ boardId }: { boardId: string }) {
  const { certificate, document, setDocument } = useCertificateEditor();
  const board = document.boards.find((b) => b.id === boardId);
  const base = `/dashboard/certificates/${certificate.id}`;
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/boards`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#14B8A6]">
          <ChevronLeft className="size-4" /> Boards
        </Link>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
        </SectionCard>
      )}

      <SectionCard title="Circuit schedule">
        <CircuitsToolbar
          board={board}
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
          <CircuitsGrid boardId={boardId} board={board} circuits={board.circuits} />
        </div>
      </SectionCard>
    </div>
  );
}
