'use client';

import { Copy, Plus, Trash2 } from 'lucide-react';
import { newId } from '@/lib/electricalCertificates/documentDefaults';
import {
  EMERGENCY_LIGHTING_LUMINAIRE_TYPE_OPTIONS,
  EMERGENCY_LIGHTING_PREMISES_OPTIONS,
  EMERGENCY_LIGHTING_SUPPLY_MODE_OPTIONS,
} from '@/lib/electricalCertificates/emergencyLightingItems';
import type {
  EmergencyLightingCertificateData,
  EmergencyLightingEditorSectionKey,
  EmergencyLightingFaultRepair,
  EmergencyLightingModification,
  EmergencyLightingOutcome,
  EmergencyLightingTestItem,
} from '@/lib/electricalCertificates/types';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { OutcomeButtons, SectionCard, SelectField, TextAreaField, TextField } from './FormFields';

export type EmergencyLightingEngineer = { key: string; full_name: string; role_position: string | null };
export type UpdateEmergencyLighting = (updater: (data: EmergencyLightingCertificateData) => EmergencyLightingCertificateData) => void;

const OUTCOME_OPTIONS = [
  { value: 'pass', label: 'PASS', className: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { value: 'fail', label: 'FAIL', className: 'border-rose-500 bg-rose-50 text-rose-800' },
  { value: 'na', label: 'N/A', className: 'border-slate-400 bg-slate-50 text-slate-700' },
];

type Props = {
  section: EmergencyLightingEditorSectionKey;
  data: EmergencyLightingCertificateData;
  update: UpdateEmergencyLighting;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EmergencyLightingEngineer[];
  onAddModification: () => void;
  onAddTestItem: () => void;
  onAddFaultRepair: () => void;
};

export function EmergencyLightingSections({
  section,
  data,
  update,
  certificate,
  engineers,
  onAddModification,
  onAddTestItem,
  onAddFaultRepair,
}: Props) {
  if (section === 'installation-details') {
    return <InstallationSection data={data} update={update} certificate={certificate} engineers={engineers} />;
  }
  if (section === 'modifications') return <ModificationsSection data={data} update={update} onAdd={onAddModification} />;
  if (section === 'test-schedule') return <TestScheduleSection data={data} update={update} onAdd={onAddTestItem} />;
  return <FaultsRepairsSection data={data} update={update} onAdd={onAddFaultRepair} />;
}

function InstallationSection({
  data,
  update,
  certificate,
  engineers,
}: {
  data: EmergencyLightingCertificateData;
  update: UpdateEmergencyLighting;
  certificate: { customer_full_name: string | null; installation_label: string | null };
  engineers: EmergencyLightingEngineer[];
}) {
  const patchInstallation = (patch: Partial<EmergencyLightingCertificateData['installation']>) =>
    update((prev) => ({ ...prev, installation: { ...prev.installation, ...patch } }));
  const patchDeclaration = (patch: Partial<EmergencyLightingCertificateData['declaration']>) =>
    update((prev) => ({ ...prev, declaration: { ...prev.declaration, ...patch } }));
  const pickEngineer = (field: 'inspected' | 'authorised', key: string) => {
    const member = engineers.find((e) => e.key === key);
    if (!member) return;
    patchDeclaration(
      field === 'inspected'
        ? { inspectedBy: member.full_name, inspectedPosition: member.role_position ?? '' }
        : { authorisedBy: member.full_name, authorisedPosition: member.role_position ?? '' },
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Details of the client">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Client:</span> {certificate.customer_full_name ?? '—'}
          </p>
        </SectionCard>
        <SectionCard title="Details of the installation">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Installation:</span> {certificate.installation_label ?? '—'}
          </p>
          <TextField label="Occupier name" value={data.installation.occupierName} onChange={(occupierName) => patchInstallation({ occupierName })} />
          <div className="flex flex-wrap gap-2">
            <MiniButton label="Tenant" onClick={() => patchInstallation({ occupierName: 'Tenant' })} />
            <MiniButton label="Unknown" onClick={() => patchInstallation({ occupierName: 'Unknown' })} />
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Emergency lighting system details">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Full duration tests involve discharging the batteries, so the emergency lighting system will not be fully functional until recharged.
        </p>
        <SelectField label="Description of premises" value={data.installation.premisesType} onChange={(premisesType) => patchInstallation({ premisesType })} options={EMERGENCY_LIGHTING_PREMISES_OPTIONS} />
        <TextAreaField label="System description" value={data.installation.systemDescription} onChange={(systemDescription) => patchInstallation({ systemDescription })} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Manufacturer" value={data.installation.manufacturer} onChange={(manufacturer) => patchInstallation({ manufacturer })} />
          <TextField label="Manufacturer phone" value={data.installation.manufacturerPhone} onChange={(manufacturerPhone) => patchInstallation({ manufacturerPhone })} />
          <TextField label="Installer" value={data.installation.installer} onChange={(installer) => patchInstallation({ installer })} />
          <TextField label="Installer phone" value={data.installation.installerPhone} onChange={(installerPhone) => patchInstallation({ installerPhone })} />
          <TextField label="Inspection date" type="date" value={data.installation.inspectionDate} onChange={(inspectionDate) => patchInstallation({ inspectionDate })} />
          <TextField label="Next inspection date" type="date" value={data.installation.nextInspectionDate} onChange={(nextInspectionDate) => patchInstallation({ nextInspectionDate })} />
        </div>
        <SelectField
          label="Overall assessment"
          value={data.installation.overallAssessment}
          onChange={(overallAssessment) => patchInstallation({ overallAssessment: overallAssessment as EmergencyLightingCertificateData['installation']['overallAssessment'] })}
          options={[
            { value: 'satisfactory', label: 'Satisfactory' },
            { value: 'unsatisfactory', label: 'Unsatisfactory' },
          ]}
        />
      </SectionCard>
      <SectionCard title="Declaration">
        <div className="grid gap-4 md:grid-cols-2">
          <EngineerSelect label="Inspected by" engineers={engineers} value={data.declaration.inspectedBy} onSelect={(key) => pickEngineer('inspected', key)} />
          <TextField label="Inspected date" type="date" value={data.declaration.inspectedDate} onChange={(inspectedDate) => patchDeclaration({ inspectedDate })} />
          <EngineerSelect label="Authorised by" engineers={engineers} value={data.declaration.authorisedBy} onSelect={(key) => pickEngineer('authorised', key)} />
          <TextField label="Authorised date" type="date" value={data.declaration.authorisedDate} onChange={(authorisedDate) => patchDeclaration({ authorisedDate })} />
        </div>
      </SectionCard>
    </div>
  );
}

function ModificationsSection({ data, update, onAdd }: { data: EmergencyLightingCertificateData; update: UpdateEmergencyLighting; onAdd: () => void }) {
  const updateItem = (id: string, patch: Partial<EmergencyLightingModification>) =>
    update((prev) => ({ ...prev, modifications: prev.modifications.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id: string) => update((prev) => ({ ...prev, modifications: prev.modifications.filter((item) => item.id !== id) }));
  const copyItem = (item: EmergencyLightingModification) =>
    update((prev) => ({ ...prev, modifications: [...prev.modifications, { ...item, id: newId('emmod'), photos: item.photos.map(clonePhoto) }] }));

  return (
    <RepeatableShell title="Modifications" hint="Record changes made to the emergency lighting installation." addLabel="Add modification" onAdd={onAdd} empty={!data.modifications.length}>
      {data.modifications.map((item) => (
        <SectionCard key={item.id} title={item.location || 'Modification'}>
          <ItemActions onCopy={() => copyItem(item)} onRemove={() => removeItem(item.id)} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Location" value={item.location} onChange={(location) => updateItem(item.id, { location })} />
            <TextField label="Date" type="date" value={item.date} onChange={(date) => updateItem(item.id, { date })} />
          </div>
          <TextAreaField label="Details" value={item.details} onChange={(details) => updateItem(item.id, { details })} />
          <TextAreaField label="Notes" value={item.notes} onChange={(notes) => updateItem(item.id, { notes })} />
          <CertificatePhotoGallery photos={item.photos} onChange={(photos) => updateItem(item.id, { photos })} />
        </SectionCard>
      ))}
    </RepeatableShell>
  );
}

function TestScheduleSection({ data, update, onAdd }: { data: EmergencyLightingCertificateData; update: UpdateEmergencyLighting; onAdd: () => void }) {
  const updateItem = (id: string, patch: Partial<EmergencyLightingTestItem>) =>
    update((prev) => ({ ...prev, testSchedule: prev.testSchedule.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id: string) => update((prev) => ({ ...prev, testSchedule: prev.testSchedule.filter((item) => item.id !== id) }));
  const copyItem = (item: EmergencyLightingTestItem) =>
    update((prev) => ({ ...prev, testSchedule: [...prev.testSchedule, { ...item, id: newId('emtest'), reference: `${item.reference || 'EL'}-copy`, photos: item.photos.map(clonePhoto) }] }));

  return (
    <RepeatableShell title="Test schedule" hint="Record each emergency luminaire and its test results." addLabel="Add test" onAdd={onAdd} empty={!data.testSchedule.length}>
      {data.testSchedule.map((item) => (
        <SectionCard key={item.id} title={item.reference || item.location || 'Emergency light'}>
          <ItemActions onCopy={() => copyItem(item)} onRemove={() => removeItem(item.id)} />
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Reference" value={item.reference} onChange={(reference) => updateItem(item.id, { reference })} />
            <TextField label="Location" value={item.location} onChange={(location) => updateItem(item.id, { location })} />
            <SelectField label="Luminaire type" value={item.luminaireType} onChange={(luminaireType) => updateItem(item.id, { luminaireType })} options={EMERGENCY_LIGHTING_LUMINAIRE_TYPE_OPTIONS} />
            <SelectField label="Supply mode" value={item.supplyMode} onChange={(supplyMode) => updateItem(item.id, { supplyMode })} options={EMERGENCY_LIGHTING_SUPPLY_MODE_OPTIONS} />
            <TextField label="Battery type" value={item.batteryType} onChange={(batteryType) => updateItem(item.id, { batteryType })} />
            <TextField label="Lamp type" value={item.lampType} onChange={(lampType) => updateItem(item.id, { lampType })} />
            <TextField label="Duration (minutes)" value={item.durationMinutes} onChange={(durationMinutes) => updateItem(item.id, { durationMinutes })} />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Outcome label="Charge indicator" value={item.chargeIndicator} onChange={(chargeIndicator) => updateItem(item.id, { chargeIndicator })} />
            <Outcome label="Functional test" value={item.functionalTest} onChange={(functionalTest) => updateItem(item.id, { functionalTest })} />
            <Outcome label="Duration test" value={item.durationTest} onChange={(durationTest) => updateItem(item.id, { durationTest })} />
            <Outcome label="Result" value={item.result} onChange={(result) => updateItem(item.id, { result })} />
          </div>
          <TextAreaField label="Notes" value={item.notes} onChange={(notes) => updateItem(item.id, { notes })} />
          <CertificatePhotoGallery photos={item.photos} onChange={(photos) => updateItem(item.id, { photos })} />
        </SectionCard>
      ))}
    </RepeatableShell>
  );
}

function FaultsRepairsSection({ data, update, onAdd }: { data: EmergencyLightingCertificateData; update: UpdateEmergencyLighting; onAdd: () => void }) {
  const updateItem = (id: string, patch: Partial<EmergencyLightingFaultRepair>) =>
    update((prev) => ({ ...prev, faultsAndRepairs: prev.faultsAndRepairs.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id: string) => update((prev) => ({ ...prev, faultsAndRepairs: prev.faultsAndRepairs.filter((item) => item.id !== id) }));
  const copyItem = (item: EmergencyLightingFaultRepair) =>
    update((prev) => ({ ...prev, faultsAndRepairs: [...prev.faultsAndRepairs, { ...item, id: newId('emfault'), photos: item.photos.map(clonePhoto) }] }));

  return (
    <RepeatableShell title="Faults and repairs" hint="Record faults found and any repairs completed." addLabel="Add fault" onAdd={onAdd} empty={!data.faultsAndRepairs.length}>
      {data.faultsAndRepairs.map((item) => (
        <SectionCard key={item.id} title={item.reference || item.location || 'Fault / repair'}>
          <ItemActions onCopy={() => copyItem(item)} onRemove={() => removeItem(item.id)} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Reference" value={item.reference} onChange={(reference) => updateItem(item.id, { reference })} />
            <TextField label="Location" value={item.location} onChange={(location) => updateItem(item.id, { location })} />
            <TextField label="Repaired by" value={item.repairedBy} onChange={(repairedBy) => updateItem(item.id, { repairedBy })} />
            <TextField label="Repaired date" type="date" value={item.repairedDate} onChange={(repairedDate) => updateItem(item.id, { repairedDate })} />
          </div>
          <TextAreaField label="Fault" value={item.fault} onChange={(fault) => updateItem(item.id, { fault })} />
          <TextAreaField label="Repair / action taken" value={item.repair} onChange={(repair) => updateItem(item.id, { repair })} />
          <Outcome label="Result" value={item.result} onChange={(result) => updateItem(item.id, { result })} />
          <TextAreaField label="Notes" value={item.notes} onChange={(notes) => updateItem(item.id, { notes })} />
          <CertificatePhotoGallery photos={item.photos} onChange={(photos) => updateItem(item.id, { photos })} />
        </SectionCard>
      ))}
    </RepeatableShell>
  );
}

function RepeatableShell({ title, hint, addLabel, onAdd, empty, children }: { title: string; hint: string; addLabel: string; onAdd: () => void; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{hint}</p>
        </div>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg border border-[#14B8A6]/40 bg-[#14B8A6]/10 px-3 py-2 text-sm font-semibold text-[#0f766e] hover:bg-[#14B8A6]/15">
          <Plus className="size-4" />
          {addLabel}
        </button>
      </div>
      {empty ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">No records added yet</div> : children}
    </div>
  );
}

function Outcome({ label, value, onChange }: { label: string; value: EmergencyLightingOutcome; onChange: (value: EmergencyLightingOutcome) => void }) {
  return <OutcomeButtons label={label} value={value} onChange={(v) => onChange(v as EmergencyLightingOutcome)} options={OUTCOME_OPTIONS} />;
}

function EngineerSelect({ label, engineers, value, onSelect }: { label: string; engineers: EmergencyLightingEngineer[]; value: string; onSelect: (key: string) => void }) {
  const matched = engineers.find((e) => e.full_name === value)?.key ?? '';
  return (
    <SelectField
      label={label}
      value={matched}
      onChange={onSelect}
      options={engineers.map((engineer) => ({ value: engineer.key, label: engineer.full_name }))}
    />
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

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
      {label}
    </button>
  );
}

function clonePhoto<T extends { id: string }>(photo: T): T {
  return { ...photo, id: newId('ph') };
}

