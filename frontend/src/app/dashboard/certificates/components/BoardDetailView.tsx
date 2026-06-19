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
import {
  clearColumnIntelligent,
  FILLABLE_CIRCUIT_COLUMNS,
  fillColumnIntelligent,
  parsePastedGrid,
  pasteIntoCircuits,
  renumberCircuitsSmart,
} from '@/lib/electricalCertificates/circuitGridUtils';
import {
  OutcomeButtons,
  PASS_FAIL_OPTIONS,
  QuickSetSelectField,
  QuickSetTextField,
  SELECT_QUICK_NA_LIM,
  SELECT_QUICK_NA_LIM_UNKNOWN,
  SelectField,
  TextAreaField,
  TextField,
} from './FormFields';
import { TradecertFieldGrid, TradecertFormLayout, TradecertPanel } from './TradecertFormLayout';
import { CircuitsGrid } from './CircuitsGrid';
import { CircuitsToolbar } from './CircuitsToolbar';
import { FindReplaceModal } from './FindReplaceModal';
import { PasteCircuitsModal } from './PasteCircuitsModal';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';

const BOARD_PHASE_OPTIONS = ['1', '2', '3', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value,
}));

const BOARD_MAIN_SWITCH_BS_OPTIONS = [
  '60947-1',
  '60947-3',
  '60204-1',
  '61439-2',
  '60439-1',
  '60439-3',
  '61009-1',
  '62423',
  '5419',
  '4293',
  '61008',
  'lim',
  'UNKNOWN',
  'na',
  'Other',
].map((value) => ({ value, label: value === 'lim' ? 'LIM' : value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value }));

const BOARD_VOLTAGE_OPTIONS = ['230', '400', '415', '690', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : `${value} V`,
}));

const BOARD_CURRENT_OPTIONS = ['40', '63', '80', '100', '125', '160', '200', '250', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'lim' ? 'LIM' : value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} A`,
}));

const BOARD_RCD_RATING_OPTIONS = ['30', '100', '300', '500', 'na', 'lim', 'UNKNOWN', 'Other'].map((value) => ({
  value,
  label: value === 'lim' ? 'LIM' : value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} mA`,
}));

const BOARD_SPD_TYPE_OPTIONS = ['Type T1', 'Type T2', 'Type T3', 'T1 + T2', 'T2 + T3', 'T1 + T2 + T3', 'N/A'].map((value) => ({
  value,
  label: value,
}));

const BOARD_OCPD_BS_OPTIONS = ['lim', 'UNKNOWN', '60898', '3036', '3871', '1361', '60947-2', '61009', '60269', '88-2', '88-3', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'lim' ? 'LIM' : value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value,
}));

