/* The browser port of znacilke.py must build the same feature rows as Python and, through the
   exported model, give the same P10/P50/P90 as napovej.py. Cases: forecast-cases.json, written by
   tools/forecast/make_fixture.py from ARSOhack package data (replay mode, ERA5 as the weather). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFeatureBuilder, MET_COLS, STATIONS } from './forecastFeatures';
import { createModel } from './hgb';
import cases from './forecast-cases.json';
const f64 = (a) => Float64Array.from(a, v => (v == null ? NaN : v));
function frames(c) {
    const per = (src) => Object.fromEntries(STATIONS.map(s => [s, { pm25: f64(src[s].pm25), pm10: f64(src[s].pm10) }]));
    return { t0: c.t0, n: c.n, pm: per(c.pm), cams: per(c.cams), met: Object.fromEntries(MET_COLS.map(k => [k, f64(c.met[k])])) };
}
function loadModel(kind) {
    const src = readFileSync(`${process.cwd()}/public/data/forecast-${kind}.js`, 'utf8');
    const g = {};
    new Function('window', src)(g);
    return g.LjData['forecast-' + kind];
}
const close = (a, b) => b == null ? Number.isNaN(a) : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const C = cases;
const models = { hourly: createModel(loadModel('hourly')), daily: createModel(loadModel('daily')) };
describe('forecast features and predictions match napovej.py', () => {
    for (const c of C.cases) {
        const fb = createFeatureBuilder(frames(c));
        it(`hourly ${c.when}`, () => {
            const bad = [];
            let worst = 0;
            for (const e of c.hourly) {
                e.h.forEach((h, r) => {
                    const row = fb.hourly(e.station, e.p, e.i, h);
                    C.features.hourly.forEach((f, k) => { if (!close(row[f], e.X[r][k]))
                        bad.push(`${e.station} ${e.p} h${h} ${f}: ${row[f]} vs ${e.X[r][k]}`); });
                    const P = models.hourly.predict(e.p, row);
                    P.forEach((v, q) => { worst = Math.max(worst, Math.abs(v - e.P[r][q]) / Math.max(1, e.P[r][q])); });
                });
            }
            expect(bad.slice(0, 10)).toEqual([]);
            expect(worst).toBeLessThan(1e-5);
        });
        it(`daily ${c.when}`, () => {
            const bad = [];
            let worst = 0;
            for (const e of c.daily) {
                e.k.forEach((k, r) => {
                    const { row, day } = fb.daily(e.station, e.p, e.i, k);
                    if (day !== e.days[r])
                        bad.push(`day ${day} vs ${e.days[r]}`);
                    C.features.daily.forEach((f, q) => { if (!close(row[f], e.X[r][q]))
                        bad.push(`${e.station} ${e.p} k${k} ${f}: ${row[f]} vs ${e.X[r][q]}`); });
                    const P = models.daily.predict(e.p, row);
                    P.forEach((v, q) => { worst = Math.max(worst, Math.abs(v - e.P[r][q]) / Math.max(1, e.P[r][q])); });
                });
            }
            expect(bad.slice(0, 10)).toEqual([]);
            expect(worst).toBeLessThan(1e-5);
        });
    }
});
