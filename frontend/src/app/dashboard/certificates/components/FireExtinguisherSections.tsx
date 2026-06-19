'use client';

import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  emptyFireBlanket,
  emptyFireExtinguisher,
  newId,
} from '@/lib/electricalCertificates/documentDefaults';
import {
  FIRE_EXTINGUISHER_CAPACITY_UNIT_OPTIONS,
  FIRE_EXTINGUISHER_CHECKLIST_ITEMS,
  FIRE_EXTINGUISHER_MAKE_OPTIONS,
  FIRE_EXTINGUISHER_NEXT_INSPECTION_PRESETS,
  FIRE_EXTINGUISHER_PREMISES_OPTIONS,
  FIRE_EXTINGUISHER_SERVICE_CODE_OPTIONS,
  FIRE_EXTINGUISHER_TYPE_OPTIONS,
} from '@/lib/electricalCertificates/fireExtinguisherItems';
import type {
  FireBlanketRecord,
  FireExtinguisherBlanketOutcome,
  FireExtinguisherCertificateData,
  FireExtinguisherChecklistOutcome,
  FireExtinguisherEditorSectionKey,
  FireExtinguisherRecord,
} from '@/lib/electricalCertificates/types';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { DateInput, OutcomeButtons, SectionCard, SelectField, TextAreaField, TextField } from './FormFields';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

