/**
 * formatDateTime.ts
 *
 * Timezone-aware date/time formatting utilities.
 * Uses the built-in Intl API (no extra dependency needed).
 *
 * Supported dateFormat values (matching General Settings options):
 *   "DD/MM/YYYY"   → 06/05/2026
 *   "MM/DD/YYYY"   → 05/06/2026
 *   "YYYY-MM-DD"   → 2026-05-06
 *   "DD-MM-YYYY"   → 06-05-2026
 *   "DD.MM.YYYY"   → 06.05.2026
 *   "D MMM YYYY"   → 6 May 2026
 *   "MMMM D, YYYY" → May 6, 2026
 *
 * Supported timeFormat values:
 *   "12h" → 02:30 PM
 *   "24h" → 14:30
 */

function parseDate(isoString?: string): Date | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  return isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns an object with { day, month, monthShort, monthLong, year } adjusted
 * for the given IANA timezone using Intl.DateTimeFormat parts.
 */
function getParts(date: Date, timezone: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    const year = parts.year;
    const month = parts.month;
    const day = parts.day;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLongNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = parseInt(month, 10) - 1;

    return {
      day,          // "06"
      dayNum: parseInt(day, 10),
      month,        // "05"
      monthShort: monthNames[monthIndex] ?? month,
      monthLong: monthLongNames[monthIndex] ?? month,
      year,         // "2026"
    };
  } catch {
    // Fallback to UTC if timezone is invalid
    return {
      day: pad2(date.getUTCDate()),
      dayNum: date.getUTCDate(),
      month: pad2(date.getUTCMonth() + 1),
      monthShort: date.toUTCString().split(' ')[2],
      monthLong: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
      year: String(date.getUTCFullYear()),
    };
  }
}

export function formatDate(
  isoString: string | undefined,
  dateFormat: string = 'DD/MM/YYYY',
  timezone: string = 'UTC'
): string {
  const d = parseDate(isoString);
  if (!d) return '—';

  const p = getParts(d, timezone);

  switch (dateFormat) {
    case 'MM/DD/YYYY': return `${p.month}/${p.day}/${p.year}`;
    case 'YYYY-MM-DD': return `${p.year}-${p.month}-${p.day}`;
    case 'DD-MM-YYYY': return `${p.day}-${p.month}-${p.year}`;
    case 'DD.MM.YYYY': return `${p.day}.${p.month}.${p.year}`;
    case 'D MMM YYYY': return `${p.dayNum} ${p.monthShort} ${p.year}`;
    case 'MMMM D, YYYY': return `${p.monthLong} ${p.dayNum}, ${p.year}`;
    case 'DD/MM/YYYY':
    default:           return `${p.day}/${p.month}/${p.year}`;
  }
}

export function formatTime(
  isoString: string | undefined,
  timeFormat: '12h' | '24h' = '12h',
  timezone: string = 'UTC'
): string {
  const d = parseDate(isoString);
  if (!d) return '—';

  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: timeFormat === '12h',
    });
    return fmt.format(d);
  } catch {
    return d.toLocaleTimeString('en-US', { hour12: timeFormat === '12h' });
  }
}

export function formatDateTime(
  isoString: string | undefined,
  dateFormat: string = 'DD/MM/YYYY',
  timeFormat: '12h' | '24h' = '12h',
  timezone: string = 'UTC'
): string {
  const datePart = formatDate(isoString, dateFormat, timezone);
  const timePart = formatTime(isoString, timeFormat, timezone);
  if (datePart === '—' && timePart === '—') return '—';
  return `${datePart} ${timePart}`;
}
