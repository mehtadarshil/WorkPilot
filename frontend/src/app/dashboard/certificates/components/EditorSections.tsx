'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Copy, Printer, Calculator, ChevronUp, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cloneBoard, moveItem } from '@/lib/electricalCertificates/documentHelpers';
import { recalculateAllCircuits } from '@/lib/electricalCertificates/circuitCalculations';
import { INSPECTION_SCHEDULE_PRESETS } from '@/lib/electricalCertificates/inspectionSchedulePresets';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { useCertificateEditor } from '../CertificateEditorContext';
import {
  INSPECTION_SCHEDULE_ITEMS,
  INSPECTION_SECTION_LABELS,
} from '@/lib/electricalCertificates/inspectionScheduleItems';
import { emptyBoard, emptyCircuit, newId } from '@/lib/electricalCertificates/documentDefaults';
import type { InspectionOutcome, ObservationItem } from '@/lib/electricalCertificates/types';
import {
  FieldLabel,
  INSPECTION_OUTCOMES,
  OutcomeButtons,
  PASS_FAIL_OPTIONS,
  SectionCard,
  SelectField,
  TextAreaField,
  TextField,
  YES_NO_OPTIONS,
} from './FormFields';

const PREMISES_TYPES = [
  { value: 'domestic', label: 'Domestic' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'other', label: 'Other' },
];

const EARTHING_TYPES = [
  { value: 'TN-S', label: 'TN-S' },
  { value: 'TN-C-S', label: 'TN-C-S' },
  { value: 'TN-C', label: 'TN-C' },
  { value: 'TT', label: 'TT' },
  { value: 'IT', label: 'IT' },
];

const OBS_CODES = [
  { value: 'c1', label: 'C1' },
  { value: 'c2', label: 'C2' },
  { value: 'c3', label: 'C3' },
  { value: 'fi', label: 'FI' },
];

