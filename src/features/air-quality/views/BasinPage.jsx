import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { air, cityAt, timeAt } from '../lib/air';
import { BAND_COLORS } from '../lib/config';
import { bandIndex } from '../lib/aqi';
import { loadData } from '../lib/data';
import { fmtWhen, hhmm, isNum } from '../lib/format';
import { useStore } from '../state/store';
const LAT = 46.05, FLOOR = 278, TOP = 1500, HILL_CAP = 900;
const W = 800, H = 300;
function profileOf(pool) {
    const band = pool.dlat * 1.2;
    const by = new Map();
    for (const [lng, lat, h] of pool.tiles) {
        if (Math.abs(lat + pool.dlat / 2 - LAT) > band)
            continue;
        const k = lng.toFixed(4), cur = by.get(k);
        if (!cur || h > cur.h)
            by.set(k, { lng: lng + pool.dlng / 2, h });
    }
    const out = [...by.values()].sort((a, b) => a.lng - b.lng);
    return out.length > 8 ? out : null;
}
/* A square-root height scale: the lid ranges from 15 m to 1,400 m in a single day, and on a
   linear axis an inversion at 30 m is an invisible sliver — exactly the case this must show.
   The axis is labelled in metres, so the compression is stated, not hidden. */
const yA = (a) => H - 18 - Math.sqrt(Math.max(a, 0) / (TOP - FLOOR)) * (H - 34);
const yM = (m) => yA(m - FLOOR);
function CrossSection({ pool }) {
    const ready = useStore(s => s.ready);
    useStore(s => s.version);
    const prof = profileOf(pool);
    if (!prof)
        return null;
    let lid = null, when = 0, stale = false;
    if (ready && air.weather) {
        for (let k = 0, i = Math.min(air.lastMeas + 24, air.n - 1); i >= 0; k++, i--) {
            const v = air.weather.blh[i];
            if (isNum(v)) {
                lid = v;
                when = timeAt(i);
                stale = i < air.lastMeas - 2;
                break;
            }
        }
    }
    const city = ready ? cityAt(air.lastMeas, 'pm25') : null;
    const tone = city ? BAND_COLORS[bandIndex(city.v, 'pm25')] : '#9ca3af';
    const x0 = prof[0].lng, x1 = prof[prof.length - 1].lng;
    const ground = 'M0 ' + H + ' ' + prof.map(p => `L${((p.lng - x0) / (x1 - x0)) * W} ${yM(Math.min(p.h, HILL_CAP)).toFixed(1)}`).join(' ') + ` L${W} ${H} Z`;
    const ly = lid != null ? yM(FLOOR + lid) : null;
    return (<figure className="xsec card">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cross-section of the Ljubljana basin from west to east, with the mixing-layer height drawn as a lid over the city">
        <defs>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone} stopOpacity="0.15"/>
            <stop offset="1" stopColor={tone} stopOpacity="0.55"/>
          </linearGradient>
        </defs>
        {ly != null && <rect x={0} y={ly} width={W} height={H - ly} fill="url(#haze)"/>}
        <path d={ground} fill="#d9dce1" stroke="#9ca3af" strokeWidth={1}/>
        {[50, 150, 400, 900].map(a => (<g key={a}>
            <line x1={W - 64} x2={W - 8} y1={yA(a)} y2={yA(a)} stroke="#e5e7eb"/>
            <text x={W - 60} y={yA(a) - 5} fontSize={11} fill="#5b6472">{a} m</text>
          </g>))}
        {ly != null && (<>
            <line x1={0} x2={W} y1={ly} y2={ly} stroke="#111827" strokeWidth={1.5} strokeDasharray="6 5"/>
            <text x={12} y={ly - 8} fontSize={13} fontWeight={600} fill="#111827">Lid: {Math.round(lid)} m above the ground</text>
            {ly > 48 && <text x={12} y={ly - 28} fontSize={12} fill="#5b6472">cleaner air above</text>}
          </>)}
        <text x={12} y={H - 6} fontSize={11} fill="#374151">West</text>
        <text x={W - 40} y={H - 6} fontSize={11} fill="#374151">East</text>
      </svg>
      <figcaption>
        {lid != null ? (<p className="small">
            <strong>{lid < 200 ? 'Everything burned in the city now stays in the city.' : 'The basin has room to breathe: smoke spreads through a deep layer of air.'}</strong>{' '}
            {fmtWhen(when)}{stale ? ' (the most recent hour with a value)' : ''}.
          </p>) : <p className="small">Reading the mixing-layer height…</p>}
        <p className="xs">Terrain: a real west–east cut through the city (Copernicus DEM). Lid: ERA5 mixing-layer height (model). Height axis is square-root so thin lids stay visible.</p>
      </figcaption>
    </figure>);
}
export default function BasinPage() {
    const [stats, setStats] = useState(null);
    const [pool, setPool] = useState(null);
    useEffect(() => {
        loadData('basin-stats').then(setStats).catch(e => console.info(e));
        loadData('pool').then(setPool).catch(e => console.info(e));
    }, []);
    const hmax = stats ? Math.max(...stats.hourly) : 1;
    const mmax = stats ? Math.max(...stats.monthly.map(m => m.v)) : 1;
    return (<main className="page">
      <header className="page-head">
        <p className="eyebrow">Why winter is worse</p>
        <h1>Ljubljana sits in a bowl with a lid</h1>
        <p>The city lies on the floor of a basin. On calm winter nights cold air pools at the bottom, warmer air settles on top like a lid, and smoke from chimneys has nowhere to go.</p>
      </header>

      {pool && <CrossSection pool={pool}/>}

      <section className="section">
        <h2>How an inversion forms</h2>
        <ol className="steps">
          <li><h3>Cold air sinks</h3><p className="small">On clear, calm nights the ground cools and the coldest air drains downhill into the basin floor, about 280–300 m above sea level.</p></li>
          <li><h3>Warm air sits on top</h3><p className="small">Normally air gets colder as you climb. Under an inversion it is the other way round, and nothing wants to rise.</p></li>
          <li><h3>Smoke is trapped</h3><p className="small">Chimney and traffic smoke is held in a layer often only a few hundred metres thick, until sun or wind breaks the lid.</p></li>
        </ol>
      </section>

      {stats && (<>
          <section className="section">
            <h2>How often, and how much worse</h2>
            <p className="lede">An inversion here means Ljubljana Bežigrad (299 m) is colder than Pasja ravan (1,019 m). Ten years of ARSO measurements, 2016–2026.</p>
            <div className="stats">
              <div><strong className="num">{stats.pm.pm10.inv} vs {stats.pm.pm10.no}</strong><span>µg/m³ of PM10 at Bežigrad with an inversion, against without one. The lid doubles it.</span></div>
              <div><strong className="num">{stats.winterShare} %</strong><span>of winter hours (Nov–Feb) have an inversion — about one in five</span></div>
              <div><strong className="num">{stats.exceedanceWithInversion.share} %</strong><span>of the {stats.exceedanceWithInversion.of} days above the daily PM10 limit had 12 h or more of inversion</span></div>
              <div><strong className="num">{stats.radiosonde.medianMixingM} m</strong><span>median depth of the air smoke mixes into on a winter morning</span></div>
              <div><strong className="num">{stats.daysPerYear[0]}–{stats.daysPerYear[1]}</strong><span>days a year with at least one inversion hour</span></div>
              <div><strong className="num">{stats.longestStreak.days} days</strong><span>the longest run in a row ({stats.longestStreak.when})</span></div>
              <div><strong className="num">{stats.strongest.dt} °C</strong><span>the strongest: valley colder than the hilltop ({stats.strongest.when})</span></div>
              <div><strong className="num">{stats.worstMonth.share} %</strong><span>of all hours in {stats.worstMonth.name}, the worst month</span></div>
            </div>
          </section>

          <section className="section basin-chart">
              <h2>By month</h2>
              <p className="lede">Share of hours with an inversion.</p>
              <div className="bars">
                {stats.monthly.map(m => (<div key={m.m} className="bars__col" title={`${m.m}: ${m.v} %`}>
                    <span className="bars__v num">{Math.round(m.v)}</span>
                    <span className="bars__bar" style={{ height: (m.v / mmax) * 100 + '%' }}/>
                    <span className="bars__l">{m.m.slice(0, 1)}</span>
                  </div>))}
              </div>
          </section>
          <section className="section basin-chart">
              <h2>By hour of a winter day</h2>
              <p className="lede">Most common at {stats.peakHours} in the morning, rarest at {stats.quietHours}. That is why the planner usually picks the early afternoon.</p>
              <div className="bars bars--dense">
                {stats.hourly.map((v, h) => (<div key={h} className="bars__col" title={`${hhmm(h)}: ${v} % of winter hours`}>
                    <span className={'bars__bar' + (h >= 12 && h <= 17 ? ' bars__bar--clean' : '')} style={{ height: (v / hmax) * 100 + '%' }}/>
                    <span className="bars__l">{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>
                  </div>))}
              </div>
          </section>
        </>)}

      <section className="section">
        <h2>What the city can do</h2>
        <div className="links2">
          <Link to="/sensors" className="linkcard card"><strong>Where we need more sensors →</strong><span className="small">Three stations for 300,000 people. Score every 250 m of the city and pick the next sites.</span></Link>
          <Link to="/heating" className="linkcard card"><strong>What cleaner heating would buy →</strong><span className="small">Pick a kindergarten and a radius, and see the µg/m³, the hours and the cost.</span></Link>
        </div>
      </section>
    </main>);
}
