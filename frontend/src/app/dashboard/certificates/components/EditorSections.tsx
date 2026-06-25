'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Copy, Printer, Calculator, ChevronUp, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cloneBoard, moveItem } from '@/lib/electricalCertificates/documentHelpers';
import { recalculateAllCircuits } from '@/lib/electricalCertificates/circuitCalculations';
import { INSPECTION_SCHEDULE_PRESETS } from '@/lib/electricalCertificates/inspectionSchedulePresets';
import { REINSPECTION_QUICK_OPTIONS, sortObservationsByCodeAndLocation } from '@/lib/electricalCertificates/certificateUxUtils';
import { CertificatePhotoGallery } from './CertificatePhotoGallery';
import { DeclarationSignatureField } from './DeclarationSignatureField';
import { useCertificateEditor } from '../CertificateEditorContext';
import {
  INSPECTION_SCHEDULE_ITEMS,
  INSPECTION_SECTION_LABELS,
} from '@/lib/electricalCertificates/inspectionScheduleItems';
import { emptyBoard, newId } from '@/lib/electricalCertificates/documentDefaults';
import type { InspectionOutcome, ObservationItem } from '@/lib/electricalCertificates/types';
import {
  InspectionOutcomePicker,
  OutcomeButtons,
  PASS_FAIL_OPTIONS,
  QuickSetSelectField,
  QuickSetTextField,
  QuickSetTextAreaField,
  SELECT_QUICK_NA_LIM,
  SELECT_QUICK_NA_LIM_UNKNOWN,
  SectionCard,
  SelectField,
  TEXT_QUICK_NA_LIM,
  TextAreaField,
  TextField,
  YES_NO_OPTIONS,
} from './FormFields';
import { TradecertFieldGrid, TradecertFormLayout, TradecertPanel } from './TradecertFormLayout';

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

const AC_DC_OPTIONS = [
  { value: 'ac', label: '~ AC' },
  { value: 'dc', label: '⎓ DC' },
];

const LIVE_CONDUCTOR_OPTIONS = [
  { value: '1-phase (2 wire)', label: '1-phase (2 wire)' },
  { value: '1-phase (3 wire)', label: '1-phase (3 wire)' },
  { value: '2-phase (3 wire)', label: '2-phase (3 wire)' },
  { value: '3-phase (3 wire)', label: '3-phase (3 wire)' },
  { value: '3-phase (4 wire)', label: '3-phase (4 wire)' },
];

const DC_CONDUCTOR_OPTIONS = [
  { value: '2 pole', label: '2 pole' },
  { value: '3 pole', label: '3 pole' },
  { value: 'Other', label: 'Other...' },
];

const NUMBER_OF_SUPPLIES_OPTIONS = ['1', '2', '3', '4', '5', '6', 'N/A', 'Other'].map((value) => ({
  value,
  label: value === 'Other' ? 'Other...' : value,
}));

const NOMINAL_VOLTAGE_U_OPTIONS = [
  { value: '230', label: '230 V' },
  { value: '400', label: '400 V' },
  { value: 'na', label: 'N/A' },
  { value: 'lim', label: 'LIM' },
  { value: 'Other', label: 'Other...' },
];

const NOMINAL_VOLTAGE_UO_OPTIONS = [
  { value: '230', label: '230 V' },
  { value: 'na', label: 'N/A' },
  { value: 'lim', label: 'LIM' },
  { value: 'Other', label: 'Other...' },
];

const SUPPLY_DEVICE_STANDARD_OPTIONS = [
  '88',
  '88-2',
  '88-3',
  '88-5',
  '1361-I',
  '1361-II',
  '60898-B',
  '60898-C',
  '60898-D',
  '61008-B',
  '61008-C',
  '61008-D',
  '61009-B',
  '61009-C',
  '61009-D',
  '60947-2',
  'SEALED',
  'lim',
  'UNKNOWN',
  'na',
  'Other',
].map((value) => ({ value, label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value }));

const SHORT_CIRCUIT_CAPACITY_OPTIONS = ['1', '3', '6', '10', '16', '25', '33', '50', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} kA`,
}));

const SUPPLY_CURRENT_RATING_OPTIONS = ['60', '80', '100', '125', '160', '200', '300', '400', '500', '600', '800', '1000', '1200', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} A`,
}));

