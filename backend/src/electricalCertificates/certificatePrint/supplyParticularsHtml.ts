import type { ElectricalCertificateDocument } from '../types';
import { printCheckmarkHtml } from './outcomes';

function field(label: string, value: string, esc: (s: string) => string): string {
  if (!value.trim()) return '';
  return `<div class="cp-form-field"><span class="cp-form-label">${esc(label)}</span><span class="cp-form-value">${esc(value)}</span></div>`;
}

function sectionTitle(title: string, esc: (s: string) => string): string {
  return `<h3 class="cp-supply-section-title">${esc(title)}</h3>`;
}

export function supplyParticularsHtml(
  sup: ElectricalCertificateDocument['supply'],
  esc: (s: string) => string,
): string {
  const polarity = sup.polarityConfirmed.trim()
    ? `<div class="cp-form-field"><span class="cp-form-label">Supply polarity confirmed</span><span class="cp-form-value">${printCheckmarkHtml(sup.polarityConfirmed, esc)}</span></div>`
    : '';

  const blocks = [
    sectionTitle('Supply characteristics', esc),
    field('Earthing arrangement', sup.earthing, esc),
    field('Number and type of live conductors', sup.phases, esc),
    field('AC / DC', sup.acDc, esc),
    field('Nominal voltage U (V)', sup.nominalU, esc),
    field('Nominal voltage Uo (V)', sup.nominalUo, esc),
    field('Nominal frequency (Hz)', sup.frequency, esc),
    field('Prospective fault current (kA)', sup.ipf, esc),
    field('Earth loop impedance Ze (Ω)', sup.ze, esc),
    field('Number of supplies', sup.numSupplies, esc),
    sectionTitle('Supply protective device', esc),
    field('BS (EN)', sup.supplyDeviceBs, esc),
    field('Type', sup.supplyDeviceType, esc),
    field('Short circuit capacity (kA)', sup.supplyDeviceKa, esc),
    field('Rated current (A)', sup.supplyDeviceA, esc),
    sectionTitle('Main switch / isolator', esc),
    field('BS (EN)', sup.mainSwitchBs, esc),
    field('Poles', sup.mainSwitchPoles, esc),
    field('Voltage (V)', sup.mainSwitchV, esc),
    field('Rated current (A)', sup.mainSwitchIn, esc),
    field('Fuse device setting', sup.fuseSetting, esc),
    field('Location', sup.mainSwitchLocation, esc),
    sectionTitle('Earthing conductor', esc),
    field('Material', sup.earthMaterial, esc),
    field('CSA (mm²)', sup.earthCsa, esc),
    field('Continuity', sup.earthContinuity, esc),
    sectionTitle('Main protective bonding conductor', esc),
    field('Material', sup.bondMaterial, esc),
    field('CSA (mm²)', sup.bondCsa, esc),
    field('Continuity', sup.bondContinuity, esc),
    sectionTitle('RCD', esc),
    field('Operating current (mA)', sup.rcdIdn, esc),
    field('Time delay (ms)', sup.rcdDelay, esc),
    field('Operating time (ms)', sup.rcdTime, esc),
    sectionTitle('Bonding of extraneous conductive parts', esc),
    field('Water', sup.bondWater, esc),
    field('Gas', sup.bondGas, esc),
    field('Oil', sup.bondOil, esc),
    field('Structural steel', sup.bondSteel, esc),
    field('Lightning protection', sup.bondLightning, esc),
    polarity ? sectionTitle('Confirmation', esc) : '',
    polarity,
  ].filter(Boolean);

  return `<div class="cp-form-grid">${blocks.join('')}</div>`;
}
