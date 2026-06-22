import type { CircuitRow } from './types';

export type CircuitQuickAddTab = 'domestic' | 'commercial' | 'ultimate_london';

export type CircuitQuickAddCategory =
  | 'distribution'
  | 'submains'
  | 'lights'
  | 'sockets'
  | 'kitchen'
  | 'bathroom'
  | 'ac_heating'
  | 'misc';

export const CIRCUIT_QUICK_ADD_CATEGORY_LABELS: Record<CircuitQuickAddCategory, string> = {
  distribution: 'Distribution',
  submains: 'Submains',
  lights: 'Lights',
  sockets: 'Sockets',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  ac_heating: 'AC & Heating',
  misc: 'Misc',
};

export const CIRCUIT_QUICK_ADD_CATEGORY_COLORS: Record<CircuitQuickAddCategory, string> = {
  distribution: 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200',
  submains: 'border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200',
  lights: 'border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200',
  sockets: 'border-rose-300 bg-rose-100 text-rose-950 hover:bg-rose-200',
  kitchen: 'border-sky-300 bg-sky-100 text-sky-950 hover:bg-sky-200',
  bathroom: 'border-cyan-300 bg-cyan-100 text-cyan-950 hover:bg-cyan-200',
  ac_heating: 'border-orange-300 bg-orange-100 text-orange-950 hover:bg-orange-200',
  misc: 'border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200',
};

export type CircuitQuickAddTemplate = {
  id: string;
  tab: CircuitQuickAddTab;
  category: CircuitQuickAddCategory;
  label: string;
  subtitle?: string;
  spareOrUnknown?: boolean;
  patch: Partial<CircuitRow>;
};

type DeviceStd = string;

function parseDevice(std: DeviceStd): { ocpdBs: string; ocpdType: string; isRcbo: boolean } {
  const rcbo = std.startsWith('61009');
  const m = std.match(/^(\d+(?:-\d+)?(?:-\w+)?)-?([BCD])?$/i);
  return {
    ocpdBs: m?.[1] ?? std,
    ocpdType: m?.[2]?.toUpperCase() ?? 'B',
    isRcbo: rcbo,
  };
}

function mcbCircuit(
  description: string,
  ratingA: number,
  std: DeviceStd,
  liveMm2: string,
  extra: Partial<CircuitRow> = {},
): Partial<CircuitRow> {
  const device = parseDevice(std);
  return {
    description,
    wiringType: 'A',
    refMethod: 'C',
    liveMm2,
    ocpdBs: device.ocpdBs,
    ocpdType: device.ocpdType,
    ocpdRatingA: String(ratingA),
    ...(device.isRcbo
      ? {
          rcdBs: '61009',
          rcdType: device.ocpdType,
          rcdRatingMa: '30',
          rcdRatingA: String(ratingA),
        }
      : {}),
    ...extra,
  };
}

function submain(liveMm2: string, ratingA: number, std: DeviceStd): Partial<CircuitRow> {
  return mcbCircuit('Submain', ratingA, std, liveMm2, { refMethod: 'B2' });
}

function distributionRcd(ratingA: number): Partial<CircuitRow> {
  return {
    description: `RCD ${ratingA}A`,
    wiringType: 'N/A',
    refMethod: 'N/A',
    liveMm2: 'N/A',
    ocpdBs: '61008',
    ocpdType: 'N/A',
    ocpdRatingA: String(ratingA),
    rcdBs: '61008',
    rcdType: 'AC',
    rcdRatingMa: '30',
    rcdRatingA: String(ratingA),
  };
}

function template(
  id: string,
  tab: CircuitQuickAddTab,
  category: CircuitQuickAddCategory,
  label: string,
  patch: Partial<CircuitRow>,
  subtitle?: string,
  spareOrUnknown?: boolean,
): CircuitQuickAddTemplate {
  return { id, tab, category, label, subtitle, spareOrUnknown, patch };
}

const DOMESTIC_DISTRIBUTION: CircuitQuickAddTemplate[] = [
  template('dom-spare', 'domestic', 'distribution', 'Spare', { description: 'Spare' }, undefined, true),
  template('dom-unknown', 'domestic', 'distribution', 'Unknown', { description: 'Unknown' }, undefined, true),
  template('dom-spd', 'domestic', 'distribution', 'SPD', {
    description: 'SPD',
    ocpdBs: '61643-11',
    wiringType: 'N/A',
    refMethod: 'N/A',
    liveMm2: 'N/A',
    ocpdType: 'N/A',
    ocpdRatingA: 'N/A',
  }, '61643-11'),
  template('dom-afdd', 'domestic', 'distribution', 'AFDD', {
    description: 'AFDD',
    ocpdBs: '62606',
    afdd: 'N/A',
    wiringType: 'N/A',
    refMethod: 'N/A',
    liveMm2: 'N/A',
    ocpdType: 'N/A',
    ocpdRatingA: 'N/A',
  }, '62606-AFDD'),
  template('dom-rcd-63', 'domestic', 'distribution', 'RCD 63A', distributionRcd(63)),
  template('dom-rcd-80', 'domestic', 'distribution', 'RCD 80A', distributionRcd(80)),
  template('dom-rcd-100', 'domestic', 'distribution', 'RCD 100A', distributionRcd(100)),
];

