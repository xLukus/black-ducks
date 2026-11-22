/* The forecast. Runs the team's model (tools/forecast/, exported to public/data/forecast-*.js)
   on live inputs, the same way napovej.py does:

     grid      every hour from 34 days ago to 72 h ahead (UTC)
     PM        ARSO measurements: package history (forecast-history.js) + the live feed, live wins
     weather   Open-Meteo forecast at Bežigrad, plus the temperature at Pasja ravan and Krvavec
     CAMS      Open-Meteo CAMS Europe at each station
     issue     each station's newest measurement; hourly targets up to now+48, daily: tomorrow
               and the day after (local days)

   The P50 goes into each ARSO station's forecast series, so the map, timeline, planner and alerts
   all use it; P10-P90 is kept as the band. If the live weather is unreachable the model cannot run
   (its strongest inputs are weather forecasts) and the CAMS forecast is used instead.

   A different forecaster can still be plugged in with setForecastProvider(). */
import { ENDPOINTS } from './config';
import { air, cityAt, estimateAt, HOUR, idxOf, stationById, timeAt } from './air';
import { loadData } from './data';
import { createFeatureBuilder, MAX_H, MET_COLS, STATIONS } from './forecastFeatures';
import { createModel, probOver } from './hgb';
import { isNum } from './format';
// ---------------------------------------------------------------- the model run
const PAST_DAYS = 35;
const COORDS = {
    E403: [46.0655449, 14.5127203], E405: [46.0720916, 14.4871183], E404: [46.037487, 14.4892717]
};
const PASJA = [46.0978, 14.2281];
const KRVAVEC = [46.297352, 14.533315];
const OM_MET = {
    temperature_2m: 't2m', relative_humidity_2m: 'rh', precipitation: 'precip', wind_speed_10m: 'wind',
    wind_direction_10m: 'wdir', wind_gusts_10m: 'gust', cloud_cover: 'cloud', shortwave_radiation: 'rad',
    boundary_layer_height: 'blh', surface_pressure: 'psfc'
};
/** daily limits shown with the day forecast: PM2.5 25 (EU 2030), PM10 50 */
export const DAILY_LIMIT = { pm25: 25, pm10: 50 };
export const model = {
    status: 'idle',
    reason: '',
    issued: 0,
    trainedUntil: '',
    daily: []
};
async function om(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
        const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
        if (!res.ok)
            throw new Error('HTTP ' + res.status);
        const j = await res.json();
        return (Array.isArray(j) ? j : [j]).map((x) => x.hourly);
    }
    finally {
        clearTimeout(t);
    }
}
const latlon = (pts) => `latitude=${pts.map(p => p[0]).join(',')}&longitude=${pts.map(p => p[1]).join(',')}`;
function put(dst, t0, times, vals) {
    times.forEach((t, k) => {
        const i = Math.round((Date.parse(t + 'Z') - t0) / HOUR);
        const v = vals[k];
        if (i >= 0 && i < dst.length && isNum(v))
            dst[i] = v;
    });
}
let models = null;
async function loadModels() {
    if (!models) {
        const [h, d] = await Promise.all([loadData('forecast-hourly'), loadData('forecast-daily')]);
        models = { hourly: createModel(h), daily: createModel(d) };
    }
    return models;
}
/** Fetch the live inputs, run the model, write the results into the stations. */
export async function runModel() {
    model.status = 'running';
    try {
        const now = Math.floor(Date.now() / HOUR) * HOUR;
        const t0 = now - (PAST_DAYS - 1) * 24 * HOUR;
        const n = (PAST_DAYS - 1) * 24 + MAX_H + 24 + 1;
        const nan = () => new Float64Array(n).fill(NaN);
        const common = `timezone=UTC&past_days=${PAST_DAYS}&forecast_days=3`;
        const [M, hist, met, cams] = await Promise.all([
            loadModels(),
            loadData('forecast-history'),
            om(`${ENDPOINTS.meteo}?${latlon([COORDS.E403, PASJA, KRVAVEC])}&hourly=${Object.keys(OM_MET).join(',')}&${common}`),
            om(`${ENDPOINTS.cams}?${latlon(STATIONS.map(s => COORDS[s]))}&hourly=pm10,pm2_5&domains=cams_europe&${common}`)
        ]);
        const F = {
            t0, n,
            met: Object.fromEntries(MET_COLS.map(c => [c, nan()])),
            pm: Object.fromEntries(STATIONS.map(s => [s, { pm10: nan(), pm25: nan() }])),
            cams: Object.fromEntries(STATIONS.map(s => [s, { pm10: nan(), pm25: nan() }]))
        };
        for (const [api, ours] of Object.entries(OM_MET))
            put(F.met[ours], t0, met[0].time, met[0][api]);
        put(F.met.t2m_pasja, t0, met[1].time, met[1].temperature_2m);
        put(F.met.t2m_krvavec, t0, met[2].time, met[2].temperature_2m);
        STATIONS.forEach((s, k) => {
            put(F.cams[s].pm10, t0, cams[k].time, cams[k].pm10);
            put(F.cams[s].pm25, t0, cams[k].time, cams[k].pm2_5);
        });
        // measurements: package history, then the live feed on top (a live row replaces the whole hour)
        const h0 = Date.parse(hist.t0);
        for (const s of STATIONS) {
            for (const p of ['pm10', 'pm25']) {
                hist.stations[s][p].forEach((v, k) => {
                    const i = Math.round((h0 + k * HOUR - t0) / HOUR);
                    if (i >= 0 && i < n && v != null)
                        F.pm[s][p][i] = v;
                });
            }
            air.arsoRows.get(s)?.forEach(([a, b], ms) => {
                const i = Math.round((ms - t0) / HOUR);
                if (i >= 0 && i < n) {
                    F.pm[s].pm10[i] = a;
                    F.pm[s].pm25[i] = b;
                }
            });
        }
        const upto = (PAST_DAYS - 1) * 24; // position of "now"
        if (!F.met.t2m.slice(upto + 1, upto + MAX_H + 1).some(v => !Number.isNaN(v)))
            throw new Error('no weather forecast');
        const fb = createFeatureBuilder(F);
        const daily = [];
        let wrote = 0, last = 0;
        for (const s of STATIONS) {
            const st = stationById(s);
            for (const p of ['pm25', 'pm10']) {
                const i = fb.lastObs(s, p, upto);
                if (i < 0)
                    continue;
                const age = upto - i;
                if (st) {
                    st.fc = st.fc || { pm10: [], pm25: [] };
                    st.band = st.band || { pm10: [], pm25: [] };
                }
                // napovej.py starts at now+1; we also fill the hours between the newest measurement and now
                for (let h = 1; h <= age + MAX_H; h++) {
                    const P = M.hourly.predict(p, fb.hourly(s, p, i, h));
                    const t = t0 + (i + h) * HOUR, j = idxOf(t);
                    if (st && j >= 0) {
                        st.fc[p][j] = P[1];
                        st.band[p][j] = [P[0], P[2]];
                        wrote++;
                        last = Math.max(last, j);
                    }
                }
                for (const k of [1, 2]) {
                    const { row, day } = fb.daily(s, p, i, k);
                    const P = M.daily.predict(p, row);
                    daily.push({ station: s, p, day, k, p10: P[0], p50: P[1], p90: P[2], pOver: probOver(P, DAILY_LIMIT[p]) });
                }
            }
        }
        if (!wrote)
            throw new Error('no station had a recent measurement');
        air.n = Math.max(air.n, last + 1);
        Object.assign(model, { status: 'ok', reason: '', issued: now, trainedUntil: M.hourly.trainedUntil, daily });
        listeners.forEach(fn => fn());
        return true;
    }
    catch (e) {
        Object.assign(model, { status: 'unavailable', reason: e.message });
        console.info('Forecast model not run:', e.message);
        listeners.forEach(fn => fn());
        return false;
    }
}
// ---------------------------------------------------------------- reading it back
/** the 80 % range of the forecast at hour i for the city (mean of the stations' bands) */
export function cityBand(i, p) {
    let lo = 0, hi = 0, n = 0;
    for (const s of STATIONS) {
        const b = stationById(s)?.band?.[p][i];
        if (b) {
            lo += b[0];
            hi += b[1];
            n++;
        }
    }
    return n ? [lo / n, hi / n] : null;
}
/** the team model: the three stations' forecasts, blended to the point by distance (mean for the city) */
const modelProvider = {
    name: 'Team model · ARSO + Open-Meteo weather + CAMS',
    async predict(point, fromIdx, hours, p) {
        const out = [];
        let any = false;
        for (let k = 1; k <= hours; k++) {
            const i = fromIdx + k;
            let ws = 0, v = 0, lo = 0, hi = 0;
            for (const s of STATIONS) {
                const st = stationById(s), f = st?.fc?.[p][i], b = st?.band?.[p][i];
                if (!st || !isNum(f) || !b)
                    continue;
                let w = 1;
                if (point) {
                    const dx = (st.lng - point.lng) * 77.3, dy = (st.lat - point.lat) * 111.32;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    w = d < 0.05 ? 1e6 : 1 / Math.pow(Math.max(d, 0.3), 2);
                }
                ws += w;
                v += w * f;
                lo += w * b[0];
                hi += w * b[1];
            }
            if (ws)
                any = true;
            out.push({ t: timeAt(i), v: ws ? v / ws : null, lo: ws ? lo / ws : null, hi: ws ? hi / ws : null });
        }
        return any ? out : null;
    }
};
/** fallback: the CAMS regional forecast blended to the point */
const camsProvider = {
    name: 'CAMS regional forecast (the team model needs the live weather)',
    async predict(point, fromIdx, hours, p) {
        const out = [];
        let any = false;
        for (let k = 1; k <= hours; k++) {
            const i = fromIdx + k;
            let v = null;
            if (i < air.n) {
                if (point) {
                    const e = estimateAt(point.lng, point.lat, i, p);
                    v = e && e.fc ? e.v : null;
                }
                else {
                    const c = cityAt(i, p);
                    v = c && c.src === 'fc' ? c.v : null;
                }
            }
            if (v != null)
                any = true;
            out.push({ t: timeAt(i), v });
        }
        return any ? out : null;
    }
};
let custom = null;
const listeners = new Set();
export function setForecastProvider(p) {
    custom = p;
    listeners.forEach(fn => fn());
}
export const getForecastProvider = () => custom || (model.status === 'ok' ? modelProvider : camsProvider);
export function onForecastProvider(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
