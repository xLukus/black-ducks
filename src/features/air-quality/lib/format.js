/* Time is UTC internally and only ever formatted in Europe/Ljubljana. */
const TZ = 'Europe/Ljubljana';
const fWhen = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fHour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fDay = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' });
const fDayLong = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fH23 = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
export const isNum = (v) => typeof v === 'number' && isFinite(v);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round = (v) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
export const fmtWhen = (ms) => fWhen.format(ms);
export const fmtHour = (ms) => fHour.format(ms);
export const fmtDay = (ms) => fDay.format(ms);
export const fmtDayLong = (ms) => fDayLong.format(ms);
export const localHour = (ms) => parseInt(fH23.format(ms), 10) % 24;
export const hhmm = (h) => String(h % 24).padStart(2, '0') + ':00';
export const km = (d) => (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km');
export const eur = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + ' M€' : v >= 1000 ? Math.round(v / 1000) + 'k €' : Math.round(v) + ' €';