export function InstallationDetailsSection() {
  const { document, setDocument } = useCertificateEditor();
  const inst = document.installation;
  const patch = (p: Partial<typeof inst>) =>
    setDocument((d) => ({ ...d, installation: { ...d.installation, ...p } }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Client & installation">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={inst.hideClientOnReport}
            onChange={(e) => patch({ hideClientOnReport: e.target.checked })}
          />
          Hide client details on report
        </label>
        <TextField label="Reason for report" value={inst.reason} onChange={(v) => patch({ reason: v })} />
        <TextField
          label="Date inspection carried out"
          type="date"
          value={inst.inspectionDate}
          onChange={(v) => patch({ inspectionDate: v })}
        />
        <TextField label="Occupier name" value={inst.occupierName} onChange={(v) => patch({ occupierName: v })} />
        <SelectField
          label="Description of premises"
          value={inst.premisesType}
          onChange={(v) => patch({ premisesType: v })}
          options={PREMISES_TYPES}
        />
        <OutcomeButtons
          label="Records available"
          value={inst.recordsAvailable}
          onChange={(v) => patch({ recordsAvailable: v })}
          options={YES_NO_OPTIONS}
        />
      </SectionCard>

      <SectionCard title="Previous inspection">
        <TextField
          label="Date of previous inspection"
          type="date"
          value={inst.previousInspectionDate}
          onChange={(v) => patch({ previousInspectionDate: v })}
        />
        <TextField
          label="Previous certificate number"
          value={inst.previousCertNumber}
          onChange={(v) => patch({ previousCertNumber: v })}
        />
        <TextField
          label="Estimated age of installation (years)"
          value={inst.estimatedAge}
          onChange={(v) => patch({ estimatedAge: v })}
        />
        <TextAreaField
          label="Evidence of additions or alterations"
          value={inst.alterationsEvidence}
          onChange={(v) => patch({ alterationsEvidence: v })}
        />
      </SectionCard>

      <SectionCard title="Extent & limitations">
        <TextAreaField label="Extent of installation covered" value={inst.extent} onChange={(v) => patch({ extent: v })} />
        <TextAreaField
          label="Operational limitations"
          value={inst.operationalLimitations}
          onChange={(v) => patch({ operationalLimitations: v })}
        />
        <TextAreaField
          label="Agreed limitations"
          value={inst.agreedLimitations}
          onChange={(v) => patch({ agreedLimitations: v })}
        />
        <TextField label="Agreed with" value={inst.agreedWith} onChange={(v) => patch({ agreedWith: v })} />
      </SectionCard>

      <SectionCard title="Summary & sign-off">
        <TextAreaField
          label="General condition of the installation"
          value={inst.generalCondition}
          onChange={(v) => patch({ generalCondition: v })}
        />
        <SelectField
          label="Overall assessment"
          value={inst.overallAssessment}
          onChange={(v) => patch({ overallAssessment: v })}
          options={[
            { value: 'satisfactory', label: 'Satisfactory' },
            { value: 'unsatisfactory', label: 'Unsatisfactory' },
          ]}
        />
        <TextField label="Inspected and tested by" value={inst.inspectedBy} onChange={(v) => patch({ inspectedBy: v })} />
        <TextField
          label="Inspected date"
          type="date"
          value={inst.inspectedDate}
          onChange={(v) => patch({ inspectedDate: v })}
        />
        <TextField label="Authorised for issue by" value={inst.authorisedBy} onChange={(v) => patch({ authorisedBy: v })} />
        <TextField
          label="Authorised date"
          type="date"
          value={inst.authorisedDate}
          onChange={(v) => patch({ authorisedDate: v })}
        />
        <TextField
          label="Recommended re-inspection"
          value={inst.reinspectionPeriod}
          onChange={(v) => patch({ reinspectionPeriod: v })}
          placeholder="e.g. 5 years"
        />
      </SectionCard>
    </div>
  );
}

export function ObservationsSection() {
  const { document, setDocument } = useCertificateEditor();
  const obs = document.observations;

  const addObservation = () => {
    const item: ObservationItem = { id: newId('obs'), code: 'c2', details: '', location: '' };
    setDocument((d) => ({
      ...d,
      observations: { ...d.observations, items: [...d.observations.items, item] },
    }));
  };

  const updateItem = (id: string, patch: Partial<ObservationItem>) => {
    setDocument((d) => ({
      ...d,
      observations: {
        ...d.observations,
        items: d.observations.items.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      },
    }));
  };

  const removeItem = (id: string) => {
    setDocument((d) => ({
      ...d,
      observations: { ...d.observations, items: d.observations.items.filter((o) => o.id !== id) },
    }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Observations">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={obs.noRemedialRequired}
            onChange={(e) =>
              setDocument((d) => ({
                ...d,
                observations: { ...d.observations, noRemedialRequired: e.target.checked },
              }))
            }
          />
          No remedial action required
        </label>
        <button
          type="button"
          onClick={addObservation}
          className="flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d9488]"
        >
          <Plus className="size-4" /> Add observation
        </button>
        {obs.items.length === 0 ? (
          <p className="text-sm text-slate-500">No observations recorded.</p>
        ) : (
          <ul className="space-y-3">
            {obs.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <SelectField
                    label="Code"
                    value={item.code}
                    onChange={(v) => updateItem(item.id, { code: v as ObservationItem['code'] })}
                    options={OBS_CODES}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <TextField label="Location" value={item.location} onChange={(v) => updateItem(item.id, { location: v })} />
                <TextAreaField
                  label="Details"
                  value={item.details}
                  onChange={(v) => updateItem(item.id, { details: v })}
                  rows={4}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

export function SupplyCharacteristicsSection() {
  const { document, setDocument } = useCertificateEditor();
  const sup = document.supply;
  const patch = (p: Partial<typeof sup>) => setDocument((d) => ({ ...d, supply: { ...d.supply, ...p } }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Earthing & supply">
        <SelectField label="Earthing arrangement" value={sup.earthing} onChange={(v) => patch({ earthing: v })} options={EARTHING_TYPES} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Ze (Ω)" value={sup.ze} onChange={(v) => patch({ ze: v })} />
          <TextField label="Ipf (kA)" value={sup.ipf} onChange={(v) => patch({ ipf: v })} />
        </div>
        <TextField label="Number and type of live conductors" value={sup.phases} onChange={(v) => patch({ phases: v })} placeholder="e.g. 1-phase 2 wire" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nominal voltage U" value={sup.nominalU} onChange={(v) => patch({ nominalU: v })} />
          <TextField label="Nominal voltage Uo" value={sup.nominalUo} onChange={(v) => patch({ nominalUo: v })} />
        </div>
        <OutcomeButtons
          label="Supply polarity confirmed"
          value={sup.polarityConfirmed}
          onChange={(v) => patch({ polarityConfirmed: v })}
          options={PASS_FAIL_OPTIONS}
        />
      </SectionCard>

      <SectionCard title="Supply protective device">
        <TextField label="BS (EN)" value={sup.supplyDeviceBs} onChange={(v) => patch({ supplyDeviceBs: v })} />
        <TextField label="Type" value={sup.supplyDeviceType} onChange={(v) => patch({ supplyDeviceType: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Short circuit capacity (kA)" value={sup.supplyDeviceKa} onChange={(v) => patch({ supplyDeviceKa: v })} />
          <TextField label="Rated current (A)" value={sup.supplyDeviceA} onChange={(v) => patch({ supplyDeviceA: v })} />
        </div>
      </SectionCard>

      <SectionCard title="Main switch / RCD">
        <TextField label="BS (EN)" value={sup.mainSwitchBs} onChange={(v) => patch({ mainSwitchBs: v })} />
        <TextField label="Number of poles" value={sup.mainSwitchPoles} onChange={(v) => patch({ mainSwitchPoles: v })} />
        <TextField label="Voltage rating" value={sup.mainSwitchV} onChange={(v) => patch({ mainSwitchV: v })} />
        <TextField label="Rated current" value={sup.mainSwitchIn} onChange={(v) => patch({ mainSwitchIn: v })} />
        <TextField label="Fuse device setting" value={sup.fuseSetting} onChange={(v) => patch({ fuseSetting: v })} />
        <TextField label="Location" value={sup.mainSwitchLocation} onChange={(v) => patch({ mainSwitchLocation: v })} />
        <TextField label="Conductor material" value={sup.conductorMaterial} onChange={(v) => patch({ conductorMaterial: v })} />
        <TextField label="Conductor CSA" value={sup.conductorCsa} onChange={(v) => patch({ conductorCsa: v })} />
        <TextField label="RCD IΔn" value={sup.rcdIdn} onChange={(v) => patch({ rcdIdn: v })} />
        <TextField label="RCD time delay" value={sup.rcdDelay} onChange={(v) => patch({ rcdDelay: v })} />
        <TextField label="RCD operating time" value={sup.rcdTime} onChange={(v) => patch({ rcdTime: v })} />
      </SectionCard>

      <SectionCard title="Earthing & bonding">
        <TextField label="Earthing conductor material" value={sup.earthMaterial} onChange={(v) => patch({ earthMaterial: v })} />
        <TextField label="Earthing conductor CSA" value={sup.earthCsa} onChange={(v) => patch({ earthCsa: v })} />
        <OutcomeButtons label="Earthing continuity" value={sup.earthContinuity} onChange={(v) => patch({ earthContinuity: v })} options={PASS_FAIL_OPTIONS} />
        <TextField label="Bonding material" value={sup.bondMaterial} onChange={(v) => patch({ bondMaterial: v })} />
        <TextField label="Bonding CSA" value={sup.bondCsa} onChange={(v) => patch({ bondCsa: v })} />
        <OutcomeButtons label="Bonding continuity" value={sup.bondContinuity} onChange={(v) => patch({ bondContinuity: v })} options={PASS_FAIL_OPTIONS} />
        <OutcomeButtons label="Water" value={sup.bondWater} onChange={(v) => patch({ bondWater: v })} options={PASS_FAIL_OPTIONS} />
        <OutcomeButtons label="Gas" value={sup.bondGas} onChange={(v) => patch({ bondGas: v })} options={PASS_FAIL_OPTIONS} />
        <OutcomeButtons label="Oil" value={sup.bondOil} onChange={(v) => patch({ bondOil: v })} options={PASS_FAIL_OPTIONS} />
        <OutcomeButtons label="Structural steel" value={sup.bondSteel} onChange={(v) => patch({ bondSteel: v })} options={PASS_FAIL_OPTIONS} />
        <OutcomeButtons label="Lightning" value={sup.bondLightning} onChange={(v) => patch({ bondLightning: v })} options={PASS_FAIL_OPTIONS} />
      </SectionCard>
    </div>
  );
}

export function InspectionScheduleSection() {
  const { document, setDocument, certificate } = useCertificateEditor();
  const schedule = document.inspectionSchedule;
  const [presetId, setPresetId] = useState('');

  const setOutcome = (itemId: string, outcome: InspectionOutcome) => {
    setDocument((d) => ({
      ...d,
      inspectionSchedule: { ...d.inspectionSchedule, [itemId]: outcome },
    }));
  };

  const setSectionAll = (section: string, outcome: InspectionOutcome) => {
    setDocument((d) => {
      const next = { ...d.inspectionSchedule };
      for (const item of INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === section)) {
        next[item.id] = outcome;
      }
      return { ...d, inspectionSchedule: next };
    });
  };

  const sections = [...new Set(INSPECTION_SCHEDULE_ITEMS.map((i) => i.section))];

  const applyPreset = () => {
    const preset = INSPECTION_SCHEDULE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!window.confirm(`Apply preset "${preset.label}"? This will overwrite current outcomes.`)) return;
    setDocument((d) => ({ ...d, inspectionSchedule: preset.apply() }));
    setPresetId('');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionCard title="Schedule presets">
        <p className="mb-3 text-sm text-slate-600">
          Quickly fill the inspection schedule with a common outcome pattern (BS 7671 EICR).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 text-sm font-medium text-slate-700">
            Preset
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Choose preset…</option>
              {INSPECTION_SCHEDULE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!presetId}
            onClick={applyPreset}
            className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Apply preset
          </button>
        </div>
        {presetId && (
          <p className="mt-2 text-xs text-slate-500">
            {INSPECTION_SCHEDULE_PRESETS.find((p) => p.id === presetId)?.description}
          </p>
        )}
      </SectionCard>
      {sections.map((sec) => {
        const items = INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
        return (
          <SectionCard key={sec} title={`${sec}. ${INSPECTION_SECTION_LABELS[sec] ?? sec}`}>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSectionAll(sec, 'pass')}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Set all to PASS
              </button>
              <button
                type="button"
                onClick={() => setSectionAll(sec, 'na')}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Set all to N/A
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-slate-800">
                    <span className="font-mono text-slate-500">{item.id}</span> {item.label}
                  </span>
                  <OutcomeButtons
                    label=""
                    value={schedule[item.id] ?? ''}
                    onChange={(v) => setOutcome(item.id, v as InspectionOutcome)}
                    options={INSPECTION_OUTCOMES}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        );
      })}
      <p className="text-center text-xs text-slate-400">{certificate.certificate_number}</p>
    </div>
  );
}

export function BoardsListSection() {
  const router = useRouter();
  const { certificate, document, setDocument } = useCertificateEditor();
  const base = `/dashboard/certificates/${certificate.id}`;
  const boardsBase = `${base}/boards`;

  const addBoard = () => {
    const n = document.boards.length + 1;
    setDocument((d) => ({ ...d, boards: [...d.boards, emptyBoard(`DB-${n}`)] }));
  };

  const removeBoard = (id: string) => {
    if (document.boards.length <= 1) return;
    if (!window.confirm('Delete this board?')) return;
    setDocument((d) => ({ ...d, boards: d.boards.filter((b) => b.id !== id) }));
  };

  const copyBoardAt = (boardId: string) => {
    const board = document.boards.find((b) => b.id === boardId);
    if (!board) return;
    const copy = cloneBoard(board);
    setDocument((d) => ({ ...d, boards: [...d.boards, copy] }));
    router.push(`${boardsBase}/${copy.id}`);
  };

  const moveBoard = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= document.boards.length) return;
    setDocument((d) => ({ ...d, boards: moveItem(d.boards, index, to) }));
  };

  const recalculateAllBoards = () => {
    setDocument((d) => ({
      ...d,
      boards: d.boards.map((b) => ({
        ...b,
        circuits: recalculateAllCircuits(b.circuits, b, b.maxZsUse100Percent, true),
      })),
    }));
  };

  const printAllSchedules = () => {
    document.boards.forEach((b) => {
      window.open(`${base}/boards/${b.id}/print`, '_blank');
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Distribution boards</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={printAllSchedules}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="size-4" /> Print schedules
          </button>
          <button
            type="button"
            onClick={recalculateAllBoards}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Calculator className="size-4" /> Recalculate all
          </button>
          <button
            type="button"
            onClick={addBoard}
            className="flex items-center gap-1 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> Add board
          </button>
        </div>
      </div>
      <ul className="space-y-3">
        {document.boards.map((board, index) => (
          <li key={board.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`${boardsBase}/${board.id}`} className="text-base font-bold text-[#0d9488] hover:underline">
                  {board.name}
                </Link>
                <p className="text-sm text-slate-600">
                  {board.circuits.length} circuit{board.circuits.length === 1 ? '' : 's'} ·{' '}
                  {board.status === 'done' ? 'Done' : 'In progress'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {board.status === 'done' && <CheckCircle2 className="size-5 text-emerald-600" />}
                <button
                  type="button"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => moveBoard(index, -1)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  title="Move down"
                  disabled={index === document.boards.length - 1}
                  onClick={() => moveBoard(index, 1)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  title="Copy board"
                  onClick={() => copyBoardAt(board.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  title="Print schedule"
                  onClick={() => window.open(`${base}/boards/${board.id}/print`, '_blank')}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Printer className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeBoard(board.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  disabled={document.boards.length <= 1}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <Link
              href={`${boardsBase}/${board.id}`}
              className="mt-3 inline-block text-sm font-semibold text-[#14B8A6] hover:underline"
            >
              Edit board & circuits →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppendixSection() {
  const { document, setDocument } = useCertificateEditor();
  return (
    <div className="mx-auto max-w-3xl">
      <SectionCard title="Appendix notes & photos">
        <TextAreaField
          label="Additional information"
          value={document.appendix.content}
          onChange={(v) =>
            setDocument((d) => ({ ...d, appendix: { ...d.appendix, content: v } }))
          }
          rows={12}
          placeholder="Notes, test instrument details, limitations…"
        />
      </SectionCard>
      <SectionCard title="Appendix photographs">
        <CertificatePhotoGallery
          photos={document.appendix.photos}
          onChange={(photos) =>
            setDocument((d) => ({ ...d, appendix: { ...d.appendix, photos } }))
          }
        />
      </SectionCard>
    </div>
  );
}
