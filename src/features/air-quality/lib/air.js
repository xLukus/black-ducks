/* The hourly air data, shared by every page. A module singleton: arrays are mutated in place
   by the live refresh, and the store's `version` is bumped so React re-renders. */
import { ENDPOINTS, SC_CALIBRATION } from './config';
import { loadData } from './data';
import { isNum, localHour } from './format';
import { isHot, localEstimate, referenceProfile } from './planner';
export const HOUR = 3600e3;
export const air = {
    t0: 0,
    n: 0,
    lastMeas: 0,
    stations: [],
    weather: null,
    places: null,
    ref: null,
    live: { arso: false, meteo: false, cams: false, sensors: false },
    /** hours (per station) that came with the bundled data: the live feed never overwrites those */
    bundled: new Map(),
    /** raw rows of the live ARSO feed per station: UTC ms -> [pm10, pm25] (NaN when missing), last copy wins */
    arsoRows: new Map()
};
export const timeAt = (i) => air.t0 + i * HOUR;
export const idxOf = (ms) => Math.round((ms - air.t0) / HOUR);
export const utcHour = (i) => new Date(timeAt(i)).getUTCHours();
/** one station at one hour: measured / estimated, else the model forecast after the last measurement */
export function valueAt(st, i, p) {
    const v = st[p][i];
    if (isNum(v))
        return { v, src: st.kind === 'arso' ? 'meas' : 'est' };
    const f = st.fc && st.fc[p][i];
    if (i > air.lastMeas && isNum(f))
        return { v: f, src: 'fc' };
    return null;
}
/** mean over the ARSO reference stations: the city number */
export function cityAt(i, p) {
    let sum = 0, n = 0, src = null;
    for (const st of air.stations) {
        if (st.kind !== 'arso')
            continue;
        const r = valueAt(st, i, p);
        if (!r)
            continue;
        sum += r.v;
        n++;
        src = src === 'meas' ? 'meas' : r.src;
    }
    return n ? { v: sum / n, src: src } : null;
}
/** air at any point: inverse-distance blend of stations and calibrated sensors (ARSO counts double) */
export function estimateAt(lng, lat, i, p) {
    const kx = Math.cos((lat * Math.PI) / 180) * 111.32, ky = 111.32;
    let wsum = 0, vsum = 0, n = 0, fc = false, nearest = null, nd = Infinity;
    for (const st of air.stations) {
        if (st.kind !== 'arso' && st.reliable === false)
            continue;
        const r = valueAt(st, i, p);
        if (!r)
            continue;
        const dx = (st.lng - lng) * kx, dy = (st.lat - lat) * ky;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nd) {
            nd = d;
            nearest = st;
        }
        const w = (st.kind === 'arso' ? 2 : 1) / Math.pow(Math.max(d, 0.3), 2);
        wsum += w;
        vsum += w * r.v;
        n++;
        if (r.src === 'fc')
            fc = true;
    }
    return n ? { v: vsum / wsum, n, fc, nearest: nearest, dist: nd } : null;
}
export function stationById(id) {
    return air.stations.find(s => s.id === id) || null;
}
/** the typical-day heating-smoke profile at the selection, when the model covers it */
export function g24For(sel) {
    if (!sel || !air.places)
        return null;
    if (sel.kind === 'place')
        return air.places.rows[sel.id]?.[7] || null;
    if (sel.kind === 'station')
        return air.places.stationG24?.[sel.id] || null;
    return null;
}
export function coordsOf(sel) {
    if (!sel)
        return null;
    if (sel.kind === 'spot')
        return [sel.lng, sel.lat];
    if (sel.kind === 'station') {
        const st = stationById(sel.id);
        return st ? [st.lng, st.lat] : null;
    }
    const r = air.places?.rows[sel.id];
    return r ? [r[0], r[1]] : null;
}
/** the value for whatever is selected (city average when nothing is) */
export function readingFor(sel, i, p) {
    if (i < 0 || i >= air.n)
        return null;
    if (sel && sel.kind === 'station') {
        const st = stationById(sel.id);
        const r = st && valueAt(st, i, p);
        if (r)
            return r;
    }
    if (sel && sel.kind === 'spot') {
        const e = estimateAt(sel.lng, sel.lat, i, p);
        return e ? { v: e.v, src: e.fc ? 'fc' : 'idw' } : null;
    }
    const city = cityAt(i, p);
    if (sel && sel.kind === 'place')
        return localEstimate(city, g24For(sel), air.ref, utcHour(i));
    return city;
}
/** the 24 local hours of the day that contains hour index `idx` */
export function dayHours(sel, idx, p) {
    const start = idx - localHour(timeAt(idx));
    const g = g24For(sel);
    const out = [];
    for (let k = 0; k < 24; k++) {
        const i = start + k;
        out.push({ i, h: k, r: readingFor(sel, i, p), hot: i >= 0 && !!g && isHot(g, air.ref, utcHour(i)) });
    }
    return out;
}
export function nameOf(sel) {
    if (!sel)
        return 'Ljubljana, city average';
    if (sel.kind === 'station')
        return stationById(sel.id)?.short || 'Station';
    if (sel.kind === 'spot')
        return sel.label || (sel.building ? 'Building' : 'Selected spot');
    const r = air.places?.rows[sel.id];
    return r ? r[3] || cap(r[2]) : 'Place';
}
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// ---------------------------------------------------------------------------
//  Loading
// ---------------------------------------------------------------------------
let bootP = null;
export function bootAir() {
    if (bootP)
        return bootP;
    bootP = Promise.all([loadData('measurements'), loadData('weather'), loadData('places')]).then(([m, w, pl]) => {
        air.t0 = Date.parse(m.t0);
        air.n = m.n;
        air.weather = w;
        air.places = pl;
        air.ref = referenceProfile(pl.rows.map(r => r[7]));
        air.stations = m.stations.map(s => ({
            ...s,
            short: s.kind === 'arso'
                ? s.name.replace(/^LJ /, 'ARSO ')
                : s.name.replace(/^Ljubljana /, '').replace(/ \(Sensor\.Community\)$/, ' (sensor)').replace(/ \(PurpleAir\)$/, ' (sensor)')
        }));
        for (const st of air.stations) {
            for (let i = st.pm10.length - 1; i >= 0; i--) {
                if (isNum(st.pm10[i]) || isNum(st.pm25[i])) {
                    air.bundled.set(st.id, i);
                    if (st.kind === 'arso')
                        air.lastMeas = Math.max(air.lastMeas, i);
                    break;
                }
            }
        }
    });
    return bootP;
}
// ---------------------------------------------------------------------------
//  Live data (best effort; the site works fully on the bundled data)
// ---------------------------------------------------------------------------
function fetchTimeout(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { signal: ctl.signal, cache: 'no-store' }).finally(() => clearTimeout(t));
}
/** ARSO publishes "<5" for values under the detection limit */
const cell = (s) => (s == null || s === '' ? null : s.trim().startsWith('<') ? parseFloat(s.trim().slice(1)) / 2 : parseFloat(s));
async function liveArso() {
    const res = await fetchTimeout(ENDPOINTS.arso, 12000);
    if (!res.ok)
        throw new Error('HTTP ' + res.status);
    const lines = (await res.text()).trim().split(/\r?\n/);
    const head = lines.shift().split(',');
    const byId = {};
    air.stations.forEach(s => { if (s.kind === 'arso')
        byId[s.id] = s; });
    let maxI = air.lastMeas;
    for (const line of lines) {
        const cols = line.split(','), row = {};
        head.forEach((h, k) => { row[h] = cols[k]; });
        const st = byId[row.station_code];
        if (!st || !row.time_from_local)
            continue;
        const i = idxOf(Date.parse(row.time_from_local + ':00+01:00')); // ARSO: UTC+1, no DST
        if (!(i >= 0) || i > air.n + 24 * 60)
            continue;
        const a = cell(row.pm10), b = cell(row.pm25);
        if (!air.arsoRows.has(st.id))
            air.arsoRows.set(st.id, new Map());
        air.arsoRows.get(st.id).set(timeAt(i), [isNum(a) ? a : NaN, isNum(b) ? b : NaN]);
        // ARSO sometimes re-publishes an hour; the feed is in order, so the last copy wins
        if (i > (air.bundled.get(st.id) ?? -1)) {
            if (isNum(a))
                st.pm10[i] = a;
            if (isNum(b))
                st.pm25[i] = b;
        }
        if (isNum(a) || isNum(b))
            maxI = Math.max(maxI, i);
    }
    air.lastMeas = maxI;
    air.n = Math.max(air.n, maxI + 1);
    air.live.arso = true;
}
async function liveMeteo() {
    const w = air.weather;
    if (!w)
        return;
    const days = Math.min(92, Math.ceil((Date.now() - air.t0) / 864e5) + 1);
    const url = ENDPOINTS.meteo + '?latitude=46.0655&longitude=14.5127&hourly=boundary_layer_height,temperature_2m,wind_speed_10m' +
        '&past_days=' + days + '&forecast_days=2&timezone=UTC';
    const res = await fetchTimeout(url, 10000);
    if (!res.ok)
        throw new Error('HTTP ' + res.status);
    const hr = (await res.json()).hourly;
    hr.time.forEach((t, k) => {
        const i = idxOf(Date.parse(t + ':00Z'));
        if (i < 0)
            return;
        if (!isNum(w.blh[i]) && isNum(hr.boundary_layer_height[k]))
            w.blh[i] = hr.boundary_layer_height[k];
        if (!isNum(w.temp[i]) && isNum(hr.temperature_2m[k]))
            w.temp[i] = hr.temperature_2m[k];
    });
    air.live.meteo = true;
}
async function liveCams() {
    const arso = air.stations.filter(s => s.kind === 'arso');
    const url = ENDPOINTS.cams + '?latitude=' + arso.map(s => s.lat.toFixed(4)).join(',') +
        '&longitude=' + arso.map(s => s.lng.toFixed(4)).join(',') +
        '&hourly=pm10,pm2_5&domains=cams_europe&past_days=1&forecast_days=3&timezone=UTC';
    const res = await fetchTimeout(url, 10000);
    if (!res.ok)
        throw new Error('HTTP ' + res.status);
    let j = await res.json();
    if (!Array.isArray(j))
        j = [j];
    let maxI = 0;
    j.forEach((loc, k) => {
        const st = arso[k];
        if (!st || !loc.hourly)
            return;
        st.fc = { pm10: [], pm25: [] };
        loc.hourly.time.forEach((t, m) => {
            const i = idxOf(Date.parse(t + ':00Z'));
            if (i < 0)
                return;
            st.fc.pm10[i] = loc.hourly.pm10[m];
            st.fc.pm25[i] = loc.hourly.pm2_5[m];
            maxI = Math.max(maxI, i);
        });
    });
    air.n = Math.max(air.n, Math.min(maxI + 1, air.lastMeas + 49));
    air.live.cams = true;
}
/** Sensor.Community: the last 5 minutes of each citizen sensor, calibrated to ARSO and written
    into the current hour. Broken readings (> 300 µg/m³) and uncalibrated devices are dropped. */
