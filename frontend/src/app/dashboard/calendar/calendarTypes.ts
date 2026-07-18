export type CalendarOfficer = {
  id: number;
  full_name: string;
  calendar_color?: string | null;
};

export type CalendarEventType = 'diary' | 'leave' | 'holiday';

export type MergedCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  officerKey?: string;
  officerLabel?: string;
  type?: CalendarEventType | string;
  raw?: unknown;
};

export type CalendarViewMode = 'daily' | 'weekly' | 'monthly';

export type CalendarWorkspaceMode = 'calendar' | 'dispatch';

export type EventLayers = {
  leave: boolean;
  holidays: boolean;
};

export type HighlightedJob = {
  id: number;
  customer_full_name?: string | null;
  title: string;
  description_name?: string | null;
  job_number?: string | null;
};
