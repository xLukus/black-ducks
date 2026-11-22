import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { air, cap } from '../lib/air';
import { useStore } from '../state/store';
function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function PlaceSearch({ onPick }) {
    const ready = useStore(s => s.ready);
    const setSelection = useStore(s => s.setSelection);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const input = useRef(null);
    const all = useMemo(() => {
        if (!ready)
            return [];
        const out = air.stations
            .filter(s => s.kind === 'arso' || s.reliable !== false)
            .map(s => ({ label: s.short, sub: s.kind === 'arso' ? 'ARSO station' : 'Citizen sensor', sel: { kind: 'station', id: s.id }, key: s.id }));
        air.places?.rows.forEach((r, i) => {
            if (r[3])
                out.push({ label: r[3], sub: cap(r[2]), sel: { kind: 'place', id: i }, key: 'p' + i });
        });
        return out;
    }, [ready]);
    const results = useMemo(() => {
        const n = norm(q.trim());
        if (!n)
            return [];
        return all.filter(o => norm(o.label).includes(n) || norm(o.sub).startsWith(n)).slice(0, 8);
    }, [q, all]);
    function pick(o) {
        setSelection(o.sel);
        onPick?.(o.sel);
        setQ('');
        setOpen(false);
        input.current?.blur();
    }
    return (<div className="search" role="combobox" aria-expanded={open && results.length > 0} aria-haspopup="listbox">
      <Search className="search__icon" aria-hidden="true"/>
      <input ref={input} className="input search__input" type="search" placeholder="Search a school, kindergarten or station" aria-label="Search a place" value={q} disabled={!ready} onChange={e => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={e => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(a => Math.min(a + 1, results.length - 1));
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(a => Math.max(a - 1, 0));
            }
            else if (e.key === 'Enter' && results[active])
                pick(results[active]);
            else if (e.key === 'Escape')
                setOpen(false);
        }}/>
      {open && q.trim() && (<ul className="popover search__list" role="listbox">
          {results.length === 0 && <li className="search__empty">Nothing found. You can also click anywhere on the map.</li>}
          {results.map((o, k) => (<li key={o.key} role="option" aria-selected={k === active} className={k === active ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(k)}>
              <span>{o.label}</span><span className="xs">{o.sub}</span>
            </li>))}
        </ul>)}
    </div>);
}
