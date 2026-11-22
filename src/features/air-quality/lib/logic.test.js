/* The checks that used to live in tests/run.html, now run with `npm test`. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAND_COLORS, BAND_INK, BAND_TEXT } from './config';
import { bandIndex, contrast } from './aqi';
import { plan, verdict } from './planner';
import { createHeating } from './heating';
import { createSiting } from './siting';
import { dist } from './geo';
import { firstProposedSites } from './planningPresentation';
function loadSiting() {
    const src = readFileSync(`${process.cwd()}/public/data/siting.js`, 'utf8');
    const g = {};
    new Function('window', src)(g);
    return g.LjData.siting;
}
const hours = (vals, hot = []) => vals.map((v, h) => ({ h, i: h, r: v == null ? null : { v, src: 'meas' }, hot: hot.includes(h) }));
const DAY = [30, 30, 28, 26, 25, 24, 24, 25, 28, 26, 22, 18, 14, 8, 8, 12, 20, 30, 45, 60, 70, 65, 55, 40];
describe('aqi', () => {
    it('PM2.5 band edges', () => {
        expect([bandIndex(10, 'pm25'), bandIndex(10.1, 'pm25'), bandIndex(25, 'pm25'), bandIndex(75.1, 'pm25')]).toEqual([0, 1, 2, 5]);
    });
    it('PM10 band edges', () => {
        expect([bandIndex(20, 'pm10'), bandIndex(50, 'pm10'), bandIndex(150.1, 'pm10')]).toEqual([0, 2, 5]);
    });
    it('band text colours pass 4.5:1 on white', () => {
        BAND_TEXT.forEach(c => expect(contrast(c, '#ffffff')).toBeGreaterThanOrEqual(4.5));
    });
    it('ink on band chips passes 4.5:1', () => {
        BAND_COLORS.forEach((c, k) => expect(contrast(c, BAND_INK[k])).toBeGreaterThanOrEqual(4.5));
    });
});
describe('planner', () => {
    const p = plan(hours(DAY), 'children', 'pm25');
    it('best window is the cleanest daytime pair', () => expect(p.best?.from).toBe(13));
    it('best window stays inside 07-19', () => { expect(p.best.from).toBeGreaterThanOrEqual(7); expect(p.best.to).toBeLessThanOrEqual(20); });
    it('airing hour is never a heating-smoke peak', () => {
        expect(plan(hours(DAY, [13]), 'children', 'pm25').airing?.h).not.toBe(13);
    });
    it('a stricter group never gets a softer verdict', () => {
        expect(verdict(26, 'children').eff).toBeGreaterThanOrEqual(verdict(26, 'everyone').eff);
    });
    it('no data means no recommendation', () => {
        const r = plan(hours(new Array(24).fill(null)), 'everyone', 'pm25');
        expect(r.best).toBeNull();
        expect(r.airing).toBeNull();
    });
});
describe('models', () => {
    const data = loadSiting();
    const H = createHeating(data);
    const S = createSiting(data);
    const site = H.sites[0];
    const f = (radius, action, share) => H.run({ site, radius, action, share }).f;
    it('estimates stove replacements at €1,000 per building', () => {
        const result = H.run({ site, radius: 1000, action: 'stoves', share: 1 });
        expect(result.targets).toBeGreaterThan(0);
        expect(result.unitCost).toBe(1000);
        expect(result.cost).toBe(result.targets * 1000);
    });
    it('halving the share halves the effect', () => expect(Math.abs(f(300, 'stoves', 1) / 2 - f(300, 'stoves', 0.5))).toBeLessThan(1e-9));
    it('a bigger radius never removes less', () => {
        const r = [250, 400, 700, 1000].map(x => f(x, 'stoves', 1));
        r.forEach((v, i) => { if (i)
            expect(v).toBeGreaterThanOrEqual(r[i - 1] - 1e-12); });
    });
    it('even a total ban inside 1 km removes less than all of it', () => expect(f(1000, 'ban', 1)).toBeLessThan(1));
    it('zero share changes nothing', () => expect(f(500, 'stoves', 0)).toBe(0));
    it('replacing stoves cannot beat stopping all burning', () => expect(f(300, 'stoves', 1)).toBeLessThanOrEqual(f(300, 'ban', 1) + 1e-12));
    it('district heating removes less than a ban', () => expect(f(300, 'heat', 1)).toBeLessThan(f(300, 'ban', 1)));
    it('siting terms are normalised to 0-1', () => {
        for (const a of [S.terms.EXPOSURE, S.terms.CONC, S.terms.UNC]) {
            for (const v of a) {
                expect(v).toBeGreaterThanOrEqual(-1e-9);
                expect(v).toBeLessThanOrEqual(1 + 1e-9);
            }
        }
    });
    it('proposed sensors keep at least 400 m apart', () => {
        const res = S.solve({ n: 6, weights: { exposure: 40, conc: 25, gap: 20, unc: 15 }, minBuildings: 5, hostsOnly: false, existing: [] });
        expect(res.picks.length).toBe(6);
        let min = Infinity;
        res.picks.forEach((a, i) => res.picks.slice(i + 1).forEach(b => { min = Math.min(min, dist(a.lon, a.lat, b.lon, b.lat)); }));
        expect(min).toBeGreaterThanOrEqual(400);
    });
});
describe('sensor presentation', () => {
    it('shows only the first five proposed sites in ranked order', () => {
        const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ k }));
        expect(firstProposedSites(picks).map(p => p.k)).toEqual([1, 2, 3, 4, 5]);
        expect(picks).toHaveLength(8);
    });
});
