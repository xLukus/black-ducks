export const MAX_H = 48;
const LOCAL = 1;
const H = 3600e3, DAY = 864e5;
export const STATIONS = ['E403', 'E405', 'E404']; // index = the model's station code
export const MET_COLS = ['t2m', 'rh', 'precip', 'wind', 'wdir', 'gust', 'cloud', 'rad', 'blh', 'psfc', 't2m_pasja', 't2m_krvavec'];
const MET_TARGET = ['t2m', 'rh', 'precip', 'wind', 'gust', 'cloud', 'rad', 'blh', 'psfc'];
/** pandas Series.rolling(w, min_periods).fn() over a whole array, ported from pandas'
    _libs/window/aggregations.pyx (roll_sum / roll_mean): a sliding Kahan sum that is only reset
    at the start of the array. Bit-for-bit the same as pandas, which matters because a tree split
    can sit exactly on a value like 96.1 / 21. NaNs are skipped; fewer than `minp` values gives NaN. */
function rolling(a, w, fn, minp) {
    const n = a.length, out = new Float64Array(n);
    if (fn === 'max' || fn === 'min') {
        for (let i = 0; i < n; i++) {
            let c = 0, best = fn === 'max' ? -Infinity : Infinity;
            for (let k = Math.max(0, i - w + 1); k <= i; k++) {
                const v = a[k];
                if (Number.isNaN(v))
                    continue;
                c++;
                if (fn === 'max' ? v > best : v < best)
                    best = v;
            }
            out[i] = c >= minp ? best : NaN;
        }
        return out;
    }
    let nobs = 0, neg = 0, sum = 0, compAdd = 0, compRem = 0, same = 0, prev = a[0];
    const add = (v) => {
        if (Number.isNaN(v))
            return;
        nobs++;
        const y = v - compAdd, t = sum + y;
        compAdd = t - sum - y;
        sum = t;
        if (v < 0 || Object.is(v, -0))
            neg++;
        if (v === prev)
            same++;
        else
            same = 1;
        prev = v;
    };
    const remove = (v) => {
        if (Number.isNaN(v))
            return;
        nobs--;
        const y = -v - compRem, t = sum + y;
        compRem = t - sum - y;
        sum = t;
        if (v < 0 || Object.is(v, -0))
            neg--;
    };
    for (let i = 0; i < n; i++) {
        const s = Math.max(0, i - w + 1);
        if (i > 0) {
            const ps = Math.max(0, i - w);
            if (ps < s)
                remove(a[ps]);
        } // start moved past ps
        add(a[i]);
        if (fn === 'sum') {
            out[i] = nobs === 0 && minp === 0 ? 0 : nobs >= minp ? (same >= nobs ? prev * nobs : sum) : NaN;
        }
        else {
            if (nobs >= minp && nobs > 0) {
                let r = sum / nobs;
                if (same >= nobs)
                    r = prev;
                else if (neg === 0 && r < 0)
                    r = 0;
                else if (neg === nobs && r > 0)
                    r = 0;
                out[i] = r;
            }
            else
                out[i] = NaN;
        }
    }
    return out;
}
/** memoised rolling arrays */
function roller() {
    const cache = new Map();
    return (a, w, fn, minp = 1) => {
        let m = cache.get(a);
        if (!m)
            cache.set(a, (m = new Map()));
        const key = w + fn + minp;
        let r = m.get(key);
        if (!r)
            m.set(key, (r = rolling(a, w, fn, minp)));
        return r;
    };
}
const take = (a, i) => (i >= 0 && i < a.length ? a[i] : NaN);
const other = (p) => (p === 'pm25' ? 'pm10' : 'pm25');
export function createFeatureBuilder(F) {
    const roll = roller();
    const winAt = (a, end, w, fn, minp = 1) => take(roll(a, w, fn, minp), end);
    const met = { ...F.met };
    const n = F.n;
    const mk = (fn) => Float64Array.from({ length: n }, (_, k) => fn(k));
    met.dT_pasja = mk(k => F.met.t2m_pasja[k] - F.met.t2m[k]); // > 0: warmer aloft = inversion
    met.dT_krvavec = mk(k => F.met.t2m_krvavec[k] - F.met.t2m[k]);
    met.wdir_sin = mk(k => Math.sin(F.met.wdir[k] * (Math.PI / 180)));
    met.wdir_cos = mk(k => Math.cos(F.met.wdir[k] * (Math.PI / 180)));
    /** CAMS bias: log ratio measured / CAMS over the trailing window, paired hours only */
    const paired = new Map();
    function logratio(s, p, i, w) {
        const key = s + p;
        if (!paired.has(key)) {
            const y = F.pm[s][p], c = F.cams[s][p];
            const both = (k) => !Number.isNaN(y[k]) && !Number.isNaN(c[k]);
            paired.set(key, [Float64Array.from(y, (v, k) => (both(k) ? v : NaN)), Float64Array.from(c, (v, k) => (both(k) ? v : NaN))]);
        }
        const [my, mc] = paired.get(key);
        const sy = winAt(my, i, w, 'sum', Math.floor(w / 4)), sc = winAt(mc, i, w, 'sum', Math.floor(w / 4));
        return Math.log((sy + 1) / (sc + 1));
    }
    function issue(s, p, i) {
        const y = F.pm[s][p], o = other(p), r = {};
        for (const L of [1, 2, 3, 6, 12, 24])
            r[`y_lag${L}`] = take(y, i - L);
        r.y_mean3 = winAt(y, i, 3, 'mean');
        r.y_mean24 = winAt(y, i, 24, 'mean', 12);
        r.y_max24 = winAt(y, i, 24, 'max', 12);
        r.y_min24 = winAt(y, i, 24, 'min', 12);
        r.y_mean168 = winAt(y, i, 168, 'mean', 72);
        r.cams_logratio168 = logratio(s, p, i, 168);
        r.cams_logratio720 = logratio(s, p, i, 720);
        r.y0 = take(y, i);
        r.o0 = take(F.pm[s][o], i);
        r.o_mean24 = winAt(F.pm[s][o], i, 24, 'mean', 12);
        r.ratio_25_10 = (take(F.pm[s].pm25, i) + 1) / (take(F.pm[s].pm10, i) + 1);
        r.c0 = take(F.cams[s][p], i);
        return r;
    }
    /** calendar of a UTC timestamp in local time (UTC+1): hour, Monday=0 weekday, day of year */
    function calendar(ms, prefix, r) {
        const d = new Date(ms + LOCAL * H);
        const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
        r[prefix + 'hour'] = d.getUTCHours();
        r[prefix + 'dow'] = (d.getUTCDay() + 6) % 7;
        r[prefix + 'doy_sin'] = Math.sin(2 * Math.PI * doy / 365.25);
        r[prefix + 'doy_cos'] = Math.cos(2 * Math.PI * doy / 365.25);
    }
    const timeAt = (pos) => F.t0 + Math.min(Math.max(pos, 0), n - 1) * H;
    const issueHour = (i) => (new Date(timeAt(i)).getUTCHours() + LOCAL) % 24;
    /** one row of hourly_rows(): issue position i, horizon h hours */
    function hourly(s, p, i, h) {
        const j = i + h;
        const r = issue(s, p, i);
        r.h = h;
        r.station = STATIONS.indexOf(s);
        calendar(timeAt(j), 't_', r);
        r.issue_hour = issueHour(i);
        for (const col of [...MET_TARGET, 'dT_pasja', 'dT_krvavec', 'wdir_sin', 'wdir_cos'])
            r['m_' + col] = take(met[col], j);
        for (const col of ['blh', 'wind', 't2m', 'dT_pasja'])
            r['m0_' + col] = take(met[col], i);
        r.m_t2m_change = r.m_t2m - r.m0_t2m;
        // weather over the window (t, t+h]
        const W = [['w_wind_mean', 'wind', 'mean'], ['w_precip_sum', 'precip', 'sum'], ['w_blh_min', 'blh', 'min'],
            ['w_blh_mean', 'blh', 'mean'], ['w_gust_max', 'gust', 'max'], ['w_dT_max', 'dT_pasja', 'max']];
        for (const [name, col, fn] of W)
            r[name] = winAt(met[col], j, h, fn);
        // CAMS at the target, its trend from now, and bias-corrected
        const c = F.cams[s][p];
        r.c_t = take(c, j);
        r.c_trend = Math.log1p(r.c_t) - Math.log1p(r.c0);
        r.c_t_corr7 = r.c_t * Math.exp(r.cams_logratio168);
        r.c_t_corr30 = r.c_t * Math.exp(r.cams_logratio720);
        // most recent observation at the same hour of day as the target
        r.y_samehour = take(F.pm[s][p], j - 24 * Math.ceil(h / 24));
        return r;
    }
    /** one row of daily_rows(): issue position i, lead k days (1 = tomorrow, local day).
        Returns the row and the local date of the target day (YYYY-MM-DD). */
    function daily(s, p, i, k) {
        const tIssue = timeAt(i);
        const targetDay = Math.floor((tIssue + LOCAL * H) / DAY) * DAY + k * DAY; // local midnight, as a naive date
        const start = Math.round((targetDay - LOCAL * H - F.t0) / H);
        const end = start + 23;
        const r = issue(s, p, i);
        r.k = k;
        r.station = STATIONS.indexOf(s);
        r.issue_hour = issueHour(i);
        r.hours_to_start = start - i;
        calendar(targetDay + (12 - LOCAL) * H, 'd_', r);
        const D = [['d_wind_mean', 'wind', 'mean'], ['d_wind_max', 'wind', 'max'], ['d_blh_mean', 'blh', 'mean'],
            ['d_blh_min', 'blh', 'min'], ['d_t2m_mean', 't2m', 'mean'], ['d_t2m_min', 't2m', 'min'], ['d_precip_sum', 'precip', 'sum'],
            ['d_rh_mean', 'rh', 'mean'], ['d_cloud_mean', 'cloud', 'mean'], ['d_rad_max', 'rad', 'max'], ['d_dT_mean', 'dT_pasja', 'mean'],
            ['d_dT_max', 'dT_pasja', 'max'], ['d_dTk_mean', 'dT_krvavec', 'mean'], ['d_gust_max', 'gust', 'max'], ['d_psfc_mean', 'psfc', 'mean']];
        for (const [name, col, fn] of D)
            r[name] = winAt(met[col], end, 24, fn);
        // evening and night between issue and the target day: does it ventilate first?
        const gap = Math.max(start - 1 - i, 1);
        const G = [['g_wind_mean', 'wind', 'mean'], ['g_blh_min', 'blh', 'min'], ['g_precip_sum', 'precip', 'sum']];
        for (const [name, col, fn] of G)
            r[name] = winAt(met[col], start - 1, gap, fn);
        const cd = winAt(F.cams[s][p], end, 24, 'mean', 18);
        r.c_day = cd;
        r.c_day_corr7 = cd * Math.exp(r.cams_logratio168);
        r.c_day_corr30 = cd * Math.exp(r.cams_logratio720);
        return { row: r, day: new Date(targetDay).toISOString().slice(0, 10) };
    }
    /** the last position <= upto with a measurement, or -1 */
    function lastObs(s, p, upto) {
        const y = F.pm[s][p];
        for (let k = Math.min(upto, y.length - 1); k >= 0; k--)
            if (!Number.isNaN(y[k]))
                return k;
        return -1;
    }
    return { hourly, daily, lastObs, timeAt };
}
