import { BAND_COLORS, BAND_INK, BAND_LABELS } from '../lib/config';
export function Segmented({ value, onChange, options, block, label }) {
    return (<div className={'seg' + (block ? ' seg--block' : '')} role="group" aria-label={label}>
      {options.map(o => (<button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>))}
    </div>);
}
const SRC = {
    meas: ['Measured', 'meas', 'ARSO reference station'],
    est: ['Sensor', 'est', 'Low-cost sensor calibrated against the nearest ARSO station'],
    local: ['Estimate', 'est', 'City measurement adjusted for local heating smoke (GRAL model)'],
    idw: ['Estimate', 'est', 'Blended from the nearest stations and sensors'],
    fc: ['Forecast', 'fc', 'Forecast: the team model when the live weather is available, otherwise the CAMS regional forecast'],
    model: ['Model', 'model', 'Computer model, not a measurement']
};
export function SrcTag({ src }) {
    const [t, cls, title] = SRC[src] || SRC.model;
    return <span className={'tag tag--' + cls} title={title}>{t}</span>;
}
export function BandChip({ band }) {
    return <span className="band" style={{ background: BAND_COLORS[band], color: BAND_INK[band] }}>{BAND_LABELS[band]}</span>;
}
export function Slider({ label, value, min, max, step, fmt, onChange }) {
    return (<label className="field" style={{ display: 'block' }}>
      <span className="field__head"><span>{label}</span><strong className="num">{fmt(value)}</strong></span>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}/>
    </label>);
}
export function NoMap({ children }) {
    return (<div className="nomap">
      <strong>The map could not load.</strong>
      <span>{children || 'It needs an internet connection for the base map. Everything else still works.'}</span>
    </div>);
}