const DOMESTIC_SUBMAINS: CircuitQuickAddTemplate[] = (
  [
    ['6', 32, '60898-B'],
    ['10', 40, '60898-B'],
    ['16', 63, '60898-B'],
    ['25', 80, '60898-B'],
    ['35', 100, '60898-B'],
    ['50', 100, '60898-B'],
    ['70', 125, '60898-B'],
  ] as const
).map(([live, rating, std]) =>
  template(
    `dom-sub-${live}-${rating}`,
    'domestic',
    'submains',
    `Submain ${live}mm²`,
    submain(live, rating, std),
    `${rating}A ${std}`,
  ),
);

function lightingTemplates(
  tab: 'domestic' | 'commercial',
  std: '60898-B' | '60898-C' | '61009-B' | '61009-C',
): CircuitQuickAddTemplate[] {
  const prefix = tab === 'commercial' ? 'com' : 'dom';
  const labels =
    tab === 'domestic'
      ? ['Lighting', 'Upstairs Lighting', 'Downstairs Lighting']
      : ['Lighting', 'Lighting'];
  const ratings = tab === 'domestic' ? [6, 6, 6] : [6, 10];
  return labels.map((label, i) =>
    template(
      `${prefix}-light-${label.replace(/\s+/g, '-').toLowerCase()}-${std}-${i}`,
      tab,
      'lights',
      label,
      mcbCircuit(label, ratings[i], std, '1.5'),
      `${ratings[i]}A ${std}`,
    ),
  );
}

function socketTemplates(
  tab: 'domestic' | 'commercial',
  std: '60898-B' | '60898-C' | '61009-B' | '61009-C',
): CircuitQuickAddTemplate[] {
  const prefix = tab === 'commercial' ? 'com' : 'dom';
  const rows: [string, number, string][] =
    tab === 'domestic'
      ? [
          ['Ring final', 32, '2.5'],
          ['Upstairs sockets', 32, '2.5'],
          ['Downstairs sockets', 32, '2.5'],
          ['Radial', 20, '2.5'],
        ]
      : [
          ['Ring final', 32, '2.5'],
          ['Radial', 20, '2.5'],
        ];
  return rows.map(([label, rating, live], i) =>
    template(
      `${prefix}-sock-${label.replace(/\s+/g, '-').toLowerCase()}-${std}-${i}`,
      tab,
      'sockets',
      label,
      mcbCircuit(label, rating, std, live),
      `${rating}A ${std}`,
    ),
  );
}

function dualStdKitchen(
  tab: 'domestic',
  items: readonly (readonly [string, number, string])[],
): CircuitQuickAddTemplate[] {
  return ['60898-B', '61009-B'].flatMap((std) =>
    items.map(([label, rating, live], i) =>
      template(
        `dom-kit-${label.replace(/\s+/g, '-').toLowerCase()}-${rating}-${std}-${i}`,
        tab,
        'kitchen',
        label,
        mcbCircuit(label, rating, std, live),
        `${rating}A ${std}`,
      ),
    ),
  );
}

const DOMESTIC_KITCHEN = dualStdKitchen('domestic', [
  ['Hob', 20, '2.5'],
  ['Oven', 32, '6'],
  ['Cooker', 40, '10'],
]);

const DOMESTIC_BATHROOM: CircuitQuickAddTemplate[] = ['60898-B', '61009-B'].flatMap((std) =>
  ([
    ['Shower 32A', 32, '6'],
    ['Shower 40A', 40, '10'],
    ['Shower 50A', 50, '16'],
  ] as const).map(([label, rating, live], i) =>
    template(
      `dom-bath-${rating}-${std}-${i}`,
      'domestic',
      'bathroom',
      label,
      mcbCircuit(label, rating, std, live),
      std,
    ),
  ),
);

function dualStdHeating(items: readonly (readonly [string, number, string])[]): CircuitQuickAddTemplate[] {
  return ['60898-B', '61009-B'].flatMap((std) =>
    items.map(([label, rating, live], i) =>
      template(
        `dom-heat-${label.replace(/\s+/g, '-').toLowerCase()}-${rating}-${std}-${i}`,
        'domestic',
        'ac_heating',
        label,
        mcbCircuit(label, rating, std, live),
        `${rating}A ${std}`,
      ),
    ),
  );
}

const DOMESTIC_AC_HEATING = dualStdHeating([
  ['Storage heater', 20, '2.5'],
  ['Immersion heater', 16, '2.5'],
  ['Boiler', 6, '1.5'],
  ['Heat pump', 32, '6'],
  ['Air conditioner', 32, '6'],
]);

