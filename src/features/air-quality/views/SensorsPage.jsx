import { useEffect, useMemo, useRef, useState } from 'react';
import { air } from '../lib/air';
import { loadData } from '../lib/data';
import { round } from '../lib/format';
import { createSiting } from '../lib/siting';
import { firstProposedSites } from '../lib/planningPresentation';
import { useStore } from '../state/store';
import { useBaseMap } from '../map/useBaseMap';
import { addDots, addExisting, addPicks, points } from '../map/gridLayers';
import { NoMap, Segmented, Slider } from '../components/ui';
const TERMS = [
    { key: 'exposure', label: 'Exposure', desc: 'Children, older people and homes nearby', color: '#111827' },
    { key: 'conc', label: 'Pollution', desc: 'How much heating smoke the models put here', color: '#f59e0b' },
    { key: 'gap', label: 'Coverage gap', desc: 'Distance from the nearest instrument', color: '#60a5fa' },
    { key: 'unc', label: 'Uncertainty', desc: 'Where the two models disagree', color: '#a78bfa' }
];
export default function SensorsPage() {
    const ready = useStore(s => s.ready);
    const [S, setS] = useState(null);
    const [err, setErr] = useState('');
    const [n, setN] = useState(8);
    const [w, setW] = useState({ exposure: 40, conc: 25, gap: 20, unc: 15 });
    const [minB] = useState(5);
    const [hostsOnly, setHostsOnly] = useState(false);
    const [view, setView] = useState('score');
    useEffect(() => {
        loadData('siting').then(d => setS(createSiting(d))).catch(e => { console.error(e); setErr('Could not load the planning grid.'); });
    }, []);
    const existing = useMemo(() => ready
        ? air.stations.filter(s => s.kind === 'arso' || s.reliable).map(s => ({ lon: s.lng, lat: s.lat, name: s.short, kind: s.kind }))
        : [], [ready]);
    const result = useMemo(() => S ? S.solve({ n, weights: w, minBuildings: minB, hostsOnly, existing }) : null, [S, n, w, minB, hostsOnly, existing]);
    // ---- map
    const el = useRef(null);
    const { base, ready: mapReady, failed } = useBaseMap(el, { buildings: false, pitch: 0, bearing: 0, zoom: 11.4, scrollZoom: false });
    const layers = useRef(null);
    useEffect(() => {
        if (!base || !mapReady || layers.current)
            return;
        layers.current = { dots: addDots(base.map, 'grid'), ex: addExisting(base.map, 'existing'), picks: addPicks(base.map, 'picks') };
    }, [base, mapReady]);
    useEffect(() => {
        const L = layers.current;
        if (!L || !S || !result)
            return;
        const src = view === 'exposure' ? S.terms.EXPOSURE : view === 'conc' ? S.terms.CONC : view === 'unc' ? S.terms.UNC : result.scores;
        let max = 0;
        for (const v of src)
            max = Math.max(max, v);
        // most cells score in the middle; without a gamma the city is one flat wash
        L.dots.setData(points(S.cells, c => c[S.F.lon], c => c[S.F.lat], (_c, k) => (max ? Math.pow(src[k] / max, 1.7) : 0)));
        L.picks.set(result.picks);
        L.ex.set(existing);
    }, [S, result, view, existing, mapReady]);
    const sum = w.exposure + w.conc + w.gap + w.unc || 1;
    return (<main className="page">
      <header className="page-head">
        <p className="eyebrow">For the city</p>
        <h1>Where to put the next sensors</h1>
        <p>Three official stations measure a basin of 300,000 people — enough to know how the city is doing, not how your street is. This tool scores every 250 m of the city and proposes where the next instruments should go.</p>
      </header>

      <div className="tool tool--sensors">
        <div className="tool__map">
          <div ref={el} className="tool__canvas"/>
          {failed && <NoMap>The weights and the ranked list still work.</NoMap>}
          <div className="tool__legend map-card">
            <span><i className="lg-pick"/>Proposed</span>
            <span><i className="lg-arso"/>ARSO station</span>
            <span><i className="lg-sensor"/>Sensor</span>
          </div>
        </div>
        <aside className="tool__panel tool__panel--sensors card">
          <Slider label="New sensors" value={n} min={1} max={20} step={1} fmt={v => String(v)} onChange={setN} help="How many sensors to place on the map; the list shows the first five."/>
          <div className="tool__group">
            <span className="label">What the ranking rewards</span>
            <p className="field__help">Increase a weight to give that priority more influence. Percentages adjust together.</p>
            {TERMS.map(t => (<Slider key={t.key} label={t.label} help={t.desc} value={w[t.key]} min={0} max={100} step={5} fmt={v => Math.round((v / sum) * 100) + ' %'} onChange={v => setW(o => ({ ...o, [t.key]: v }))}/>))}
          </div>
          <div className="tool__group">
            <label className="switch">
              <input type="checkbox" checked={hostsOnly} onChange={e => setHostsOnly(e.target.checked)}/>
              Only where a kindergarten or school can host it
            </label>
          </div>
          <div className="tool__group sensor-map-colours">
            <span className="label">Colour the map by</span>
            <Segmented value={view} onChange={setView} options={[{ value: 'score', label: 'Score' }, { value: 'exposure', label: 'Exposure' }, { value: 'conc', label: 'Pollution' }, { value: 'unc', label: 'Uncertainty' }]}/>
          </div>
        </aside>
      </div>

      <section className="section">
        <h2>Proposed sites, in order</h2>
        <p className="lede">Each pick changes the next one: once a sensor covers an area, the exposure there no longer counts. The bar shows why a site was picked.</p>
        <div className="legend legend--terms">{TERMS.map(t => <span key={t.key}><i style={{ background: t.color }}/>{t.label} — {t.desc}</span>)}</div>
        {err && <p className="small">{err}</p>}
        {!S && !err && <span className="spinner"/>}
        {result && result.picks.length === 0 && <p className="small">No cell passes the filters. Turn off the kindergarten filter.</p>}
        {result && result.picks.length > 0 && (<ol className="picks">
            {firstProposedSites(result.picks).map((p, k) => {
                const parts = TERMS.map(t => p.parts[t.key] * w[t.key] / sum);
                const tot = parts.reduce((a, b) => a + b, 0) || 1;
                return (<li key={p.k} className="pick">
                  <span className="pick__n num">{k + 1}</span>
                  <div className="pick__body">
                    <div className="pick__head">
                      <strong>{p.host ? p.host.name || 'Unnamed ' + p.host.cat : `Grid cell ${S.cells[p.k][S.F.i]}, ${S.cells[p.k][S.F.j]}`}</strong>
                      <span className="xs">{p.host ? p.host.cat + ' · can host the sensor' : 'no kindergarten or school within 250 m'}</span>
                    </div>
                    <dl className="pick__stats">
                      <div><dt>Heating smoke, evenings</dt><dd className="num">{round(p.gral)} µg/m³</dd></div>
                      <div><dt>Homes</dt><dd className="num">{p.flats}</dd></div>
                      <div><dt>Sensitive sites</dt><dd className="num">{p.sites.length}</dd></div>
                      <div><dt>Nearest instrument</dt><dd className="num">{(p.nearest / 1000).toFixed(1)} km</dd></div>
                    </dl>
                    <div className="pick__why" aria-label="Why it was picked">
                      {parts.map((v, i) => <span key={i} style={{ flexGrow: Math.max(v, 0.0001), background: TERMS[i].color }} title={`${TERMS[i].label}: ${Math.round((v / tot) * 100)} %`}/>)}
                    </div>
                  </div>
                </li>);
            })}
          </ol>)}
      </section>

      <section className="section">
        <h2>Why more sensors</h2>
        <div className="planning-notes planning-notes--three">
          <div><h3>Streets differ</h3><p className="small">Two schools a kilometre apart can breathe completely different air on the same evening.</p></div>
          <div><h3>Schools are good hosts</h3><p className="small">Kindergartens and schools have power, Wi-Fi and a reason to care. Low-cost sensors calibrated against ARSO are good enough.</p></div>
          <div><h3>Catch local peaks</h3><p className="small">More neighbourhood measurements can reveal short pollution spikes that distant stations miss, helping the city target the places that need cleaner air most.</p></div>
        </div>
      </section>
    </main>);
}
