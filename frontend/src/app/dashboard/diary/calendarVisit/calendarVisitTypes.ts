export type CalendarVisit = {
  id: number;
  jobId: number | null;
  isGeneral?: boolean;
  startTime: string;
  durationMinutes: number;
  title: string;
  customerName: string;
  address?: string | null;
  addressLine1?: string | null;
  worksCategory?: string | null;
  jobState?: string | null;
  eventStatus?: string | null;
  jobNumber?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  officerNames?: string | null;
};

export type HoverAnchor = { x: number; y: number };
