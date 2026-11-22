/* What is happening right now, for this person — feeds the banner and browser notifications. */
import { BAND_LABELS, NAMES } from './config';
import { air, cityAt, dayHours, timeAt } from './air';
import { bandIndex, effBand } from './aqi';
import { fmtHour, hhmm, round } from './format';
import { plan } from './planner';
export function assess(profile, p, level) {
    const cur = cityAt(air.lastMeas, p);
    if (!cur)
        return null;
    const band = bandIndex(cur.v, p);
    const eff = effBand(band, profile);
    const best = plan(dayHours(null, air.lastMeas, p), profile, p).best;
    const win = best ? ` Cleanest time outside today: ${hhmm(best.from)}–${hhmm(best.to)}.` : '';
    if (eff >= level) {
        return {
            title: `${NAMES[p]} is ${BAND_LABELS[band].toLowerCase()} in Ljubljana right now`,
            body: `${round(cur.v)} µg/m³.${win} Keep windows shut while it lasts.`,
            severe: eff >= 4, eff
        };
    }
    for (let i = air.lastMeas + 1; i <= air.lastMeas + 12 && i < air.n; i++) {
        const r = cityAt(i, p);
        if (!r)
            continue;
        const b = bandIndex(r.v, p);
        if (effBand(b, profile) >= level) {
            return {
                title: `Air expected to turn ${BAND_LABELS[b].toLowerCase()} after ${fmtHour(timeAt(i))}`,
                body: `Forecast ${round(r.v)} µg/m³.${win}`,
                severe: false, eff: effBand(b, profile)
            };
        }
    }
    return null;
}
