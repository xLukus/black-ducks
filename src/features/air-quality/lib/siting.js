/* PURE. Scores the 250 m grid and picks sensor sites greedily — a maximal-covering problem:
     score = w1*exposure + w2*concentration + w3*coverage gap + w4*uncertainty
   every term normalised to 0-1. After each pick the coverage term is recomputed,
   so the second sensor never lands beside the first. */
import { dist } from './geo';
const EXPOSURE_R = 300; // m: a sensitive site this close counts for the cell
const COVER_M = 400; // m: how far one instrument is taken to represent
const MIN_SPACING = 400; // m: two new sensors may not sit on top of each other
const HOST_R = 250; // m: a kindergarten or school this close can host it
const GAP_CAP = 2000; // m: beyond this, extra distance stops counting
export const CAT_W = {
    kindergarten: 1.0, 'elderly home': 1.0, school: 0.7, 'health centre': 0.5, hospital: 0.5
};
const HOSTS = ['kindergarten', 'school'];
export function createSiting(data) {
    const F = {};
    data.fields.forEach((n, k) => { F[n] = k; });
    const cells = data.cells, sites = data.sites, N = cells.length;
    const cLon = cells.map(c => c[F.lon]), cLat = cells.map(c => c[F.lat]);
    const EXPOSURE = new Float64Array(N), CONC = new Float64Array(N), UNC = new Float64Array(N);
    const HOST = new Array(N).fill(null);
    const siteW = sites.map(s => CAT_W[s.cat] || 0.4);
    for (let k = 0; k < N; k++) {
        let w = 0, host = null, hostD = Infinity;
        for (let s = 0; s < sites.length; s++) {
            const d = dist(cLon[k], cLat[k], sites[s].lon, sites[s].lat);
            if (d <= EXPOSURE_R)
                w += siteW[s] * (1 - d / EXPOSURE_R);
            if (d < hostD && d <= HOST_R && HOSTS.includes(sites[s].cat)) {
                hostD = d;
                host = sites[s];
            }
        }
        EXPOSURE[k] = w;
        HOST[k] = host;
        UNC[k] = cells[k][F.unc] || 0;
    }
    // people live between the institutions too
    const flats = cells.map(c => c[F.flats] || 0);
    const fMax = Math.max(...flats) || 1;
    let eMax = 0;
    for (let i = 0; i < N; i++)
        eMax = Math.max(eMax, EXPOSURE[i]);
    eMax = eMax || 1;
    for (let i = 0; i < N; i++)
        EXPOSURE[i] = 0.65 * (EXPOSURE[i] / eMax) + 0.35 * (flats[i] / fMax);
    let xMax = 0;
    for (let i = 0; i < N; i++)
        xMax = Math.max(xMax, EXPOSURE[i]);
    if (xMax > 0)
        for (let i = 0; i < N; i++)
            EXPOSURE[i] /= xMax;
    // GRAL carries the spatial signal; CAMx at 4.4 km mostly sets the level
    const g = cells.map(c => c[F.gral_eve] || 0);
    const cx = cells.map(c => c[F.camx] || 0);
    const gMax = Math.max(...g) || 1;
    const cxPos = cx.filter(v => v > 0);
    const cxMin = cxPos.length ? Math.min(...cxPos) : 0;
    const cxMax = Math.max(...cx) || 1;
    for (let i = 0; i < N; i++) {
        const cxN = cxMax > cxMin ? (cx[i] - cxMin) / (cxMax - cxMin) : 0;
        CONC[i] = 0.8 * (g[i] / gMax) + 0.2 * Math.max(0, cxN);
    }
    function solve(opts) {
        const w = opts.weights;
        const sum = (w.exposure + w.conc + w.gap + w.unc) || 1;
        const W = { e: w.exposure / sum, c: w.conc / sum, g: w.gap / sum, u: w.unc / sum };
        const existing = opts.existing || [];
        const eligible = new Uint8Array(N);
        for (let k = 0; k < N; k++)
            eligible[k] = cells[k][F.blds] >= opts.minBuildings && (!opts.hostsOnly || HOST[k]) ? 1 : 0;
        const inst = existing.map(s => ({ lon: s.lon, lat: s.lat }));
        const picks = [];
        let firstScores = new Float64Array(N);
        for (let round = 0; round < opts.n; round++) {
            const gap = new Float64Array(N), cover = new Float64Array(N), score = new Float64Array(N);
            let bestK = -1, bestV = -1;
            for (let k = 0; k < N; k++) {
                let nearest = Infinity;
                for (const s of inst)
                    nearest = Math.min(nearest, dist(cLon[k], cLat[k], s.lon, s.lat));
                gap[k] = Math.min(nearest, GAP_CAP) / GAP_CAP;
                cover[k] = Math.exp(-nearest / COVER_M);
                // what makes this maximal-covering and not just top-N: exposure an existing
                // instrument already represents no longer counts
                const e = EXPOSURE[k] * (1 - cover[k]);
                const v = W.e * e + W.c * CONC[k] + W.g * gap[k] + W.u * UNC[k];
                score[k] = v;
                if (!eligible[k])
                    continue;
                if (picks.some(p => dist(cLon[k], cLat[k], p.lon, p.lat) < MIN_SPACING))
                    continue;
                if (v > bestV) {
                    bestV = v;
                    bestK = k;
                }
            }
            if (round === 0)
                firstScores = score;
            if (bestK < 0)
                break;
            const c = cells[bestK];
            let near = Infinity, nearName = '';
            existing.forEach(st => {
                const d = dist(cLon[bestK], cLat[bestK], st.lon, st.lat);
                if (d < near) {
                    near = d;
                    nearName = st.name;
                }
            });
            picks.push({
                k: bestK, lon: cLon[bestK], lat: cLat[bestK], score: bestV, host: HOST[bestK],
                parts: { exposure: EXPOSURE[bestK] * (1 - cover[bestK]), conc: CONC[bestK], gap: gap[bestK], unc: UNC[bestK] },
                gral: c[F.gral_eve], flats: c[F.flats], blds: c[F.blds],
                nearest: near, nearestName: nearName,
                sites: sites.filter(st => dist(cLon[bestK], cLat[bestK], st.lon, st.lat) <= EXPOSURE_R)
            });
            inst.push({ lon: cLon[bestK], lat: cLat[bestK] });
        }
        return { picks, scores: firstScores };
    }
    return { solve, F, cells, sites, terms: { EXPOSURE, CONC, UNC, HOST } };
}
