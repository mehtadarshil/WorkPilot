import type { ObservationItem } from '../types';

export type ObservationCodeCounts = Record<'c1' | 'c2' | 'c3' | 'fi', number>;

export const OBSERVATION_CODE_SUMMARY = [
  {
    code: 'c1' as const,
    title: 'C1',
    subtitle: 'Danger present. Risk of injury. Immediate remedial action required',
    bg: '#dc2626',
    fg: '#fff',
  },
  {
    code: 'c2' as const,
    title: 'C2',
    subtitle: 'Potentially dangerous — urgent remedial action required',
    bg: '#ea580c',
    fg: '#fff',
  },
  {
    code: 'c3' as const,
    title: 'C3',
    subtitle: 'Improvement recommended',
    bg: '#2563eb',
    fg: '#fff',
  },
  {
    code: 'fi' as const,
    title: 'FI',
    subtitle: 'Further investigation required without delay',
    bg: '#ca8a04',
    fg: '#fff',
  },
];

export function countObservationCodes(items: ObservationItem[]): ObservationCodeCounts {
  return {
    c1: items.filter((i) => i.code === 'c1').length,
    c2: items.filter((i) => i.code === 'c2').length,
    c3: items.filter((i) => i.code === 'c3').length,
    fi: items.filter((i) => i.code === 'fi').length,
  };
}