const BOARD_OCPD_CURRENT_OPTIONS = ['5', '6', '10', '15', '16', '20', '25', '32', '40', '45', '50', '63', '80', '100', '125', '160', '200', '250', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'lim' ? 'LIM' : value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} A`,
}));

export function BoardDetailView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const { certificate, document, setDocument } = useCertificateEditor();
  const board = document.boards.find((b) => b.id === boardId);
  const base = `/dashboard/certificates/${certificate.id}`;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
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
        if (patch.ipfAtDb !== undefined || patch.zsAtDb !== undefined || patch.maxZsUse100Percent !== undefined) {
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
    <TradecertFormLayout>
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
        <TradecertPanel title="Board details">
          <TradecertFieldGrid>
            <TextField label="Manufacturer" value={board.manufacturer} onChange={(v) => patchBoard({ manufacturer: v })} />
            <TextField label="Location" value={board.location} onChange={(v) => patchBoard({ location: v })} />
            <TextField label="Supplied from" value={board.suppliedFrom} onChange={(v) => patchBoard({ suppliedFrom: v })} />
            <QuickSetSelectField label="Number of phases" value={board.phases} onChange={(v) => patchBoard({ phases: v })} options={BOARD_PHASE_OPTIONS} />
            <QuickSetTextField label="Zs at DB (Ω)" value={board.zsAtDb} onChange={(v) => patchBoard({ zsAtDb: v })} />
            <QuickSetTextField label="Ipf at DB (kA)" value={board.ipfAtDb} onChange={(v) => patchBoard({ ipfAtDb: v })} />
            <OutcomeButtons
              label="Supply polarity confirmed"
              value={board.polarityConfirmed}
              onChange={(v) => patchBoard({ polarityConfirmed: v })}
              options={PASS_FAIL_OPTIONS}
            />
            <OutcomeButtons
              label="Phase sequence confirmed"
              value={board.phaseSequence}
              onChange={(v) => patchBoard({ phaseSequence: v })}
              options={PASS_FAIL_OPTIONS}
            />
            <QuickSetSelectField label="Type BS (EN)" value={board.mainSwitchBs} onChange={(v) => patchBoard({ mainSwitchBs: v })} options={BOARD_MAIN_SWITCH_BS_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
            <QuickSetSelectField label="Voltage rating" value={board.mainSwitchVoltage} onChange={(v) => patchBoard({ mainSwitchVoltage: v })} options={BOARD_VOLTAGE_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM} />
            <QuickSetSelectField label="Rated current" value={board.mainSwitchRating} onChange={(v) => patchBoard({ mainSwitchRating: v })} options={BOARD_CURRENT_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
            <QuickSetTextField label="Ipf rating" value={board.mainSwitchIpf} onChange={(v) => patchBoard({ mainSwitchIpf: v })} />
            <QuickSetSelectField label="RCD rating" value={board.rcdRating} onChange={(v) => patchBoard({ rcdRating: v })} options={BOARD_RCD_RATING_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
            <QuickSetTextField label="RCD trip time" value={board.rcdTripTime} onChange={(v) => patchBoard({ rcdTripTime: v })} />
            <SelectField label="SPD type" value={board.spdType} onChange={(v) => patchBoard({ spdType: v })} options={BOARD_SPD_TYPE_OPTIONS} />
            <OutcomeButtons label="SPD operation status confirmed" value={board.spdStatus} onChange={(v) => patchBoard({ spdStatus: v })} options={PASS_FAIL_OPTIONS} />
            <QuickSetSelectField label="Overcurrent device BS (EN)" value={board.ocpdBs} onChange={(v) => patchBoard({ ocpdBs: v })} options={BOARD_OCPD_BS_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM} />
            <QuickSetSelectField label="Overcurrent device voltage" value={board.ocpdVoltage} onChange={(v) => patchBoard({ ocpdVoltage: v })} options={BOARD_VOLTAGE_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM} />
            <QuickSetSelectField label="Overcurrent device rated current" value={board.ocpdRating} onChange={(v) => patchBoard({ ocpdRating: v })} options={BOARD_OCPD_CURRENT_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          </TradecertFieldGrid>
          <TextAreaField label="Notes" value={board.notes} onChange={(v) => patchBoard({ notes: v })} rows={2} />
          <CertificatePhotoGallery
            label="Board photographs"
            readOnly={readOnly}
            photos={board.photos}
            onChange={(photos) => patchBoard({ photos })}
          />
        </TradecertPanel>
      )}

      <TradecertPanel title="Circuit schedule">
        <CircuitsToolbar
          board={board}
          readOnly={readOnly}
          onFindReplace={() => setFindReplaceOpen(true)}
          onPaste={() => setPasteOpen(true)}
          onQuickAdd={(n) => addCircuits(n)}
          onAdd={() => addCircuits(1)}
          onRenumber={() => {
            setCircuits(renumberCircuitsSmart(board.circuits));
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
            setCircuits(fillColumnIntelligent(board.circuits, key, value, board, board.maxZsUse100Percent));
          }}
          onClearColumn={(key) => {
            setCircuits(clearColumnIntelligent(board.circuits, key, board, board.maxZsUse100Percent));
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
      </TradecertPanel>
      <FindReplaceModal
        open={findReplaceOpen}
        onClose={() => setFindReplaceOpen(false)}
        onApply={(col, find, rep) => {
          setCircuits(replaceInCircuits(board.circuits, col, find, rep));
        }}
      />
      <PasteCircuitsModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        columnLabels={FILLABLE_CIRCUIT_COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
        onApply={(text, startRow, startColIndex) => {
          const grid = parsePastedGrid(text);
          if (grid.length === 0) return;
          setCircuits(
            pasteIntoCircuits(
              board.circuits,
              startRow,
              startColIndex,
              grid,
              board,
              board.maxZsUse100Percent,
            ),
          );
        }}
      />
    </div>
    </TradecertFormLayout>
  );
}
