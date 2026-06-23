export type LabourRateConfig = {
  travel_hourly_rate: number;
  first_hour_labour_rate: number;
  additional_hour_labour_rate: number;
};

export type TimesheetLabourTotals = {
  on_site_seconds: number;
  travel_seconds: number;
  on_site_hours: number;
  travel_hours: number;
  labour_amount: number;
  travel_amount: number;
  timesheet_total: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** On-site labour: first hour at first_hour rate, remainder at additional_hour rate. Travel is separate. */
export function calculateTimesheetLabourTotals(
  onSiteSeconds: number,
  travelSeconds: number,
  rates: LabourRateConfig,
): TimesheetLabourTotals {
  const onSiteHours = Math.max(0, onSiteSeconds) / 3600;
  const travelHours = Math.max(0, travelSeconds) / 3600;
  const firstHour = Math.min(onSiteHours, 1);
  const additionalHours = Math.max(0, onSiteHours - 1);
  const labourAmount = roundMoney(
    firstHour * rates.first_hour_labour_rate + additionalHours * rates.additional_hour_labour_rate,
  );
  const travelAmount = roundMoney(travelHours * rates.travel_hourly_rate);
  return {
    on_site_seconds: Math.max(0, onSiteSeconds),
    travel_seconds: Math.max(0, travelSeconds),
    on_site_hours: onSiteHours,
    travel_hours: travelHours,
    labour_amount: labourAmount,
    travel_amount: travelAmount,
    timesheet_total: roundMoney(labourAmount + travelAmount),
  };
}

export function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return hours === 1 ? '1 Hour' : `${hours} Hours`;
  const hourLabel = hours === 1 ? '1 Hour' : `${hours} Hours`;
  return `${hourLabel} ${minutes} min`;
}