const MAIN_SWITCH_STANDARD_OPTIONS = [
  '1362',
  '60947-3',
  '61008 RCD',
  '60947-2 MCCB',
  '3036 (S-E)',
  '1361 type 1',
  '4293 RCD',
  '88 type gG',
  '88 type mG',
  '88 type aM',
  '5419 isolator',
  '1361 type 2',
  '60947-2 ACB',
  '60898 type B',
  '61009 type B',
  '3871 type 2',
  '3871 type 3',
  '3871 type B',
  '3871 type C',
  '60947 type B',
  '60947 type C',
  '60947-2 type D',
  '3871 type 1',
  '3871 type 4',
  '3871 type D',
  'lim',
  'UNKNOWN',
  'na',
  'Other',
].map((value) => ({ value, label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value }));

const POLES_OPTIONS = ['1', '2', '3', '4', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value,
}));

const MAIN_SWITCH_VOLTAGE_OPTIONS = ['230', '240', '400', '415', '440', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} V`,
}));

const MAIN_SWITCH_CURRENT_OPTIONS = ['40', '63', '80', '100', '125', '160', '200', '250', 'lim', 'UNKNOWN', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value === 'UNKNOWN' ? 'UNKNOWN' : `${value} A`,
}));

const CONDUCTOR_MATERIAL_OPTIONS = ['Copper', 'Aluminium', 'Steel', 'na', 'lim', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : value,
}));

const CONDUCTOR_CSA_OPTIONS = ['6', '10', '16', '25', '35', '50', '70', '95', '120', '150', '185', '240', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : `${value} mm²`,
}));

const EARTHING_CSA_OPTIONS = ['6', '10', '16', '25', '35', '50', '70', '95', '120', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : `${value} mm²`,
}));

const BONDING_CSA_OPTIONS = ['2.5', '4', '6', '10', '16', '25', '50', 'na', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'Other' ? 'Other...' : `${value} mm²`,
}));

const RCD_IDN_OPTIONS = ['10', '30', '100', '300', '500', '1000', 'na', 'nv', 'lim', 'Other'].map((value) => ({
  value,
  label: value === 'na' ? 'N/A' : value === 'nv' ? 'N/V' : value === 'lim' ? 'LIM' : value === 'Other' ? 'Other...' : `${value} mA`,
}));

const YES_NO_LIM_NA_OPTIONS = [
  { value: 'yes', label: 'YES' },
  { value: 'no', label: 'NO' },
  { value: 'lim', label: 'LIM' },
  { value: 'na', label: 'N/A' },
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
    <TradecertFormLayout>
      <TradecertPanel title="Client & installation">
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
      </TradecertPanel>

      <TradecertPanel title="Previous inspection">
        <TextField
          label="Date of previous inspection"
          type="date"
          value={inst.previousInspectionDate}
          onChange={(v) => patch({ previousInspectionDate: v })}
        />
        <QuickSetTextField
          label="Previous certificate number"
          value={inst.previousCertNumber}
          onChange={(v) => patch({ previousCertNumber: v })}
        />
        <QuickSetTextField
          label="Estimated age of installation (years)"
          value={inst.estimatedAge}
          onChange={(v) => patch({ estimatedAge: v })}
        />
        <QuickSetTextAreaField
          label="Evidence of additions or alterations"
          value={inst.alterationsEvidence}
          onChange={(v) => patch({ alterationsEvidence: v })}
        />
      </TradecertPanel>

      <TradecertPanel title="Extent & limitations">
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
      </TradecertPanel>

      <TradecertPanel title="Summary & sign-off">
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
        <TextField label="Inspector position" value={inst.inspectedPosition} onChange={(v) => patch({ inspectedPosition: v })} />
        <TextField
          label="Inspected date"
          type="date"
          value={inst.inspectedDate}
          onChange={(v) => patch({ inspectedDate: v })}
        />
        <DeclarationSignatureField
          label="Inspector signature"
          value={inst.inspectedBySignatureDataUrl ?? ''}
          onChange={(inspectedBySignatureDataUrl) => patch({ inspectedBySignatureDataUrl })}
          nameValue={inst.inspectedBy}
          onNameChange={(inspectedBy) => patch({ inspectedBy })}
        />
        <TextField label="Authorised for issue by" value={inst.authorisedBy} onChange={(v) => patch({ authorisedBy: v })} />
        <TextField label="Authorised position" value={inst.authorisedPosition} onChange={(v) => patch({ authorisedPosition: v })} />
        <TextField
          label="Authorised date"
          type="date"
          value={inst.authorisedDate}
          onChange={(v) => patch({ authorisedDate: v })}
        />
        <DeclarationSignatureField
          label="Authoriser signature"
          value={inst.authorisedBySignatureDataUrl ?? ''}
          onChange={(authorisedBySignatureDataUrl) => patch({ authorisedBySignatureDataUrl })}
          nameValue={inst.authorisedBy}
          onNameChange={(authorisedBy) => patch({ authorisedBy })}
        />
        <TextField
          label="Recommended re-inspection"
          value={inst.reinspectionPeriod}
          onChange={(v) => patch({ reinspectionPeriod: v })}
          placeholder="e.g. 5 years"
        />
        <div className="flex flex-wrap gap-2">
          {REINSPECTION_QUICK_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => patch({ reinspectionPeriod: option.value })}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-teal-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      </TradecertPanel>
    </TradecertFormLayout>
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

  const sortItems = () => {
    setDocument((d) => ({
      ...d,
      observations: {
        ...d.observations,
        items: sortObservationsByCodeAndLocation(d.observations.items),
      },
    }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard title="Observations">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={sortItems}
            disabled={obs.items.length < 2}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Sort by code &amp; location
          </button>
        </div>
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
    <TradecertFormLayout>
      <TradecertPanel title="Earthing & supply">
        <TradecertFieldGrid>
          <SelectField label="Earthing arrangement" value={sup.earthing} onChange={(v) => patch({ earthing: v })} options={EARTHING_TYPES} />
          <OutcomeButtons label="Nature of supply" value={sup.acDc} onChange={(v) => patch({ acDc: v })} options={AC_DC_OPTIONS} />
          <QuickSetTextField label="Ze (Ω)" value={sup.ze} onChange={(v) => patch({ ze: v })} />
          <QuickSetTextField label="Ipf (kA)" value={sup.ipf} onChange={(v) => patch({ ipf: v })} />
          <SelectField
            label="Number and type of live conductors"
            value={sup.phases}
            onChange={(v) => patch({ phases: v })}
            options={sup.acDc === 'dc' ? DC_CONDUCTOR_OPTIONS : LIVE_CONDUCTOR_OPTIONS}
          />
          <SelectField label="Number of supplies" value={sup.numSupplies} onChange={(v) => patch({ numSupplies: v })} options={NUMBER_OF_SUPPLIES_OPTIONS} />
          <QuickSetSelectField label="Nominal voltage U" value={sup.nominalU} onChange={(v) => patch({ nominalU: v })} options={NOMINAL_VOLTAGE_U_OPTIONS} />
          <QuickSetSelectField label="Nominal voltage Uo" value={sup.nominalUo} onChange={(v) => patch({ nominalUo: v })} options={NOMINAL_VOLTAGE_UO_OPTIONS} />
          <QuickSetTextField label="Nominal frequency" value={sup.frequency} onChange={(v) => patch({ frequency: v })} />
          <OutcomeButtons
            label="Supply polarity confirmed"
            value={sup.polarityConfirmed}
            onChange={(v) => patch({ polarityConfirmed: v })}
            options={YES_NO_LIM_NA_OPTIONS}
          />
        </TradecertFieldGrid>
      </TradecertPanel>

      <TradecertPanel title="Supply protective device">
        <TradecertFieldGrid>
          <QuickSetSelectField label="BS (EN)" value={sup.supplyDeviceBs} onChange={(v) => patch({ supplyDeviceBs: v })} options={SUPPLY_DEVICE_STANDARD_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetTextField label="Type" value={sup.supplyDeviceType} onChange={(v) => patch({ supplyDeviceType: v })} options={[...TEXT_QUICK_NA_LIM, { value: 'UNKNOWN', label: 'UNKNOWN' }]} />
          <QuickSetSelectField label="Short circuit capacity (kA)" value={sup.supplyDeviceKa} onChange={(v) => patch({ supplyDeviceKa: v })} options={SHORT_CIRCUIT_CAPACITY_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetSelectField label="Rated current (A)" value={sup.supplyDeviceA} onChange={(v) => patch({ supplyDeviceA: v })} options={SUPPLY_CURRENT_RATING_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
        </TradecertFieldGrid>
      </TradecertPanel>

      <TradecertPanel title="Main switch / fuse / circuit breaker / RCD">
        <TradecertFieldGrid>
          <QuickSetSelectField label="BS (EN)" value={sup.mainSwitchBs} onChange={(v) => patch({ mainSwitchBs: v })} options={MAIN_SWITCH_STANDARD_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetSelectField label="Number of poles" value={sup.mainSwitchPoles} onChange={(v) => patch({ mainSwitchPoles: v })} options={POLES_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetSelectField label="Voltage rating" value={sup.mainSwitchV} onChange={(v) => patch({ mainSwitchV: v })} options={MAIN_SWITCH_VOLTAGE_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetSelectField label="Rated current" value={sup.mainSwitchIn} onChange={(v) => patch({ mainSwitchIn: v })} options={MAIN_SWITCH_CURRENT_OPTIONS} quickOptions={SELECT_QUICK_NA_LIM_UNKNOWN} />
          <QuickSetTextField label="Fuse device setting" value={sup.fuseSetting} onChange={(v) => patch({ fuseSetting: v })} />
          <TextField label="Location" value={sup.mainSwitchLocation} onChange={(v) => patch({ mainSwitchLocation: v })} />
          <QuickSetSelectField label="Conductor material" value={sup.conductorMaterial} onChange={(v) => patch({ conductorMaterial: v })} options={CONDUCTOR_MATERIAL_OPTIONS} />
          <QuickSetSelectField label="Conductor CSA" value={sup.conductorCsa} onChange={(v) => patch({ conductorCsa: v })} options={CONDUCTOR_CSA_OPTIONS} quickOptions={[{ value: 'na', label: 'N/A' }]} />
          <QuickSetSelectField label="RCD IΔn" value={sup.rcdIdn} onChange={(v) => patch({ rcdIdn: v })} options={RCD_IDN_OPTIONS} quickOptions={[...SELECT_QUICK_NA_LIM, { value: 'nv', label: 'N/V' }]} />
          <QuickSetTextField label="RCD time delay" value={sup.rcdDelay} onChange={(v) => patch({ rcdDelay: v })} />
          <QuickSetTextField label="RCD operating time" value={sup.rcdTime} onChange={(v) => patch({ rcdTime: v })} />
        </TradecertFieldGrid>
      </TradecertPanel>

      <TradecertPanel title="Earthing & bonding">
        <TradecertFieldGrid>
          <QuickSetSelectField label="Earthing conductor material" value={sup.earthMaterial} onChange={(v) => patch({ earthMaterial: v })} options={CONDUCTOR_MATERIAL_OPTIONS} />
          <QuickSetSelectField label="Earthing conductor CSA" value={sup.earthCsa} onChange={(v) => patch({ earthCsa: v })} options={EARTHING_CSA_OPTIONS} quickOptions={[{ value: 'na', label: 'N/A' }]} />
          <OutcomeButtons label="Earthing continuity" value={sup.earthContinuity} onChange={(v) => patch({ earthContinuity: v })} options={PASS_FAIL_OPTIONS} />
          <QuickSetSelectField label="Bonding material" value={sup.bondMaterial} onChange={(v) => patch({ bondMaterial: v })} options={CONDUCTOR_MATERIAL_OPTIONS} />
          <QuickSetSelectField label="Bonding CSA" value={sup.bondCsa} onChange={(v) => patch({ bondCsa: v })} options={BONDING_CSA_OPTIONS} quickOptions={[{ value: 'na', label: 'N/A' }]} />
          <OutcomeButtons label="Bonding continuity" value={sup.bondContinuity} onChange={(v) => patch({ bondContinuity: v })} options={PASS_FAIL_OPTIONS} />
          <OutcomeButtons label="Water" value={sup.bondWater} onChange={(v) => patch({ bondWater: v })} options={PASS_FAIL_OPTIONS} />
          <OutcomeButtons label="Gas" value={sup.bondGas} onChange={(v) => patch({ bondGas: v })} options={PASS_FAIL_OPTIONS} />
          <OutcomeButtons label="Oil" value={sup.bondOil} onChange={(v) => patch({ bondOil: v })} options={PASS_FAIL_OPTIONS} />
          <OutcomeButtons label="Structural steel" value={sup.bondSteel} onChange={(v) => patch({ bondSteel: v })} options={PASS_FAIL_OPTIONS} />
          <OutcomeButtons label="Lightning" value={sup.bondLightning} onChange={(v) => patch({ bondLightning: v })} options={PASS_FAIL_OPTIONS} />
        </TradecertFieldGrid>
      </TradecertPanel>
    </TradecertFormLayout>
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

  const filledCount = INSPECTION_SCHEDULE_ITEMS.filter((i) => schedule[i.id]).length;
  const totalCount = INSPECTION_SCHEDULE_ITEMS.length;

  return (
    <TradecertFormLayout>
      <TradecertPanel
        title="Inspection schedule"
        toolbar={
          <span className="text-xs font-semibold text-slate-600">
            {filledCount}/{totalCount} completed
          </span>
        }
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3">
          <label className="min-w-[220px] flex-1 text-xs font-bold uppercase tracking-wide text-slate-600">
            Preset
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-normal normal-case"
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
            className="rounded-md bg-[#14B8A6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Apply preset
          </button>
        </div>
        {presetId && (
          <p className="text-xs text-slate-500">
            {INSPECTION_SCHEDULE_PRESETS.find((p) => p.id === presetId)?.description}
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          Click an outcome button to set each item. Use section actions to bulk-fill a group.
        </p>
      </TradecertPanel>

      {sections.map((sec) => {
        const items = INSPECTION_SCHEDULE_ITEMS.filter((i) => i.section === sec);
        const sectionFilled = items.filter((i) => schedule[i.id]).length;
        return (
          <TradecertPanel
            key={sec}
            title={`${sec}. ${INSPECTION_SECTION_LABELS[sec] ?? sec}`}
            toolbar={
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-2 text-[10px] font-semibold text-slate-500">
                  {sectionFilled}/{items.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSectionAll(sec, 'pass')}
                  className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  All ✓
                </button>
                <button
                  type="button"
                  onClick={() => setSectionAll(sec, 'na')}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  All N/A
                </button>
                <button
                  type="button"
                  onClick={() => setSectionAll(sec, 'lim')}
                  className="rounded border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-50"
                >
                  All LIM
                </button>
                <button
                  type="button"
                  onClick={() => setSectionAll(sec, 'nv')}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  All N/V
                </button>
              </div>
            }
          >
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[720px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    <th className="w-14 border-b border-slate-200 px-2 py-1.5">Item</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Description</th>
                    <th className="w-[280px] border-b border-slate-200 px-2 py-1.5">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isHeading = item.id === '5.12' || item.id === '5.17';
                    return (
                      <tr key={item.id} className={`border-b border-slate-100 ${isHeading ? 'bg-slate-50 font-bold' : 'hover:bg-slate-50/80'}`}>
                        <td className="px-2 py-1.5 align-top font-mono text-[11px] font-semibold text-slate-600">
                          {item.id}
                        </td>
                        {isHeading ? (
                          <td colSpan={2} className="px-2 py-1.5 align-top text-[11px] leading-snug text-slate-900 font-bold">
                            {item.label}
                          </td>
                        ) : (
                          <>
                            <td className="px-2 py-1.5 align-top text-[11px] leading-snug text-slate-800">{item.label}</td>
                            <td className="px-2 py-1 align-top">
                              <InspectionOutcomePicker
                                value={schedule[item.id] ?? ''}
                                onChange={(v) => setOutcome(item.id, v as InspectionOutcome)}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TradecertPanel>
        );
      })}
      <p className="text-center text-xs text-slate-400">{certificate.certificate_number}</p>
    </TradecertFormLayout>
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
    <TradecertFormLayout>
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
    </TradecertFormLayout>
  );
}

export function AppendixSection() {
  const { document, setDocument } = useCertificateEditor();
  return (
    <TradecertFormLayout>
      <TradecertPanel title="Appendix notes & photos">
        <TextAreaField
          label="Additional information"
          value={document.appendix.content}
          onChange={(v) =>
            setDocument((d) => ({ ...d, appendix: { ...d.appendix, content: v } }))
          }
          rows={12}
          placeholder="Notes, test instrument details, limitations…"
        />
      </TradecertPanel>
      <TradecertPanel title="Appendix photographs">
        <CertificatePhotoGallery
          photos={document.appendix.photos}
          onChange={(photos) =>
            setDocument((d) => ({ ...d, appendix: { ...d.appendix, photos } }))
          }
        />
      </TradecertPanel>
    </TradecertFormLayout>
  );
}
