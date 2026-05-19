/** BS 7671 EICR inspection schedule items (standard schedule). */

export interface InspectionScheduleItem {
  id: string;
  section: string;
  label: string;
}

export const INSPECTION_SCHEDULE_ITEMS: InspectionScheduleItem[] = [
  { id: '1.1', section: '1', label: 'External condition of intake equipment' },
  { id: '1.2', section: '1', label: 'Persons employed by the Distribution Network Operator' },
  { id: '1.3', section: '1', label: 'Condition of service cable' },
  { id: '1.4', section: '1', label: 'Condition of metering equipment' },
  { id: '2.1', section: '2', label: 'Adequate arrangements for other sources (microgenerators)' },
  { id: '3.1', section: '3', label: "Presence of earthing arrangement (TN-S, TN-C-S, TN-C, TT, IT)" },
  { id: '3.2', section: '3', label: 'Earthing conductor material and connections' },
  { id: '3.3', section: '3', label: 'Main protective bonding conductor(s)' },
  { id: '3.4', section: '3', label: 'Water bonding' },
  { id: '3.5', section: '3', label: 'Gas bonding' },
  { id: '3.6', section: '3', label: 'Oil bonding' },
  { id: '3.7', section: '3', label: 'Structural steel bonding' },
  { id: '3.8', section: '3', label: 'Lightning protection bonding' },
  { id: '4.1', section: '4', label: 'Adequacy of working space/accessibility' },
  { id: '4.2', section: '4', label: 'Security of fixing' },
  { id: '4.3', section: '4', label: 'Condition of enclosure(s)' },
  { id: '4.4', section: '4', label: 'Fire barriers, seals, thermal protection' },
  { id: '4.5', section: '4', label: 'Labelling' },
  { id: '5.1', section: '5', label: 'Identification of circuits' },
  { id: '5.2', section: '5', label: 'Cables correctly supported' },
  { id: '5.3', section: '5', label: 'Condition of insulation' },
  { id: '5.4', section: '5', label: 'Non-sheathed cables protected' },
  { id: '5.5', section: '5', label: 'Adequacy of connections' },
  { id: '6.1', section: '6', label: 'Additional protection by RCD' },
  { id: '6.2', section: '6', label: 'Zones and IP ratings' },
  { id: '6.3', section: '6', label: 'Supplementary bonding' },
  { id: '7.1', section: '7', label: 'Special locations compliance' },
];

export const INSPECTION_SECTION_LABELS: Record<string, string> = {
  '1': 'External condition of intake equipment',
  '2': 'Other sources (microgenerators)',
  '3': 'Earthing / bonding arrangements',
  '4': 'Consumer unit(s) / distribution board(s)',
  '5': 'Final circuits',
  '6': 'Bath / shower locations',
  '7': 'Other Part 7 special installations',
};
