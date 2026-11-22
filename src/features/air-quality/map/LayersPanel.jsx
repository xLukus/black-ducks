import { useEffect, useRef, useState } from 'react';
import { Layers, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store';
import { NAMES } from '../lib/config';
import { Segmented } from '../components/ui';
const ROWS = [
    { key: 'stations', name: 'Stations and sensors', desc: 'Big discs are ARSO reference stations, small ones calibrated sensors.', src: 'meas' },
    { key: 'pool', name: 'Smog layer', desc: 'How high the polluted air reaches over the basin this hour.', src: 'model' },
    { key: 'gral', name: 'Home-heating smoke', desc: 'Where smoke from wood and coal stoves settles on a typical winter day at this hour.', src: 'model' },
    { key: 'camx', name: 'Regional model', desc: 'ARSO’s 4.4 km forecast field for the wider region.', src: 'model' },
    { key: 'places', name: 'Schools and care homes', desc: 'Kindergartens, schools, hospitals and care homes.' },
    { key: 'buildings', name: '3D buildings', desc: 'Appear when you zoom into the city (OpenStreetMap).' }
];
export function LayersPanel({ loading, onReset, is3D, on3D }) {
    const [open, setOpen] = useState(false);
    const { layers, setLayer, pollutant, setPollutant } = useStore();
    const box = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const close = (e) => { if (box.current && !box.current.contains(e.target))
            setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (<div className="layers" ref={box}>
      <div className="layers__bar">
        <button className="btn map-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Layers /> Layers
        </button>
        <Segmented label="Pollutant" value={pollutant} onChange={setPollutant} options={[{ value: 'pm25', label: NAMES.pm25 }, { value: 'pm10', label: NAMES.pm10 }]}/>
        <Segmented label="View" value={is3D ? '3d' : '2d'} onChange={v => on3D(v === '3d')} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]}/>
        <button className="btn btn--icon map-btn" onClick={onReset} aria-label="Reset the view" title="Reset the view"><RotateCcw /></button>
      </div>
      {open && (<div className="popover layers__menu">
          {ROWS.map(r => (<label key={r.key} className="layers__row">
              <span className="switch"><input type="checkbox" checked={layers[r.key]} onChange={e => setLayer(r.key, e.target.checked)}/></span>
              <span className="layers__text">
                <span className="layers__name">
                  {r.name}
                  {loading[r.key] && <span className="spinner"/>}
                </span>
                <span className="xs">{r.desc}</span>
                {r.key === 'gral' && layers.gral && (<span className="ramp"><i />less smoke · more smoke</span>)}
              </span>
            </label>))}
        </div>)}
    </div>);
}