async function liveSensors() {
    const res = await fetchTimeout(ENDPOINTS.sensorCommunity, 10000);
    if (!res.ok)
        throw new Error('HTTP ' + res.status);
    const recs = await res.json();
    const acc = new Map();
    for (const r of recs) {
        const id = r.sensor?.id;
        if (!SC_CALIBRATION[id] || String(r.location?.indoor) === '1')
            continue;
        const a = acc.get(id) || { p1: [], p2: [] };
        for (const d of r.sensordatavalues || []) {
            const v = parseFloat(d.value);
            if (!isFinite(v) || v < 0 || v > 300)
                continue;
            if (d.value_type === 'P1')
                a.p1.push(v);
            if (d.value_type === 'P2')
                a.p2.push(v);
        }
        acc.set(id, a);
    }
    const i = idxOf(Math.floor(Date.now() / HOUR) * HOUR);
    if (i < 0 || i >= air.n)
        return;
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    acc.forEach((a, id) => {
        const cal = SC_CALIBRATION[id];
        let st = stationById('S' + id);
        if (!st) {
            st = { id: 'S' + id, kind: 'sensor', name: `Sensor ${id} (Sensor.Community)`, short: `Sensor ${id}`, type: 'Sensor.Community SDS011',
                lng: cal.lon, lat: cal.lat, pm10: [], pm25: [], reliable: true, calStation: cal.ref };
            air.stations.push(st);
        }
        if (a.p2.length)
            st.pm25[i] = Math.max(0, cal.pm25[0] * mean(a.p2) + cal.pm25[1]);
        if (a.p1.length)
            st.pm10[i] = Math.max(0, cal.pm10[0] * mean(a.p1) + cal.pm10[1]);
    });
    air.live.sensors = acc.size > 0;
}
const quiet = (p, what) => p.catch(e => console.info(what + ' not reachable:', e.message));
/** returns true when the newest measured hour moved */
export async function refreshLive() {
    const before = air.lastMeas;
    await quiet(liveArso(), 'ARSO'); // first, so the forecast starts right after the newest measurement
    await Promise.all([quiet(liveMeteo(), 'Mixing height'), quiet(liveCams(), 'CAMS'), quiet(liveSensors(), 'Sensor.Community')]);
    return air.lastMeas !== before;
}
