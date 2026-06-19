import type { ObservationItem, ValidationIssue } from './types';

export const REINSPECTION_QUICK_OPTIONS = [
  { label: '28 days', value: '28 days' },
  { label: '6 months', value: '6 months' },
  { label: '1 year', value: '1 year' },
  { label: '3 years', value: '3 years' },
  { label: '5 years', value: '5 years' },
  { label: '10 years', value: '10 years' },
] as const;

const OBSERVATION_CODE_ORDER: Record<ObservationItem['code'], number> = {
  c1: 0,
  c2: 1,
  c3: 2,
  fi: 3,
};

export function sortObservationsByCodeAndLocation(items: ObservationItem[]) {
  return [...items].sort((a, b) => {
    const codeDiff = OBSERVATION_CODE_ORDER[a.code] - OBSERVATION_CODE_ORDER[b.code];
    if (codeDiff !== 0) return codeDiff;
    return a.location.localeCompare(b.location, undefined, { sensitivity: 'base' });
  });
}

export function countIssuesBySection(issues: ValidationIssue[]) {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    counts[issue.section] = (counts[issue.section] ?? 0) + 1;
  }
  return counts;
}

export function certificateListSummary(document: Record<string, unknown>) {
  const boards = Array.isArray(document.boards) ? document.boards : [];
  const observations = document.observations as { items?: unknown[] } | undefined;
  const installation = document.installation as { overallAssessment?: string } | undefined;
  const obsCount = Array.isArray(observations?.items) ? observations!.items!.length : 0;
  const boardCount = boards.length;
  const circuitCount = boards.reduce((sum, board) => {
    const circuits = (board as { circuits?: unknown[] }).circuits;
    return sum + (Array.isArray(circuits) ? circuits.length : 0);
  }, 0);
  const overall = installation?.overallAssessment?.trim() || '';
  return { boardCount, circuitCount, observationCount: obsCount, overallAssessment: overall };
}
