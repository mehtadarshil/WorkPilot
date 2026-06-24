import type { ReactNode } from 'react';
import type { ElectricalCertificateDocument } from '../types';
import { PrintCheckmark } from './PrintCheckmark';

function FormField({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="cp-form-field">
      <span className="cp-form-label">{label}</span>
      <span className="cp-form-value">{value}</span>
    </div>
  );
}

function SupplySubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="cp-supply-subsection">
      <h3 className="cp-supply-section-title">{title}</h3>
      <div className="cp-form-grid">{children}</div>
    </div>
  );
}

export function SupplyParticularsGrid({ supply: sup }: { supply: ElectricalCertificateDocument['supply'] }) {
  return (
    <div className="cp-supply-sections">
      <SupplySubsection title="Supply characteristics">
        <FormField label="Earthing arrangement" value={sup.earthing} />
        <FormField label="Number and type of live conductors" value={sup.phases} />
        <FormField label="AC / DC" value={sup.acDc} />
        <FormField label="Nominal voltage U (V)" value={sup.nominalU} />
        <FormField label="Nominal voltage Uo (V)" value={sup.nominalUo} />
        <FormField label="Nominal frequency (Hz)" value={sup.frequency} />
        <FormField label="Prospective fault current (kA)" value={sup.ipf} />
        <FormField label="Earth loop impedance Ze (Ω)" value={sup.ze} />
        <FormField label="Number of supplies" value={sup.numSupplies} />
      </SupplySubsection>

      <SupplySubsection title="Supply protective device">
        <FormField label="BS (EN)" value={sup.supplyDeviceBs} />
        <FormField label="Type" value={sup.supplyDeviceType} />
        <FormField label="Short circuit capacity (kA)" value={sup.supplyDeviceKa} />
        <FormField label="Rated current (A)" value={sup.supplyDeviceA} />
      </SupplySubsection>

      <SupplySubsection title="Main switch / isolator">
        <FormField label="BS (EN)" value={sup.mainSwitchBs} />
        <FormField label="Poles" value={sup.mainSwitchPoles} />
        <FormField label="Voltage (V)" value={sup.mainSwitchV} />
        <FormField label="Rated current (A)" value={sup.mainSwitchIn} />
        <FormField label="Fuse device setting" value={sup.fuseSetting} />
        <FormField label="Location" value={sup.mainSwitchLocation} />
      </SupplySubsection>

      <SupplySubsection title="Earthing conductor">
        <FormField label="Material" value={sup.earthMaterial} />
        <FormField label="CSA (mm²)" value={sup.earthCsa} />
        <FormField label="Continuity" value={sup.earthContinuity} />
      </SupplySubsection>

      <SupplySubsection title="Main protective bonding conductor">
        <FormField label="Material" value={sup.bondMaterial} />
        <FormField label="CSA (mm²)" value={sup.bondCsa} />
        <FormField label="Continuity" value={sup.bondContinuity} />
      </SupplySubsection>

      <SupplySubsection title="RCD">
        <FormField label="Operating current (mA)" value={sup.rcdIdn} />
        <FormField label="Time delay (ms)" value={sup.rcdDelay} />
        <FormField label="Operating time (ms)" value={sup.rcdTime} />
      </SupplySubsection>

      <SupplySubsection title="Bonding of extraneous conductive parts">
        <FormField label="Water" value={sup.bondWater} />
        <FormField label="Gas" value={sup.bondGas} />
        <FormField label="Oil" value={sup.bondOil} />
        <FormField label="Structural steel" value={sup.bondSteel} />
        <FormField label="Lightning protection" value={sup.bondLightning} />
      </SupplySubsection>

      {sup.polarityConfirmed.trim() && (
        <SupplySubsection title="Confirmation">
          <div className="cp-form-field">
            <span className="cp-form-label">Supply polarity confirmed</span>
            <span className="cp-form-value">
              <PrintCheckmark value={sup.polarityConfirmed} />
            </span>
          </div>
        </SupplySubsection>
      )}
    </div>
  );
}
