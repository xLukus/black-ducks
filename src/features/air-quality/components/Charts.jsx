/* Small SVG charts shared by the sidebar and the basin page. */
import { BAND_COLORS, BANDS } from '../lib/config';
import { bandIndex } from '../lib/aqi';
import { hhmm, round } from '../lib/format';
/** 24 bars for the day; height = value, colour = band. Click a bar to move the map to that hour. */
export function HourBars({ hours, p, plan, nowIdx, onPick }) {
    const max = Math.max(BANDS[p][2], ...hours.map(h => (h.r ? h.r.v : 0))) * 1.05;
    return (<div className="hourbars">
      <div className="hourbars__bars" role="list">
        {hours.map(x => {
            const best = !!(plan?.best && x.h >= plan.best.from && x.h < plan.best.to);
            const title = hhmm(x.h) + (x.r ? ` · ${round(x.r.v)} µg/m³${x.r.src === 'fc' ? ' (forecast)' : ''}` : ' · no data') + (x.hot ? ' · local smoke peak' : '');
            return (<button key={x.h} type="button" role="listitem" title={title} aria-label={title} className={'hourbars__col' + (x.i === nowIdx ? ' is-now' : '') + (best ? ' is-best' : '')} disabled={!onPick || !x.r} onClick={() => onPick?.(x.i)}>
              <span className="hourbars__bar" style={{
                    height: x.r ? Math.max(6, (x.r.v / max) * 100) + '%' : '6%',
                    background: x.r ? BAND_COLORS[bandIndex(x.r.v, p)] : 'var(--surface-3)',
                    opacity: x.r && x.r.src === 'fc' ? 0.55 : 1
                }}/>
            </button>);
        })}
      </div>
      <div className="hourbars__axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </div>);
}
/** a few days of one series around the current hour, with the "moderate" threshold */
export function Sparkline({ values, idx, p, width = 320, height = 72 }) {
    const thr = BANDS[p][2];
    const vs = values.filter(Boolean);
    const ymax = Math.max(thr * 1.25, ...vs.map(r => r.v)) * 1.08;
    const x = (k) => (k / Math.max(1, values.length - 1)) * width;
    const y = (v) => height - 4 - (v / ymax) * (height - 8);
    let d = '', dfc = '';
    values.forEach((r, k) => {
        if (!r)
            return;
        const prev = values[k - 1];
        const seg = (prev && prev.fc === r.fc ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(r.v).toFixed(1);
        if (r.fc)
            dfc += seg;
        else
            d += seg;
    });
    const cur = values[idx];
    return (<svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Values over the last days">
      <line x1={0} x2={width} y1={y(thr)} y2={y(thr)} stroke="#c9a400" strokeOpacity={0.6} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>
      <path d={d} fill="none" stroke="#111827" strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>
      {dfc && <path d={dfc} fill="none" stroke="#6b7280" strokeWidth={1.4} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>}
      <line x1={x(idx)} x2={x(idx)} y1={0} y2={height} stroke="#1d4ed8" strokeOpacity={0.5} vectorEffect="non-scaling-stroke"/>
      {cur && <circle cx={x(idx)} cy={y(cur.v)} r={3.5} fill={BAND_COLORS[bandIndex(cur.v, p)]} stroke="#111827" vectorEffect="non-scaling-stroke"/>}
    </svg>);
}
