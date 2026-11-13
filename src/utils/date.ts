/**
 * Date utility functions respecting local timezone boundaries
 */

export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayString(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  return formatDateToISO(d);
}

export function parseISODate(isoString: string): Date {
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatReadableDate(isoString: string): string {
  const date = parseISODate(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatFullDateHeader(isoString: string): string {
  const date = parseISODate(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatTimeDisplay(timeStr?: string, is24h = true): string {
  if (!timeStr) return '';
  if (is24h) return timeStr;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getWeekDays(referenceDate: Date, startOfWeekMonday = true): string[] {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 is Sun, 1 is Mon, etc.
  const diff = startOfWeekMonday ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    days.push(formatDateToISO(cur));
  }
  return days;
}

export interface MonthDayItem {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
}

export function getMonthDays(year: number, month: number, startOfWeekMonday = true): MonthDayItem[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days: MonthDayItem[] = [];
  const startDayOfWeek = firstDay.getDay();
  const startPadding = startOfWeekMonday
    ? (startDayOfWeek === 0 ? 6 : startDayOfWeek - 1)
    : startDayOfWeek;

  // Leading days from previous month
  for (let i = startPadding; i > 0; i--) {
    const prevDate = new Date(year, month, 1 - i);
    days.push({
      date: formatDateToISO(prevDate),
      dayNumber: prevDate.getDate(),
      isCurrentMonth: false,
    });
  }

  // Days in current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const curDate = new Date(year, month, i);
    days.push({
      date: formatDateToISO(curDate),
      dayNumber: i,
      isCurrentMonth: true,
    });
  }

  // Trailing padding to fill out 35 or 42 grid cells
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const nextDate = new Date(year, month + 1, i);
    days.push({
      date: formatDateToISO(nextDate),
      dayNumber: nextDate.getDate(),
      isCurrentMonth: false,
    });
  }

  return days;
}