const CHECKLIST_OPTIONS = [
  { value: 'yes', label: 'YES', className: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { value: 'no', label: 'NO', className: 'border-rose-500 bg-rose-50 text-rose-800' },
  { value: 'na', label: 'N/A', className: 'border-slate-400 bg-slate-50 text-slate-700' },
];

const BLANKET_OUTCOME_OPTIONS = [
  { value: 'pass', label: 'PASS', className: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { value: 'fail', label: 'FAIL', className: 'border-rose-500 bg-rose-50 text-rose-800' },
];

type EngineerOption = { key: string; full_name: string; role_position: string | null };

export type UpdateFireExtinguisher = (
  updater: (data: FireExtinguisherCertificateData) => FireExtinguisherCertificateData,
) => void;

type Props = {
  section: FireExtinguisherEditorSectionKey;
  data: FireExtinguisherCertificateData;
  update: UpdateFireExtinguisher;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EngineerOption[];
  onAddExtinguisher: () => void;
  onAddBlanket: () => void;
};

export function FireExtinguisherSections({
  section,
  data,
  update,
  certificate,
  engineers,
  onAddExtinguisher,
  onAddBlanket,
}: Props) {
  if (section === 'installation-details') {
    return <InstallationSection data={data} update={update} certificate={certificate} engineers={engineers} />;
  }
  if (section === 'fire-extinguishers') {
    return <ExtinguishersSection data={data} update={update} onAdd={onAddExtinguisher} />;
  }
  if (section === 'fire-blankets') {
    return <BlanketsSection data={data} update={update} onAdd={onAddBlanket} />;
  }
  if (section === 'checklist') {
    return <ChecklistSection data={data} update={update} />;
  }
  return null;
}

function InstallationSection({
  data,
  update,
  certificate,
  engineers,
}: {
  data: FireExtinguisherCertificateData;
  update: UpdateFireExtinguisher;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EngineerOption[];
}) {
  const patchInstallation = (patch: Partial<FireExtinguisherCertificateData['installation']>) =>
    update((prev) => ({ ...prev, installation: { ...prev.installation, ...patch } }));
  const patchDeclaration = (patch: Partial<FireExtinguisherCertificateData['declaration']>) =>
    update((prev) => ({ ...prev, declaration: { ...prev.declaration, ...patch } }));

  const pickEngineer = (field: 'inspected' | 'authorised', key: string) => {
    const member = engineers.find((e) => e.key === key);
    if (!member) return;
    update((prev) => ({
      ...prev,
      declaration: {
        ...prev.declaration,
        ...(field === 'inspected'
          ? { inspectedBy: member.full_name, inspectedPosition: member.role_position ?? '' }
          : { authorisedBy: member.full_name, authorisedPosition: member.role_position ?? '' }),
      },
    }));
  };

  const applyNextInspectionPreset = (preset: FireExtinguisherCertificateData['installation']['nextInspectionPreset']) => {
    const date =
      preset === '6months'
        ? shiftIsoDate(6)
        : preset === '1year'
          ? shiftIsoDate(0, 1)
          : preset === '3years'
            ? shiftIsoDate(0, 3)
            : preset === '5years'
              ? shiftIsoDate(0, 5)
              : data.installation.nextInspectionDate;
    patchInstallation({ nextInspectionPreset: preset, nextInspectionDate: date });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Details of the client">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '—'}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Installation:</span> {certificate.installation_label ?? '—'}
        </p>
      </SectionCard>

      <SectionCard title="Details of the installation">
        <TextField label="Occupier name" value={data.installation.occupierName} onChange={(v) => patchInstallation({ occupierName: v })} />
        <ChoicePanel
          title="Occupier"
          values={['tenant', 'unknown']}
          labels={{ tenant: 'Tenant', unknown: 'Unknown' }}
          value={data.installation.occupierType}
          onChange={(occupierType) => patchInstallation({ occupierType })}
        />
        <SelectField
          label="Description of premises"
          value={data.installation.premisesType}
          onChange={(premisesType) => patchInstallation({ premisesType })}
          options={FIRE_EXTINGUISHER_PREMISES_OPTIONS}
        />
      </SectionCard>

      <SectionCard title="Next inspection">
        <p className="text-sm text-slate-600">
          I/We recommend this installation is further inspected after an interval of not more than:
        </p>
        <ChoicePanel
          title="Interval"
          values={FIRE_EXTINGUISHER_NEXT_INSPECTION_PRESETS.map((p) => p.value)}
          labels={Object.fromEntries(FIRE_EXTINGUISHER_NEXT_INSPECTION_PRESETS.map((p) => [p.value, p.label]))}
          value={data.installation.nextInspectionPreset}
          onChange={(v) => applyNextInspectionPreset(v as FireExtinguisherCertificateData['installation']['nextInspectionPreset'])}
        />
        <DateField label="Select date" value={data.installation.nextInspectionDate} onChange={(nextInspectionDate) => patchInstallation({ nextInspectionDate })} />
      </SectionCard>

      <SectionCard title="Declaration">
        <EngineerSelect label="Inspected and serviced by" engineers={engineers} value={data.declaration.inspectedBy} onSelect={(key) => pickEngineer('inspected', key)} />
        <DateField label="Date" value={data.declaration.inspectedDate} onChange={(inspectedDate) => patchDeclaration({ inspectedDate })} />
        <EngineerSelect label="Authorised for issue by" engineers={engineers} value={data.declaration.authorisedBy} onSelect={(key) => pickEngineer('authorised', key)} />
        <DateField label="Authorised date" value={data.declaration.authorisedDate} onChange={(authorisedDate) => patchDeclaration({ authorisedDate })} />
      </SectionCard>
    </div>
  );
}

function ExtinguishersSection({
  data,
  update,
  onAdd,
}: {
  data: FireExtinguisherCertificateData;
  update: UpdateFireExtinguisher;
  onAdd: () => void;
}) {
  const updateItem = (id: string, patch: Partial<FireExtinguisherRecord>) =>
    update((prev) => ({
      ...prev,
      extinguishers: prev.extinguishers.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  const removeItem = (id: string) =>
    update((prev) => ({ ...prev, extinguishers: prev.extinguishers.filter((item) => item.id !== id) }));
  const copyItem = (item: FireExtinguisherRecord) =>
    update((prev) => ({
      ...prev,
      extinguishers: [
        ...prev.extinguishers,
        {
          ...item,
          id: newId('fex'),
          reference: item.reference ? `${item.reference}-copy` : '',
          photos: item.photos.map((p) => ({ ...p, id: newId('ph') })),
        },
      ],
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionToolbar title="Fire extinguishers" hint="Record each extinguisher tested on this certificate." onAdd={onAdd} addLabel="Add extinguisher" />
      {data.extinguishers.length === 0 ? (
        <EmptyCard message="No fire extinguishers added yet" />
      ) : (
        data.extinguishers.map((item) => (
          <SectionCard key={item.id} title={item.location || item.reference || 'Fire extinguisher'}>
            <ItemActions onCopy={() => copyItem(item)} onRemove={() => removeItem(item.id)} />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Extinguisher location" value={item.location} onChange={(v) => updateItem(item.id, { location: v })} />
              <TextField label="Extinguisher reference" value={item.reference} onChange={(v) => updateItem(item.id, { reference: v })} />
              <SelectField label="Service code" value={item.serviceCode} onChange={(v) => updateItem(item.id, { serviceCode: v })} options={FIRE_EXTINGUISHER_SERVICE_CODE_OPTIONS} />
              <SelectField label="Make" value={item.make} onChange={(v) => updateItem(item.id, { make: v })} options={FIRE_EXTINGUISHER_MAKE_OPTIONS} />
              <SelectField label="Type" value={item.extinguisherType} onChange={(v) => updateItem(item.id, { extinguisherType: v })} options={FIRE_EXTINGUISHER_TYPE_OPTIONS} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <TextField label="Capacity" value={item.capacity} onChange={(v) => updateItem(item.id, { capacity: v })} />
                <SelectField label="Unit" value={item.capacityUnit} onChange={(v) => updateItem(item.id, { capacityUnit: v })} options={FIRE_EXTINGUISHER_CAPACITY_UNIT_OPTIONS} />
              </div>
              <TextField label="Measured weight" value={item.measuredWeight} onChange={(v) => updateItem(item.id, { measuredWeight: v })} placeholder="Enter measured weight" />
              <DateFieldWithShortcuts label="Next discharge date" value={item.nextDischargeDate} onChange={(v) => updateItem(item.id, { nextDischargeDate: v })} years={[1, 3, 5, 10]} />
              <DateFieldWithShortcuts label="End of life date" value={item.endOfLifeDate} onChange={(v) => updateItem(item.id, { endOfLifeDate: v })} years={[1, 3, 5, 10]} />
            </div>
            <TextAreaField label="Notes" value={item.notes} onChange={(v) => updateItem(item.id, { notes: v })} />
            <CertificatePhotoGallery photos={item.photos} onChange={(photos) => updateItem(item.id, { photos })} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

function BlanketsSection({
  data,
  update,
  onAdd,
}: {
  data: FireExtinguisherCertificateData;
  update: UpdateFireExtinguisher;
  onAdd: () => void;
}) {
  const updateItem = (id: string, patch: Partial<FireBlanketRecord>) =>
    update((prev) => ({ ...prev, blankets: prev.blankets.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id: string) => update((prev) => ({ ...prev, blankets: prev.blankets.filter((item) => item.id !== id) }));
  const copyItem = (item: FireBlanketRecord) =>
    update((prev) => ({
      ...prev,
      blankets: [
        ...prev.blankets,
        {
          ...item,
          id: newId('fbl'),
          reference: item.reference ? `${item.reference}-copy` : '',
          photos: item.photos.map((p) => ({ ...p, id: newId('ph') })),
        },
      ],
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionToolbar title="Fire blankets" hint="Record every blanket inspected with location and outcome." onAdd={onAdd} addLabel="Add blanket" />
      {data.blankets.length === 0 ? (
        <EmptyCard message="No fire blankets added yet" />
      ) : (
        data.blankets.map((item) => (
          <SectionCard key={item.id} title={item.location || item.reference || 'Fire blanket'}>
            <ItemActions onCopy={() => copyItem(item)} onRemove={() => removeItem(item.id)} />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Blanket location" value={item.location} onChange={(v) => updateItem(item.id, { location: v })} />
              <TextField label="Blanket reference" value={item.reference} onChange={(v) => updateItem(item.id, { reference: v })} />
              <SelectField label="Make" value={item.make} onChange={(v) => updateItem(item.id, { make: v })} options={FIRE_EXTINGUISHER_MAKE_OPTIONS} />
              <div className="space-y-2">
                <DateField label="Installation date" value={item.installationDate} onChange={(v) => updateItem(item.id, { installationDate: v })} disabled={item.installationDateUnknown} />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={item.installationDateUnknown}
                    onChange={(e) => updateItem(item.id, { installationDateUnknown: e.target.checked, installationDate: e.target.checked ? '' : item.installationDate })}
                  />
                  Unknown
                </label>
              </div>
              <DateFieldWithShortcuts label="Expiry date" value={item.expiryDate} onChange={(v) => updateItem(item.id, { expiryDate: v })} years={[1, 3, 5, 10]} />
            </div>
            <OutcomeButtons
              label="Outcome"
              value={item.outcome}
              onChange={(v) => updateItem(item.id, { outcome: v as FireExtinguisherBlanketOutcome })}
              options={BLANKET_OUTCOME_OPTIONS}
            />
            <TextAreaField label="Notes" value={item.notes} onChange={(v) => updateItem(item.id, { notes: v })} />
            <CertificatePhotoGallery photos={item.photos} onChange={(photos) => updateItem(item.id, { photos })} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

function ChecklistSection({ data, update }: { data: FireExtinguisherCertificateData; update: UpdateFireExtinguisher }) {
  const setOutcome = (id: string, value: FireExtinguisherChecklistOutcome) =>
    update((prev) => ({ ...prev, checklist: { ...prev.checklist, [id]: value } }));
  const setNote = (id: string, value: string) =>
    update((prev) => ({ ...prev, checklistNotes: { ...prev.checklistNotes, [id]: value } }));
  const setAll = (value: FireExtinguisherChecklistOutcome) =>
    update((prev) => ({
      ...prev,
      checklist: Object.fromEntries(FIRE_EXTINGUISHER_CHECKLIST_ITEMS.map((item) => [item.id, value])),
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Checklist">
        <div className="flex flex-wrap gap-2">
          <BulkButton label="Set all as YES" onClick={() => setAll('yes')} />
          <BulkButton label="Set all as NO" onClick={() => setAll('no')} />
          <BulkButton label="Set all as N/A" onClick={() => setAll('na')} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={data.hideChecklistFromReport}
            onChange={(e) => update((prev) => ({ ...prev, hideChecklistFromReport: e.target.checked }))}
          />
          Hide checklist from final report
        </label>
        {FIRE_EXTINGUISHER_CHECKLIST_ITEMS.map((item) => (
          <div key={item.id} className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <OutcomeButtons
              label={item.label}
              value={data.checklist[item.id] ?? ''}
              onChange={(v) => setOutcome(item.id, v as FireExtinguisherChecklistOutcome)}
              options={CHECKLIST_OPTIONS}
            />
            <input
              className={inputClass}
              value={data.checklistNotes[item.id] ?? ''}
              placeholder="Add notes..."
              onChange={(e) => setNote(item.id, e.target.value)}
            />
          </div>
        ))}
        <TextAreaField
          label="Remedial actions / recommendations"
          value={data.remedialActions}
          onChange={(v) => update((prev) => ({ ...prev, remedialActions: v }))}
        />
      </SectionCard>
    </div>
  );
}

function SectionToolbar({ title, hint, onAdd, addLabel }: { title: string; hint: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-lg border border-[#14B8A6]/40 bg-[#14B8A6]/10 px-3 py-2 text-sm font-semibold text-[#0f766e] hover:bg-[#14B8A6]/15"
      >
        <Plus className="size-4" />
        {addLabel}
      </button>
    </div>
  );
}

function ItemActions({ onCopy, onRemove }: { onCopy: () => void; onRemove: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800">
        <Copy className="size-4" />
        Copy
      </button>
      <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700">
        <Trash2 className="size-4" />
        Remove
      </button>
    </div>
  );
}

function BulkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
      {label}
    </button>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">{message}</div>
  );
}

function EngineerSelect({ label, engineers, value, onSelect }: { label: string; engineers: EngineerOption[]; value: string; onSelect: (key: string) => void }) {
  const matched = engineers.find((e) => e.full_name === value)?.key ?? '';
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} value={matched} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Select team member...</option>
        {engineers.map((engineer) => (
          <option key={engineer.key} value={engineer.key}>{engineer.full_name}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <DateInput
            label={label}
            value={value}
            onChange={onChange}
            inputClassName={inputClass}
            labelClassName={labelClass}
            placeholder={disabled ? '' : 'DD/MM/YYYY'}
          />
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange(today)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 mb-0.5">
          Today
        </button>
      </div>
    </div>
  );
}

function DateFieldWithShortcuts({
  label,
  value,
  onChange,
  years,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  years: number[];
}) {
  return (
    <div className="space-y-2">
      <DateField label={label} value={value} onChange={onChange} />
      <div className="flex flex-wrap gap-1">
        {years.map((y) => (
          <button key={y} type="button" onClick={() => onChange(shiftIsoDate(0, y))} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {y} {y === 1 ? 'year' : 'years'}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoicePanel({
  title,
  values,
  labels = {},
  value,
  onChange,
}: {
  title: string;
  values: readonly string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className={labelClass}>{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              value === item ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#0d9488]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {labels[item] ?? item}
          </button>
        ))}
      </div>
    </div>
  );
}

function shiftIsoDate(months: number, years = 0): string {
  const d = new Date();
  if (years) d.setFullYear(d.getFullYear() + years);
  if (months) d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
