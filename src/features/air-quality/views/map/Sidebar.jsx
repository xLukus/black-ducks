/* The left column of the map page. Everything in it follows the selection: the city average by
   default, or whatever was clicked or searched on the map. */
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, Footprints, Wind, CircleAlert, X, ChevronDown } from 'lucide-react';
import { air, cap, coordsOf, dayHours, estimateAt, nameOf, readingFor, stationById, timeAt, valueAt } from '../../lib/air';
import { BAND_COLORS, BAND_TEXT, GROUP_TEXT, NAMES, PROFILES, PROFILE_KEYS, UNIT } from '../../lib/config';
import { bandIndex } from '../../lib/aqi';
import { fmtDay, fmtHour, fmtWhen, hhmm, isNum, km, round } from '../../lib/format';
import { plan as makePlan, verdict } from '../../lib/planner';
import { DAILY_LIMIT, getForecastProvider, model, onForecastProvider } from '../../lib/forecast';
import { useStore } from '../../state/store';
import { BandChip, Segmented, SrcTag } from '../../components/ui';
import { HourBars, Sparkline } from '../../components/Charts';
import { PlaceSearch } from '../../components/PlaceSearch';
export function Sidebar({ elevation }) {
    const { ready, idx, pollutant: p, profile, selection, setSelection, setIdx, setPlaying, setProfile } = useStore();
    useStore(s => s.version);
    if (!ready) {
        return <aside className="sidebar"><div className="sb-section"><span className="spinner"/> <span className="small">Loading the latest measurements…</span></div></aside>;
    }
    const r = readingFor(selection, idx, p);
    const v = r ? verdict(r.v, profile, p) : null;
    const hours = dayHours(selection, idx, p);
    const plan = makePlan(hours, profile, p);
    const atLatest = idx === air.lastMeas;
    const goto = (i) => { setPlaying(false); setIdx(i); };
    return (<aside className="sidebar" aria-label="Air at the selected place">
      {/* ---------- where ---------- */}
      <section className="sb-section sb-where">
        <PlaceSearch />
        <div className="sb-place">
          <div>
            <h1 className="sb-place__name">{nameOf(selection)}</h1>
            <p className="xs">{placeSub(selection)}</p>
          </div>
          {selection && (<button className="btn btn--ghost btn--sm" onClick={() => setSelection(null)} aria-label="Back to the city average">
              <X /> City
            </button>)}
        </div>
      </section>

      {/* ---------- now ---------- */}
      <section className="sb-section">
        <div className="sb-row">
          <span className="small">{atLatest ? 'Latest hour · ' : ''}{fmtWhen(timeAt(idx))}</span>
          {r && <SrcTag src={r.src}/>}
        </div>
        {r ? (<div className="sb-now">
            <div className="sb-now__value">
              <span className="sb-now__num num" style={{ color: BAND_TEXT[bandIndex(r.v, p)] }}>{round(r.v)}</span>
              <span className="sb-now__unit">{UNIT}<br />{NAMES[p]}</span>
            </div>
            <BandChip band={bandIndex(r.v, p)}/>
          </div>) : <p className="small sb-now">No value for this hour.</p>}
        {!atLatest && (<button className="btn btn--sm sb-back" onClick={() => goto(air.lastMeas)}>Back to the latest hour</button>)}
      </section>

      {/* ---------- for whom ---------- */}
      <section className="sb-section">
        <span className="label">Advice for</span>
        <Segmented block label="Who is going out" value={profile} onChange={setProfile} options={PROFILE_KEYS.map(k => ({ value: k, label: PROFILES[k].label }))}/>
        {v && (<div className="verdict">
            <h2 className="verdict__title">{v.title}</h2>
            <p className="small">{v.advice}</p>
          </div>)}
        <WhyItMatters key={profile} profile={profile}/>
      </section>

      {/* ---------- today ---------- */}
      <section className="sb-section">
        <div className="sb-row">
          <h3 className="sb-h">{fmtDay(timeAt(idx))}, hour by hour</h3>
          {plan.forecast > 0 && <span className="tag tag--fc">incl. forecast</span>}
        </div>
        <HourBars hours={hours} p={p} plan={plan} nowIdx={idx} onPick={goto}/>
        <ul className="answers">
          <li>
            <Footprints />
            <div>
              <span className="answers__k">Go outside</span>
              {plan.best && plan.bestBand >= 4
            ? <><strong>No good window today</strong><span className="xs">Even the cleanest hours are poor. Keep it short and calm.</span></>
            : plan.best
                ? <><strong className="num">{hhmm(plan.best.from)}–{hhmm(plan.best.to)}</strong><span className="xs">Cleanest daytime hours, about {round(plan.best.mean)} {UNIT}.</span></>
                : <><strong>–</strong><span className="xs">Not enough data for this day yet.</span></>}
            </div>
          </li>
          <li>
            <Wind />
            <div>
              <span className="answers__k">Air the rooms</span>
              {plan.airing
            ? <><strong className="num">{hhmm(plan.airing.h)}</strong><span className="xs">5–10 minutes with two windows wide open.</span></>
            : <><strong>–</strong><span className="xs">No clean hour stands out.</span></>}
            </div>
          </li>
          {plan.avoid[0] && (<li className="answers__avoid">
              <CircleAlert />
              <div>
                <span className="answers__k">Avoid</span>
                <strong className="num">{hhmm(plan.avoid[0].from)}–{hhmm(plan.avoid[0].to)}</strong>
                <span className="xs">{plan.avoid[0].hot ? 'Evening heating smoke peaks here.' : `Up to ${round(plan.avoid[0].max)} ${UNIT}.`}</span>
              </div>
            </li>)}
        </ul>
      </section>

      {/* ---------- next hours ---------- */}
      <NextHours selection={selection} p={p}/>
      <NextDays selection={selection} p={p}/>

      {/* ---------- details ---------- */}
      <Details selection={selection} idx={idx} p={p} elevation={elevation}/>

      <section className="sb-section sb-foot">
        <button className="btn btn--sm" onClick={() => window.dispatchEvent(new Event('bl:open-alerts'))}><Bell /> Get alerts</button>
        <p className="xs">General guidance, not medical advice. Bands follow the EEA European Air Quality Index. Data: ARSO and partners — <Link to="/basin">why winter is worse</Link>.</p>
      </section>
    </aside>);
}
function placeSub(sel) {
    if (!sel)
        return 'Average of the three ARSO reference stations';
    if (sel.kind === 'station')
        return stationById(sel.id)?.kind === 'arso' ? 'ARSO reference station' : 'Citizen sensor, calibrated';
    if (sel.kind === 'place')
        return cap(air.places?.rows[sel.id]?.[2] || 'place');
    return `${sel.lat.toFixed(4)}° N, ${sel.lng.toFixed(4)}° E`;
}
function WhyItMatters({ profile }) {
    const [open, setOpen] = useState(false);
    return (<div className={'why' + (open ? ' is-open' : '')}>
      <button className="why__head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Why it matters for {PROFILES[profile].long.toLowerCase()}
        <ChevronDown />
      </button>
      {open && GROUP_TEXT[profile].map((t, k) => <p key={k} className="small">{t}</p>)}
    </div>);
}
function NextHours({ selection, p }) {
    const version = useStore(s => s.version);
    const [pts, setPts] = useState(undefined);
    const [prov, setProv] = useState(getForecastProvider());
    useEffect(() => onForecastProvider(() => setProv(getForecastProvider())), []);
    useEffect(() => {
        let alive = true;
        const ll = coordsOf(selection);
        prov.predict(ll ? { lng: ll[0], lat: ll[1] } : null, air.lastMeas, 6, p)
            .then(r => { if (alive)
            setPts(r); })
            .catch(() => { if (alive)
            setPts(null); });
        return () => { alive = false; };
    }, [selection, p, version, prov]);
    return (<section className="sb-section">
      <div className="sb-row">
        <h3 className="sb-h">Next 6 hours</h3>
        <span className="tag tag--fc">Forecast</span>
      </div>
      {pts === undefined ? <span className="spinner"/> : pts === null ? (<p className="xs">No forecast reachable right now. The live forecast needs an internet connection.</p>) : (<>
          <div className="next">
            {pts.map(pt => {
                const b = pt.v != null ? bandIndex(pt.v, p) : -1;
                return (<div key={pt.t} className="next__cell" title={pt.v != null ? `${round(pt.v)} ${UNIT}` + (pt.lo != null && pt.hi != null ? `, 80 % likely between ${round(pt.lo)} and ${round(pt.hi)}` : '') : 'no value'}>
                  <span className="xs num">{fmtHour(pt.t)}</span>
                  <span className="next__sw" style={{ background: b >= 0 ? BAND_COLORS[b] : 'var(--surface-3)' }}/>
                  <strong className="num">{pt.v != null ? Math.round(pt.v) : '–'}</strong>
                  {pt.lo != null && pt.hi != null && <span className="next__range num">{Math.round(pt.lo)}–{Math.round(pt.hi)}</span>}
                </div>);
            })}
          </div>
          <p className="xs">
            {pts.some(x => x.lo != null) ? 'Most likely value, with the range it falls in 8 times out of 10. ' : ''}
            {prov.name}{model.status === 'ok' ? ` · issued ${fmtHour(model.issued)}` : ''}.
          </p>
        </>)}
    </section>);
}
function NextDays({ selection, p }) {
    const [, force] = useState(0);
    useEffect(() => onForecastProvider(() => force(x => x + 1)), []);
    if (model.status !== 'ok' || !model.daily.length)
        return null;
    const rows = model.daily.filter(d => d.p === p);
    const days = [...new Set(rows.map(d => d.day))].sort();
    const sel = selection?.kind === 'station' ? selection.id : null;
    const fmtDayIso = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
    return (<section className="sb-section">
      <div className="sb-row">
        <h3 className="sb-h">Tomorrow and the day after</h3>
        <span className="tag tag--fc">Forecast</span>
      </div>
      <table className="days">
        <thead><tr><th>Daily mean</th>{days.map(d => <th key={d}>{fmtDayIso(d)}</th>)}</tr></thead>
        <tbody>
          {['E403', 'E405', 'E404'].map(s => (<tr key={s} className={sel === s ? 'is-sel' : ''}>
              <th>{stationById(s)?.short.replace('ARSO ', '') || s}</th>
              {days.map(d => {
                const f = rows.find(x => x.station === s && x.day === d);
                if (!f)
                    return <td key={d}>–</td>;
                const b = bandIndex(f.p50, p);
                return (<td key={d} title={`${round(f.p50)} ${UNIT}, 80 % likely ${round(f.p10)}–${round(f.p90)}. Chance the daily mean is above ${DAILY_LIMIT[p]}: ${Math.round(f.pOver * 100)} %`}>
                    <span className="dot" style={{ background: BAND_COLORS[b] }}/> <strong className="num">{Math.round(f.p50)}</strong>
                    <span className="days__risk num">{Math.round(f.pOver * 100)} %</span>
                  </td>);
            })}
            </tr>))}
        </tbody>
      </table>
      <p className="xs">Most likely daily mean in {UNIT}, and the chance it goes over the daily limit of {DAILY_LIMIT[p]} {UNIT}{p === 'pm25' ? ' (EU 2030)' : ''}. Local days, ARSO stations.</p>
    </section>);
}
function Details({ selection, idx, p, elevation }) {
    if (!selection) {
        const arso = air.stations.filter(s => s.kind === 'arso');
        return (<section className="sb-section">
        <h3 className="sb-h">About this number</h3>
        <p className="small">The city value is the mean of ARSO’s reference stations: {arso.map(s => s.short.replace('ARSO ', '')).join(', ')}. Click anywhere on the map — a street, a building, a school — to see the air there.</p>
      </section>);
    }
    if (selection.kind === 'station') {
        const st = stationById(selection.id);
        if (!st)
            return null;
        const i0 = Math.max(0, idx - 72), i1 = Math.min(air.n - 1, idx + 24);
        const vals = [];
        for (let i = i0; i <= i1; i++) {
            const r = valueAt(st, i, p);
            vals.push(r ? { v: r.v, fc: r.src === 'fc' } : null);
        }
        let sum = 0, n = 0, max = -1, maxI = 0;
        for (let i = Math.max(0, idx - 23); i <= idx; i++) {
            const x = st[p][i];
            if (isNum(x)) {
                sum += x;
                n++;
            }
        }
        st[p].forEach((x, i) => { if (isNum(x) && x > max) {
            max = x;
            maxI = i;
        } });
        return (<section className="sb-section">
        <h3 className="sb-h">Last 3 days</h3>
        <Sparkline values={vals} idx={idx - i0} p={p}/>
        <dl className="facts">
          <div><dt>24-hour mean</dt><dd className="num">{n ? round(sum / n) + ' ' + UNIT : '–'}</dd></div>
          <div><dt>Highest in the record</dt><dd className="num">{max >= 0 ? `${round(max)} ${UNIT}, ${fmtDay(timeAt(maxI))}` : '–'}</dd></div>
          <div><dt>Station type</dt><dd>{st.kind === 'arso' ? 'ARSO, ' + st.type : st.type}</dd></div>
        </dl>
        {st.kind !== 'arso' && (<p className="xs">Low-cost sensor, corrected against ARSO {st.calStation}{st.calR ? ` (r = ${st.calR})` : ''}. Good for comparing neighbourhoods, not a legal measurement.</p>)}
      </section>);
    }
    const ll = coordsOf(selection);
    const est = estimateAt(ll[0], ll[1], idx, p);
    const elev = elevation(ll[0], ll[1]);
    if (selection.kind === 'place') {
        const row = air.places.rows[selection.id];
        const jan = row[4], h25 = row[6];
        return (<section className="sb-section">
        <h3 className="sb-h">About this place</h3>
        {isNum(jan) && jan >= 1 ? (<p className="small">
            Smoke from home heating nearby adds about <strong>{round(jan)} {UNIT}</strong> of PM10 here on a typical January day
            {isNum(h25) && h25 > 0 ? <>, and on its own pushes PM10 above 25 {UNIT} for about <strong>{h25} hours</strong> a winter</> : null}.
            {' '}<SrcTag src="model"/>
          </p>) : <p className="small">Little home-heating smoke reaches this place in the model.</p>}
        <p className="xs" style={{ marginTop: 8 }}>The value above is the city measurement adjusted for this place’s own heating-smoke pattern (ARSO GRAL model, 2021 weather).</p>
        <dl className="facts">
          {est && <div><dt>Nearest station</dt><dd>{est.nearest.short} · {km(est.dist)}</dd></div>}
          {elev != null && <div><dt>Ground height</dt><dd className="num">{Math.round(elev)} m</dd></div>}
        </dl>
        <Link className="btn btn--sm" to="/heating" style={{ marginTop: 12 }}>What cleaner heating here would change</Link>
      </section>);
    }
    return (<section className="sb-section">
      <h3 className="sb-h">About this spot</h3>
      <p className="small">An estimate blended from the {est?.n ?? 0} nearest stations and sensors, weighted by distance.</p>
      <dl className="facts">
        {est && <div><dt>Nearest station</dt><dd>{est.nearest.short} · {km(est.dist)}</dd></div>}
        {selection.building && <div><dt>Building height</dt><dd className="num">{selection.building.h ? `about ${Math.round(selection.building.h)} m` : 'unknown'}</dd></div>}
        {elev != null && <div><dt>Ground height</dt><dd className="num">{Math.round(elev)} m above sea level</dd></div>}
      </dl>
      {est && est.dist > 2 && <p className="xs" style={{ marginTop: 8 }}>The nearest instrument is over 2 km away, so treat this as a rough guide.</p>}
    </section>);
}