const DOMESTIC_MISC: CircuitQuickAddTemplate[] = [
  template('dom-smoke', 'domestic', 'misc', 'Smoke alarm', mcbCircuit('Smoke alarm', 6, '60898-B', '1.5'), '6A 60898-B'),
  template('dom-garage', 'domestic', 'misc', 'Garage', mcbCircuit('Garage', 6, '60898-B', '1.5'), '6A 60898-B'),
  template('dom-ev', 'domestic', 'misc', 'EV Charger', mcbCircuit('EV Charger', 32, '61009-B', '6'), '32A 61009-B'),
  template('dom-garden', 'domestic', 'misc', 'Garden sockets', mcbCircuit('Garden sockets', 16, '60898-B', '2.5'), '16A 60898-B'),
  template('dom-shed', 'domestic', 'misc', 'Shed', mcbCircuit('Shed', 16, '60898-B', '2.5'), '16A 60898-B'),
];

const COMMERCIAL_DISTRIBUTION = DOMESTIC_DISTRIBUTION.map((t) => ({
  ...t,
  id: t.id.replace('dom-', 'com-'),
  tab: 'commercial' as const,
}));

const COMMERCIAL_SUBMAINS: CircuitQuickAddTemplate[] = (
  [
    ['10', 40, '60898-C'],
    ['16', 63, '60898-C'],
    ['25', 100, '60898-C'],
    ['35', 125, '60898-C'],
    ['50', 160, '60947-2'],
  ] as const
).map(([live, rating, std]) =>
  template(
    `com-sub-${live}-${rating}`,
    'commercial',
    'submains',
    `Submain ${live}mm²`,
    submain(live, rating, std),
    `${rating}A ${std}`,
  ),
);

const COMMERCIAL_KITCHEN: CircuitQuickAddTemplate[] = (
  [
    ['Oven', 32, '6', '60898-C'],
    ['Hob', 32, '6', '60898-C'],
    ['Hot Plate', 20, '2.5', '60898-C'],
    ['Dishwasher', 20, '2.5', '60898-C'],
    ['Chiller', 20, '2.5', '60898-C'],
    ['Fridge', 16, '2.5', '60898-C'],
    ['Hand Dryer', 20, '2.5', '61009-C'],
  ] as const
).map(([label, rating, live, std], i) =>
  template(`com-kit-${i}`, 'commercial', 'kitchen', label, mcbCircuit(label, rating, std, live), `${rating}A ${std}`),
);

const COMMERCIAL_MISC: CircuitQuickAddTemplate[] = (
  [
    ['Fire Alarm', 6, '1.5', '60898-C'],
    ['Burglar Alarm', 6, '1.5', '60898-C'],
    ['Disabled Alarm', 6, '1.5', '60898-C'],
    ['Forklift', 32, '6', '61009-C'],
    ['Machine', 32, '6', '60898-C'],
    ['Motor', 20, '2.5', '60898-C'],
    ['EV Charger', 32, '6', '61009-C'],
  ] as const
).map(([label, rating, live, std], i) =>
  template(`com-misc-${i}`, 'commercial', 'misc', label, mcbCircuit(label, rating, std, live), `${rating}A ${std}`),
);

export const CIRCUIT_QUICK_ADD_TEMPLATES: CircuitQuickAddTemplate[] = [
  ...DOMESTIC_DISTRIBUTION,
  ...DOMESTIC_SUBMAINS,
  ...lightingTemplates('domestic', '60898-B'),
  ...lightingTemplates('domestic', '61009-B'),
  ...socketTemplates('domestic', '60898-B'),
  ...socketTemplates('domestic', '61009-B'),
  ...DOMESTIC_KITCHEN,
  ...DOMESTIC_BATHROOM,
  ...DOMESTIC_AC_HEATING,
  ...DOMESTIC_MISC,
  ...COMMERCIAL_DISTRIBUTION,
  ...COMMERCIAL_SUBMAINS,
  ...lightingTemplates('commercial', '60898-C'),
  ...socketTemplates('commercial', '60898-C'),
  ...socketTemplates('commercial', '61009-C'),
  ...COMMERCIAL_KITCHEN,
  ...COMMERCIAL_MISC,
];

export const CIRCUIT_QUICK_ADD_TABS: { id: CircuitQuickAddTab; label: string }[] = [
  { id: 'domestic', label: 'Domestic' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'ultimate_london', label: 'Ultimate London' },
];

export function getQuickAddTemplatesForTab(tab: CircuitQuickAddTab): CircuitQuickAddTemplate[] {
  if (tab === 'ultimate_london') return [];
  return CIRCUIT_QUICK_ADD_TEMPLATES.filter((t) => t.tab === tab);
}

export function getQuickAddCategoriesForTab(tab: CircuitQuickAddTab): CircuitQuickAddCategory[] {
  return [...new Set(getQuickAddTemplatesForTab(tab).map((t) => t.category))];
}
