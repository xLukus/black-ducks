function bytes(b64) {
    if (typeof atob === 'function')
        return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Uint8Array(globalThis.Buffer.from(b64, 'base64'));
}
function f64(b64) { const u = bytes(b64); return new Float64Array(u.buffer, u.byteOffset, u.byteLength / 8); }
function u32(b64) { const u = bytes(b64); return new Uint32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); }
class Regressor {
    baseline;
    starts;
    feat;
    thr;
    kid;
    flag;
    bitsets;
    nStations;
    constructor(r) {
        this.baseline = r.baseline;
        this.starts = u32(r.starts);
        this.feat = bytes(r.feat);
        this.thr = f64(r.thr);
        this.kid = bytes(r.kid);
        this.flag = bytes(r.flag);
        this.bitsets = r.bitsets;
        this.nStations = r.nStations;
    }
    predict(x) {
        let sum = this.baseline;
        const { starts, feat, thr, kid, flag } = this;
        for (let t = 0; t < starts.length; t++) {
            const s = starts[t];
            let n = s;
            for (;;) {
                const f = feat[n];
                if (f === 255) {
                    sum += thr[n];
                    break;
                }
                const v = x[f], fl = flag[n];
                let left;
                if (fl & 2) {
                    // categorical (station): unknown codes are treated as missing, as scikit-learn does
                    const known = Number.isInteger(v) && v >= 0 && v < this.nStations;
                    left = known ? ((this.bitsets[thr[n]] >>> v) & 1) === 1 : (fl & 1) === 1;
                }
                else {
                    left = Number.isNaN(v) ? (fl & 1) === 1 : v <= thr[n];
                }
                n = s + kid[2 * n + (left ? 0 : 1)];
            }
        }
        return sum;
    }
}
const H_BUCKETS = [[1, 3], [4, 12], [13, 24], [25, 48]];
function groupOf(kind, row) {
    if (kind === 'daily')
        return 'k' + row.k;
    const h = Number(row.h);
    for (const [a, b] of H_BUCKETS)
        if (h >= a && h <= b)
            return `${a}-${b}h`;
    return 'other';
}
export function createModel(raw) {
    const feats = raw.features;
    const per = {};
    Object.keys(raw.pollutants).forEach(p => {
        const m = raw.pollutants[p];
        per[p] = { base: m.baseCol, Q: m.Q, regs: raw.quantiles.map(q => new Regressor(m.models[String(q)])) };
    });
    const x = new Float64Array(feats.length);
    return {
        kind: raw.kind,
        features: feats,
        trainedUntil: raw.trainedUntil,
        predict(p, row) {
            const m = per[p];
            for (let i = 0; i < feats.length; i++) {
                const v = row[feats[i]];
                x[i] = v == null || !isFinite(v) ? NaN : v;
            }
            const R = m.regs.map(r => r.predict(x)).sort((a, b) => a - b);
            const q = m.Q[groupOf(raw.kind, row)] ?? 0;
            R[0] -= q;
            R[2] += q;
            const base = Math.log1p(Number(row[m.base]));
            return R.map(r => Math.max(0, Math.expm1(r + base)));
        }
    };
}
/** P(value > thr) from (P10, P50, P90), split log-normal — same as prob_over() in model.py */
export function probOver(P, thr) {
    const [lo, mid, hi] = P.map(Math.log1p);
    const z90 = 1.2815515655446004;
    const sUp = Math.max((hi - mid) / z90, 1e-3), sDn = Math.max((mid - lo) / z90, 1e-3);
    const d = Math.log1p(thr) - mid;
    return 1 - normCdf(d > 0 ? d / sUp : d / sDn);
}
function normCdf(z) {
    // Abramowitz-Stegun 7.1.26 via erf; error < 1.5e-7
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
