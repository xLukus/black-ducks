/* PURE. What changing the heating around one sensitive site buys.
     w(d) = 1 / (1 + (d/150 m)^2)
     f    = SUM(inside radius) w*emission*removed / SUM(within 1.5 km) w*emission
     change at the site = GRAL evening contribution * f
   The denominator reaches further than the radius on purpose: removing every stove within
   300 m does not remove all of the smoke the site breathes. */
import { dist } from './geo';
export const KERNEL_M = 150;
export const REACH_M = 1500;
export const EVENING_HOURS = 5; // 17:00-22:00
export const SEASON_DAYS = 90;
export const STOVE_COST_EUR = 1000;
/** rough headcounts so the exposure figure has a number to stand on — an assumption, editable in the UI */
export const PEOPLE = { kindergarten: 90, school: 400, 'elderly home': 120, hospital: 300, 'health centre': 150 };
export function createHeating(data) {
    const F = {};
    data.fields.forEach((n, k) => { F[n] = k; });
    const cells = data.cells, M = data.meta;
    const sites = data.sites
        .filter(s => s.eve != null)
        .map((s, k) => ({ key: k, ...s }))
        .sort((a, b) => (b.h25 || 0) - (a.h25 || 0));
    function neighbourhood(site) {
        const out = [];
        for (let k = 0; k < cells.length; k++) {
            const c = cells[k];
            if (!c[F.em])
                continue;
            const d = dist(site.lon, site.lat, c[F.lon], c[F.lat]);
            if (d > REACH_M)
                continue;
            out.push({ k, d, w: 1 / (1 + Math.pow(d / KERNEL_M, 2)), em: c[F.em] });
        }
        return out;
    }
    /** share of one cell's heating emission the action removes */
    function removalFor(c, action, share) {
        const blds = c[F.blds] || 0;
        if (action === 'stoves') {
            // only pre-1980 buildings off the heat network are realistic targets, and a new
            // appliance still emits about a quarter as much
            const frac = blds ? (c[F.pre80_nodh] || 0) / blds : 0;
            return share * (1 - M.ef_new_vs_old) * frac;
        }
        if (action === 'heat') {
            const near = c[F.dh_share] || 0, off = 1 - near, w = 0.05 * near;
            return share * ((w / (w + off)) || 0);
        }
        return share; // a ban stops the lot, for an evening
    }
    function run(o) {
        const { site, radius, action, share } = o;
        const hood = neighbourhood(site);
        let den = 0, num = 0, targets = 0, flats = 0, inside = 0;
        hood.forEach(h => {
            den += h.w * h.em;
            if (h.d > radius)
                return;
            const c = cells[h.k];
            num += h.w * h.em * removalFor(c, action, share);
            inside++;
            flats += c[F.flats] || 0;
            targets += action === 'stoves' ? (c[F.pre80_nodh] || 0) * share
                : action === 'heat' ? Math.round((c[F.blds] || 0) * (c[F.dh_share] || 0) * share) : 0;
        });
        const f = den > 0 ? num / den : 0;
        const drop = site.eve * f;
        // hours above 25: the curve was measured on this cell's own hourly values and
        // rescaled to the site's published count
        let hoursSaved = null;
        if (site.h25 && site.h25curve) {
            const steps = data.h25_steps;
            const x = Math.min(f, steps[steps.length - 1]);
            let ratio = site.h25curve[site.h25curve.length - 1];
            for (let k = 1; k < steps.length; k++) {
                if (x <= steps[k]) {
                    const t = (x - steps[k - 1]) / ((steps[k] - steps[k - 1]) || 1);
                    ratio = site.h25curve[k - 1] + t * (site.h25curve[k] - site.h25curve[k - 1]);
                    break;
                }
            }
            hoursSaved = Math.round(site.h25 * (1 - ratio));
        }
        const unit = action === 'stoves' ? STOVE_COST_EUR : action === 'heat' ? M.cost_district_heating_eur : 0;
        const people = o.people != null ? o.people : PEOPLE[site.cat] || 100;
        return {
            site, f, drop, hoursSaved, targets: Math.round(targets), flats, cellsIn: inside,
            cost: Math.round(targets) * unit, unitCost: unit, people,
            personHours: drop * EVENING_HOURS * SEASON_DAYS * people, hood
        };
    }
    return { run, removalFor, neighbourhood, F, cells, sites, meta: M };
}
