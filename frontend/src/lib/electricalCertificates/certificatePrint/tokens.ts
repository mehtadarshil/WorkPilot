/** Print/PDF colour tokens — match editor outcome buttons in FormFields.tsx */
export const PRINT_OUTCOME_STYLES = {
  pass: { bg: '#059669', fg: '#fff', label: '✓', title: 'Acceptable condition' },
  c1: { bg: '#dc2626', fg: '#fff', label: 'C1', title: 'Unacceptable condition' },
  c2: { bg: '#ea580c', fg: '#fff', label: 'C2', title: 'Unacceptable condition' },
  c3: { bg: '#2563eb', fg: '#fff', label: 'C3', title: 'Improvement recommended' },
  fi: { bg: '#ca8a04', fg: '#fff', label: 'FI', title: 'Further investigation' },
  lim: { bg: '#374151', fg: '#fff', label: 'LIM', title: 'Limitation' },
  nv: { bg: '#9ca3af', fg: '#fff', label: 'NV', title: 'Not verified' },
  na: { bg: '#6b7280', fg: '#fff', label: 'NA', title: 'Not applicable' },
  x: { bg: '#111827', fg: '#fff', label: 'X', title: 'Not applicable' },
} as const;

export const PRINT_ASSESSMENT_STYLES = {
  satisfactory: { bg: '#059669', fg: '#fff', label: 'SATISFACTORY' },
  unsatisfactory: { bg: '#dc2626', fg: '#fff', label: 'UNSATISFACTORY' },
} as const;

export const PRINT_CHECK_PASS = { bg: '#059669', fg: '#fff' };
export const PRINT_CHECK_FAIL = { bg: '#dc2626', fg: '#fff' };
