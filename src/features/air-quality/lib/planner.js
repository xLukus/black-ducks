/* PURE. Turns a day of hourly values into the two answers the site exists to give:
   when to go out, and when to air the rooms. */
import { ADVICE_GENERAL, ADVICE_SENSITIVE, DAY_WINDOW, K_LOCAL, PROFILES, VERDICTS } from './config';
import { bandIndex, effBand } from './aqi';
/** median heating-smoke profile of the sensitive sites: the reference spot */
export function referenceProfile(profiles) {
    const ps = profiles.filter(Boolean);
    if (!ps.length)
        return null;
    const out = [];
    for (let h = 0; h < 24; h++) {
        const v = ps.map(p => p[h]).sort((a, b) => a - b);
        out.push(v[Math.floor(v.length / 2)]);
    }
    return out;
}
/** The value at one spot = the city measurement, adjusted by how much more (or less) heating
    smoke the model puts there than at a typical site. K_LOCAL is ARSO's 2021 GRAL-vs-measurement fit. */
export function localEstimate(city, g24, ref, hourUTC) {
    if (!city || !g24 || !ref)
        return city;
    const v = Math.max(city.v * 0.5, city.v + K_LOCAL * (g24[hourUTC] - ref[hourUTC]));
    return { v, src: city.src === 'meas' ? 'local' : city.src };
}
/** a spot's own smoke peak hours: near its daily maximum and clearly smokier than a typical site */
export function isHot(g24, ref, hourUTC) {
    if (!g24 || !ref)
        return false;
    const peak = Math.max(...g24);
    return peak >= 6 && g24[hourUTC] >= 0.9 * peak && g24[hourUTC] - ref[hourUTC] >= 2;
}
export function plan(hours, profile, pollutant = 'pm25') {
    const width = 2;
    const eff = (v) => effBand(bandIndex(v, pollutant), profile);
    // best window: daytime only, lowest mean, local smoke-peak hours penalised
    let best = null;
    for (let a = DAY_WINDOW.from; a + width - 1 <= DAY_WINDOW.to; a++) {
        const seg = hours.slice(a, a + width);
        if (seg.length < width || seg.some(x => !x.r))
            continue;
        const mean = seg.reduce((s, x) => s + x.r.v * (x.hot ? 1.3 : 1), 0) / seg.length;
        if (!best || mean < best.mean)
            best = { from: a, to: a + width, mean };
    }
    // best hour to air the rooms: never during a local smoke peak
    let airing = null;
    hours.slice(7, 22).forEach(x => {
        if (x.r && !x.hot && (!airing || x.r.v < airing.r.v))
            airing = x;
    });
    // hours to avoid: elevated for this group, or a local smoke peak
    const avoid = [];
    hours.filter(x => x.h >= 6 && x.r && (eff(x.r.v) >= 3 || x.hot)).forEach(x => {
        const last = avoid[avoid.length - 1];
        if (last && last.to === x.h) {
            last.to = x.h + 1;
            last.hot = last.hot || x.hot;
            last.max = Math.max(last.max, x.r.v);
        }
        else
            avoid.push({ from: x.h, to: x.h + 1, hot: x.hot, max: x.r.v });
    });
    avoid.sort((p, q) => (q.to - q.from) - (p.to - p.from));
    return {
        best,
        bestBand: best ? eff(best.mean) : null,
        airing,
        avoid: avoid.slice(0, 1),
        missing: hours.filter(x => !x.r).length,
        forecast: hours.filter(x => x.r && x.r.src === 'fc').length
    };
}
export function verdict(value, profile, pollutant = 'pm25') {
    const band = bandIndex(value, pollutant);
    const e = effBand(band, profile);
    const pr = PROFILES[profile] || PROFILES.everyone;
    return { band, eff: e, title: VERDICTS[e], advice: (pr.shift ? ADVICE_SENSITIVE : ADVICE_GENERAL)[band] };
}
