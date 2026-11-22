import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Factory } from 'lucide-react';
import { loadData } from '../lib/data';
import { eur } from '../lib/format';
import { circle } from '../lib/geo';
import { createHeating, EVENING_HOURS, SEASON_DAYS } from '../lib/heating';
import { useBaseMap } from '../map/useBaseMap';
import { addDots, points } from '../map/gridLayers';
import { NoMap, Slider } from '../components/ui';
const ACTIONS = [
    { key: 'stoves', title: 'Replace old stoves', desc: 'New appliances in pre-1980 homes off the heat network.', icon: Flame },
    { key: 'heat', title: 'Connect to district heating', desc: 'Hook up buildings within 50 m of the network.', icon: Factory }
];
const SHARE_LABEL = { stoves: 'Stoves replaced', heat: 'Buildings connected' };
const label = (s) => (s.name || 'Unnamed ' + s.cat) + ' · ' + s.cat;
export default function HeatingPage() {
    const [H, setH] = useState(null);
    const [site, setSite] = useState(null);
    const [radius, setRadius] = useState(300);
    const [action, setAction] = useState('stoves');
    const [share, setShare] = useState(50);
    const [q, setQ] = useState('');
    useEffect(() => {
        loadData('siting').then(d => {
            const h = createHeating(d);
            setH(h);
            setSite(h.sites.find(s => s.cat === 'kindergarten') || h.sites[0]);
        }).catch(e => console.error(e));
    }, []);
    const res = useMemo(() => H && site ? H.run({ site, radius, action, share: share / 100 }) : null, [H, site, radius, action, share]);
    const options = useMemo(() => {
        if (!H)
            return [];
        const n = q.trim().toLowerCase();
        return n ? H.sites.filter(s => label(s).toLowerCase().includes(n)).slice(0, 8) : [];
    }, [H, q]);
    function pick(s) { setSite(s); setQ(''); }
    // ---- map
    const el = useRef(null);
    const { base, ready, failed } = useBaseMap(el, { buildings: false, pitch: 0, bearing: 0, zoom: 13.6, scrollZoom: false });
    const dots = useRef(null);
    useEffect(() => {
        if (!base || !ready || dots.current)
            return;
        const m = base.map;
        dots.current = addDots(m, 'cells', {
            heatmap: false,
            ramp: [[0, 'rgba(148,163,184,.12)'], [0.03, 'rgba(29,78,216,.18)'], [0.4, 'rgba(29,78,216,.5)'], [1, 'rgba(29,78,216,.85)']]
        });
        m.addSource('ring', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'ring', type: 'line', source: 'ring', paint: { 'line-color': '#111827', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
        m.addSource('site', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'site', type: 'circle', source: 'site', paint: { 'circle-radius': 8, 'circle-color': '#111827', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    }, [base, ready]);
    useEffect(() => {
        if (!base || !ready || !dots.current || !H || !res || !site)
            return;
        dots.current.setData(points(res.hood, h => H.cells[h.k][H.F.lon], h => H.cells[h.k][H.F.lat], h => (h.d <= radius ? Math.max(H.removalFor(H.cells[h.k], action, share / 100), 0.04) : 0.01)));
        base.map.getSource('ring').setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(site.lon, site.lat, radius)] } });
        base.map.getSource('site').setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [site.lon, site.lat] } });
    }, [base, ready, H, res, site, radius, action, share]);
    useEffect(() => {
        if (base && ready && site)
            base.map.easeTo({ center: [site.lon, site.lat], zoom: 14, duration: 700 });
    }, [base, ready, site]);
    const kids = site && (site.cat === 'kindergarten' || site.cat === 'school');
    return (<main className="page">
      <header className="page-head">
        <p className="eyebrow">For the city</p>
        <h1>What cleaner heating would buy</h1>
        <p>Most winter smoke in Ljubljana comes from old wood stoves around the centre. Pick a kindergarten, school or care home, choose what the city changes around it, and see how much cleaner its air gets.</p>
      </header>

      <div className="actions" role="radiogroup" aria-label="What the city does">
        {ACTIONS.map(a => (<button key={a.key} type="button" role="radio" aria-checked={action === a.key} className={'action' + (action === a.key ? ' is-active' : '')} onClick={() => setAction(a.key)}>
            <a.icon />
            <span><strong>{a.title}</strong><span className="xs">{a.desc}</span></span>
          </button>))}
      </div>

      <div className="tool">
        <div className="tool__map">
          <div ref={el} className="tool__canvas"/>
          {failed && <NoMap>Choosing a site and an action still works.</NoMap>}
          <div className="tool__legend map-card">
            <span><i className="lg-pick"/>Site</span>
            <span><i className="lg-removed"/>Smoke removed</span>
          </div>
        </div>
        <aside className="tool__panel tool__panel--heating card">
          <span className="label">Site</span>
          <div className="search">
            <input className="input" type="search" placeholder="Search a kindergarten, school or care home" value={q} onChange={e => setQ(e.target.value)} aria-label="Search a site"/>
            {options.length > 0 && (<ul className="popover search__list" role="listbox">
                {options.map(s => <li key={s.key} role="option" aria-selected={false} onMouseDown={e => { e.preventDefault(); pick(s); }}><span>{s.name || 'Unnamed'}</span><span className="xs">{s.cat}</span></li>)}
              </ul>)}
          </div>
          {site && (<div className="site-card">
              <strong>{site.name || 'Unnamed ' + site.cat}</strong>
              <span className="xs">{site.cat} · {site.eve.toFixed(1)} µg/m³ of heating smoke on winter evenings{site.h25 ? ` · ${site.h25} hours a year above 25` : ''}</span>
            </div>)}
          <div className="chips">
            {['kindergarten', 'school', 'elderly home'].map(c => (<button key={c} className="btn btn--sm" onClick={() => { const s = H?.sites.find(x => x.cat === c); if (s)
            pick(s); }}>
                Suggested {c === 'elderly home' ? 'care home' : c}
              </button>))}
          </div>
          <div className="tool__group heating-sliders">
            {/* 250 m is the grid: a smaller radius can miss every cell centre */}
            <Slider label="Radius around the site" value={radius} min={250} max={1000} step={50} fmt={v => v + ' m'} onChange={setRadius}/>
            <Slider label={SHARE_LABEL[action]} value={share} min={0} max={100} step={5} fmt={v => v + ' %'} onChange={setShare}/>
          </div>
        </aside>
      </div>

      <section className="section">
        <h2>What it buys</h2>
        {!res ? <span className="spinner"/> : (<>
            <div className="stats">
              <div><strong className="num">−{res.drop.toFixed(res.drop < 1 ? 2 : 1)}</strong><span>µg/m³ less PM10 from heating on a winter evening, from {res.site.eve.toFixed(1)} today</span></div>
              <div><strong className="num">{res.hoursSaved ?? '–'}</strong><span>{res.hoursSaved != null ? `hours a year brought below 25 µg/m³, out of ${res.site.h25}` : 'no hourly curve for this site'}</span></div>
              <div><strong className="num">{res.targets.toLocaleString('en-GB')}</strong><span>{action === 'stoves' ? 'buildings to convert' : 'buildings to connect'}</span></div>
              <div><strong className="num">{eur(res.cost)}</strong><span>{`estimated at ${res.unitCost.toLocaleString('en-GB')} € per building, before subsidies`}</span></div>
            </div>
            <div className="planning-notes heating-notes">
            <p className="small">
              That is about <strong>{Math.round(res.personHours).toLocaleString('en-GB')}</strong> µg/m³ · {kids ? 'child' : 'person'}-hours less exposure per heating season,
              for {res.people} {kids ? 'children' : 'people'} over {EVENING_HOURS} evening hours on {SEASON_DAYS} days.
              It removes {(res.f * 100).toFixed(1)} % of the heating smoke reaching the site, from {res.cellsIn} grid cells inside the radius.
            </p>
            <p className="small">
              How it works: every 250 m cell’s heating emissions (ARSO inventory) are weighted by distance,{' '}
              <math className="heating-formula" aria-label="w equals one divided by one plus the square of d divided by 150 metres">
                <mi>w</mi><mo>=</mo><mfrac><mn>1</mn><mrow><mn>1</mn><mo>+</mo><msup><mrow><mo>(</mo><mfrac><mi>d</mi><mrow><mn>150</mn><mspace width="0.2em"/><mi mathvariant="normal">m</mi></mrow></mfrac><mo>)</mo></mrow><mn>2</mn></msup></mrow></mfrac>
              </math>.
              The share removed inside the radius is compared with everything within 1.5 km, and applied to the GRAL model’s evening value at the site.
            </p>
            </div>
          </>)}
      </section>
    </main>);
}
