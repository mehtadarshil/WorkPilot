/** BS 5839-1 fire alarm inspection schedule (FI-INSP 2025). */

import type { FireAlarmInspectionOutcome } from './types';

export type { FireAlarmInspectionOutcome };

export interface FireAlarmScheduleItem {
  id: string;
  section: string;
  label: string;
  group?: string;
}

export const FIRE_ALARM_OUTCOME_LABELS: Record<FireAlarmInspectionOutcome, string> = {
  '': '—',
  pass: '✓',
  fail: '✗',
  na: 'N/A',
  lim: 'LIM',
};

export const FIRE_ALARM_SECTION_LABELS: Record<string, string> = {
  '1': 'Quarterly inspection of vented batteries',
  '2': 'Schedule of items inspected',
  '3': 'Schedule of items tested',
  '4': 'Arrangements in place for repair of faults or damage',
  '5': 'Over a 12 month period — schedule of items inspected',
  '6': 'Over a 12 month period — schedule of items tested',
  '7': 'Additional checks upon change of servicing organisation',
};

export const FIRE_ALARM_INSPECTION_SCHEDULE_ITEMS: FireAlarmScheduleItem[] = [
  { id: '1.1', section: '1', label: 'Batteries checked' },
  { id: '1.2', section: '1', label: 'Battery connections checked' },
  { id: '1.3', section: '1', label: 'Electrolyte levels checked and topped up as necessary' },
  { id: '2.1.1', section: '2', group: 'Premises', label: 'Manual call points suitably sited' },
  { id: '2.1.2', section: '2', group: 'Premises', label: 'Manual call points are unobstructed' },
  { id: '2.1.3', section: '2', group: 'Premises', label: 'Manual call points are conspicuous' },
  { id: '2.1.4', section: '2', group: 'Premises', label: 'All exits, including any new exits, have manual call points' },
  { id: '2.1.5', section: '2', group: 'Premises', label: 'Automatic fire detectors suitable for building use or occupancy' },
  { id: '2.1.6', section: '2', group: 'Premises', label: 'Automatic fire detectors suitably sited' },
  { id: '2.1.7', section: '2', group: 'Premises', label: 'Fire alarm devices suitably sited' },
  { id: '2.1.8', section: '2', group: 'Premises', label: 'No partitions within 500mm horizontally of any automatic fire detector (Clause 21.2)' },
  { id: '2.1.9', section: '2', group: 'Premises', label: 'No storage within 300mm of ceilings (Clause 21.2)' },
  { id: '2.1.10', section: '2', group: 'Premises', label: 'Clear space of 500mm exists below each automatic fire detector (Clause 21.2)' },
  {
    id: '2.1.11',
    section: '2',
    group: 'Premises',
    label: "Each automatic fire detector's ability to receive the stimulus it is designed to detect has not been impeded by any other means",
  },
  {
    id: '2.1.12',
    section: '2',
    group: 'Premises',
    label: 'Building use or occupancy does not make existing types of automatic fire detector unsuitable for detection of fire prone to unwanted alarms',
  },
  {
    id: '2.1.13',
    section: '2',
    group: 'Premises',
    label: 'Additional fire detection and alarm equipment provided in any extensions or alterations to the building',
  },
  { id: '2.2.1', section: '2', group: 'Documentation', label: 'System log book examined' },
  { id: '2.2.2', section: '2', group: 'Documentation', label: 'Any faults recorded have been attended to' },
  { id: '2.3.1', section: '2', group: 'False alarms', label: 'Record of false alarms checked in accordance with (Clause 30)' },
  { id: '2.3.2', section: '2', group: 'False alarms', label: 'Rate of false alarms during the previous 12 months recorded (Clause 30)' },
  { id: '2.3.3', section: '2', group: 'False alarms', label: 'Action taken in respect of false alarms complies with the recommendations of (Clause 30)' },
  {
    id: '3.1',
    section: '3',
    label: 'Fire alarm functions of CIE checked by operation of at least one detector or manual call point in each circuit and entry made in log book indicating which indicating device used for these tests',
  },
  { id: '3.2', section: '3', label: 'Operation of fire alarm devices' },
  { id: '3.3', section: '3', label: 'Controls and visual indicators at CIE checked for correct operation' },
  { id: '3.4', section: '3', label: 'Ancillary functions of CIE tested' },
  { id: '3.5', section: '3', label: "For CIE, manufacturer's checks and tests performed" },
  { id: '3.6', section: '3', label: 'Fault indicators and their circuits checked by simulation of fault conditions' },
  { id: '3.7', section: '3', label: 'Automatic transmission of fire alarm signal to receiving centre' },
  { id: '3.8', section: '3', label: 'Automatic transmission of other signals, such as fault signals to receiving centre' },
  { id: '3.9', section: '3', label: "Radio systems serviced in accordance with manufacturer's recommendations" },
  { id: '3.10', section: '3', label: "For other equipment, manufacturer's checks and tests performed" },
  { id: '3.11', section: '3', label: 'Printers checked for correct operation' },
  { id: '3.12', section: '3', label: 'Printers checked that characters are legible' },
  { id: '3.13', section: '3', label: 'Printer consumables available in sufficient quantity to ensure operation until next visit' },
  { id: '3.14', section: '3', label: 'Standby battery disconnected and full load alarm simulated' },
  { id: '3.15', section: '3', label: 'Specific gravity of each cell of vented batteries checked' },
  {
    id: '3.16',
    section: '3',
    label: 'Mains disconnected and batteries momentarily load tested (other than those within devices such as manual call points, detectors and fire alarm sounders of a radio linked system)',
  },
  { id: '4.1', section: '4', label: 'Emergency call out arrangement in place where maintenance carried out by a third party' },
  { id: '4.2', section: '4', label: 'Name and telephone number of any third party responsible for maintenance prominently displayed at main CIE' },
  { id: '4.3', section: '4', label: 'Records and documentation give information on maintenance arrangements (Clause 40)' },
  { id: '4.4', section: '4', label: 'User records faults or damage in log book' },
  { id: '4.5', section: '4', label: 'User arranges for repairs to be carried out as soon as possible' },
  { id: '5.1.1', section: '5', group: 'Premises', label: 'Automatic fire detectors unpainted' },
  { id: '5.1.2', section: '5', group: 'Premises', label: 'Automatic fire detectors undamaged' },
  { id: '5.1.3', section: '5', group: 'Premises', label: 'Visual fire alarm devices not obstructed' },
  { id: '5.1.4', section: '5', group: 'Premises', label: 'Lenses of visual fire alarm devices are clean' },
  { id: '5.1.5', section: '5', group: 'Premises', label: 'Readily accessible cable fixings secure' },
  { id: '5.1.6', section: '5', group: 'Premises', label: 'Readily accessible cable fixings undamaged' },
  { id: '5.2.1', section: '5', group: 'Documentation', label: 'Cause and effect programme confirmed as being correct' },
  { id: '6.1', section: '6', label: 'Switch mechanism of every call point' },
  { id: '6.2', section: '6', label: 'Fire alarm devices checked for correct operation' },
  {
    id: '6.3',
    section: '6',
    label: 'Automatic fire detectors functionally tested, including heat detectors, point smoke detectors, optical beam smoke detectors, aspirating fire detection systems, carbon monoxide fire detectors, flame detectors and multi-sensor detectors',
  },
  { id: '6.4', section: '6', label: 'All unmonitored, permanently illuminated filament lamp indicators at CIE replaced' },
  { id: '6.5', section: '6', label: 'CIE manufacturers annual checks and tests carried out' },
  { id: '6.6', section: '6', label: 'Radio signal strengths checked for adequacy' },
  {
    id: '6.7',
    section: '6',
    label: 'For fire detection systems that enable analogue values to be determined, it should be confirmed that each analogue value is within the range specified by the manufacturer',
  },
  { id: '6.8', section: '6', label: 'Standby power supply capacity checked' },
  { id: '6.9', section: '6', label: 'Checks recommended by manufacturers of other components of system carried out' },
  { id: '7.1', section: '7', label: 'Adequate number of call points (Clause 19)' },
  { id: '7.2', section: '7', label: 'Adequate provision of fire detection for the category of the system' },
  { id: '7.3', section: '7', label: 'Sound pressure levels comply with Clause 15' },
  { id: '7.4', section: '7', label: 'Change in use, layout or construction of the premises have not reduced system effectiveness' },
  { id: '7.5', section: '7', label: 'Cabling has fire resistance complying with Clause 25' },
  { id: '7.6', section: '7', label: 'Circuits monitored in compliance with Clause 11' },
  { id: '7.7', section: '7', label: 'Requirements of BS 7671 are met' },
  { id: '7.8', section: '7', label: 'Standby power supplies provided' },
  { id: '7.9', section: '7', label: 'Standby power supplies comply with Clause 24.3' },
  { id: '7.10', section: '7', label: 'Exposure of false alarms is not excessive (Section 3)' },
  { id: '7.11', section: '7', label: 'Experience of false alarms is not excessive (Section 3)' },
  { id: '7.12', section: '7', label: 'Existing records checked' },
  {
    id: '7.13',
    section: '7',
    label: 'Log book available (if not available, a suitable log book should be provided by the servicing organisation) (Clause 48)',
  },
];
