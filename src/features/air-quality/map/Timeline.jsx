/* The time bar under the map: play/pause, the city curve you can scrub, and the band legend. */
import { useEffect, useRef } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import { air, cityAt, timeAt } from '../lib/air';
import { BAND_COLORS, BAND_LABELS, BANDS, NAMES, UNIT } from '../lib/config';
import { bandIndex } from '../lib/aqi';
import { fmtDay, fmtHour, fmtWhen, isNum, round } from '../lib/format';
import { cityBand } from '../lib/forecast';
import { useStore } from '../state/store';
const PLAY_MS = 160;
export function Timeline() {
    const canvas = useRef(null);
    const { idx, pollutant: p, version, ready, playing, setIdx, setPlaying } = useStore();
    // play loop
    useEffect(() => {
        if (!playing)
            return;
        const t = setInterval(() => {
            const i = useStore.getState().idx;
            setIdx(i >= air.n - 1 ? 0 : i + 1);
        }, PLAY_MS);
        return () => clearInterval(t);
    }, [playing, setIdx]);
    // keyboard: space plays, [ and ] step an hour
    useEffect(() => {
        const key = (e) => {
            const t = e.target;
            if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(t.tagName))
                return;
            const S = useStore.getState();
            if (e.code === 'Space') {
                e.preventDefault();
                S.setPlaying(!S.playing);
            }
            else if (e.key === '[' || e.key === ',') {
                S.setPlaying(false);
                S.setIdx(Math.max(0, S.idx - 1));
            }
            else if (e.key === ']' || e.key === '.') {
                S.setPlaying(false);
                S.setIdx(Math.min(air.n - 1, S.idx + 1));
            }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, []);
    // draw
    useEffect(() => {
        const c = canvas.current;
        if (!c || !ready)
            return;
        const draw = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = c.clientWidth, h = c.clientHeight;
            if (!w)
                return;
            c.width = w * dpr;
            c.height = h * dpr;
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const n = air.n, top = 6, strip = 4, bottom = h - 16 - strip;
            const x = (i) => (i / Math.max(1, n - 1)) * (w - 2) + 1;
            const series = Array.from({ length: n }, (_, i) => cityAt(i, p));
            const bands = Array.from({ length: n }, (_, i) => (i > air.lastMeas ? cityBand(i, p) : null));
            let ymax = BANDS[p][3] * 0.8;
            series.forEach(b => { if (b)
                ymax = Math.max(ymax, b.v * 1.1); });
            bands.forEach(b => { if (b)
                ymax = Math.max(ymax, b[1] * 1.05); });
            const y = (v) => bottom - (Math.min(v, ymax) / ymax) * (bottom - top);
            // band thresholds, faint
            ctx.setLineDash([2, 4]);
            ctx.lineWidth = 1;
            BANDS[p].slice(0, 4).forEach(t => {
                if (t > ymax)
                    return;
                ctx.strokeStyle = '#e5e7eb';
                ctx.beginPath();
                ctx.moveTo(0, y(t));
                ctx.lineTo(w, y(t));
                ctx.stroke();
            });
            ctx.setLineDash([]);
            // day ticks at local midnight
            ctx.font = '500 11px Inter Variable, system-ui, sans-serif';
            ctx.fillStyle = '#5b6472';
            ctx.strokeStyle = '#eef0f3';
            let lastX = -99;
            for (let i = 0; i < n; i++) {
                if (fmtHour(timeAt(i)) !== '00:00')
                    continue;
                const xx = x(i);
                ctx.beginPath();
                ctx.moveTo(xx, top);
                ctx.lineTo(xx, bottom + strip);
                ctx.stroke();
                if (xx - lastX > 46 && xx < w - 34) {
                    ctx.fillText(fmtDay(timeAt(i)), xx + 3, h - 3);
                    lastX = xx;
                }
            }
            // forecast range (P10-P90), behind the line
            ctx.fillStyle = 'rgba(107, 114, 128, .16)';
            ctx.beginPath();
            let open = false;
            const lows = [];
            const flush = () => {
                for (let k = lows.length - 1; k >= 0; k--)
                    ctx.lineTo(lows[k][0], lows[k][1]);
                ctx.closePath();
                lows.length = 0;
                open = false;
            };
            for (let i = 0; i < n; i++) {
                const b = bands[i];
                if (!b) {
                    if (open)
                        flush();
                    continue;
                }
                if (!open) {
                    ctx.moveTo(x(i), y(b[1]));
                    open = true;
                }
                else
                    ctx.lineTo(x(i), y(b[1]));
                lows.push([x(i), y(b[0])]);
            }
            if (open)
                flush();
            ctx.fill();
            // the city mean, area + line coloured by band; forecast dashed
            for (let i = 1; i < n; i++) {
                const a = series[i - 1], b = series[i];
                if (!a || !b)
                    continue;
                const col = BAND_COLORS[bandIndex(b.v, p)];
                ctx.fillStyle = col + '40';
                ctx.beginPath();
                ctx.moveTo(x(i - 1), bottom);
                ctx.lineTo(x(i - 1), y(a.v));
                ctx.lineTo(x(i), y(b.v));
                ctx.lineTo(x(i), bottom);
                ctx.fill();
                ctx.strokeStyle = b.src === 'fc' ? '#6b7280' : shade(col);
                ctx.lineWidth = 1.6;
                ctx.setLineDash(b.src === 'fc' ? [3, 3] : []);
                ctx.beginPath();
                ctx.moveTo(x(i - 1), y(a.v));
                ctx.lineTo(x(i), y(b.v));
                ctx.stroke();
            }
            ctx.setLineDash([]);
            // inversion strip: valley colder than Pasja ravan
            const W = air.weather;
            if (W)
                for (let i = 0; i < n; i++) {
                    const dt = W.dtPasja[i];
                    if (!isNum(dt) || dt >= 0)
                        continue;
                    ctx.fillStyle = `rgba(79, 70, 229, ${Math.min(0.25 + -dt / 10, 0.85)})`;
                    ctx.fillRect(x(i) - 0.5, bottom + 2, Math.max(1, w / n + 0.5), strip);
                }
            // forecast boundary
            if (air.lastMeas < n - 1) {
                const xx = x(air.lastMeas);
                ctx.strokeStyle = '#9ca3af';
                ctx.setLineDash([2, 3]);
                ctx.beginPath();
                ctx.moveTo(xx, top);
                ctx.lineTo(xx, bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#5b6472';
                ctx.fillText('forecast', xx + 4, top + 9);
            }
            // cursor
            const cx = x(idx);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, bottom + strip);
            ctx.stroke();
            const b = series[idx];
            if (b) {
                ctx.fillStyle = BAND_COLORS[bandIndex(b.v, p)];
                ctx.beginPath();
                ctx.arc(cx, y(b.v), 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#111827';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        };
        draw();
        const ro = new ResizeObserver(draw);
        ro.observe(c);
        return () => ro.disconnect();
    }, [idx, p, version, ready]);
    // scrubbing
    useEffect(() => {
        const c = canvas.current;
        if (!c)
            return;
        let drag = false;
        const toIdx = (e) => {
            const r = c.getBoundingClientRect();
            return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (air.n - 1));
        };
        const down = (e) => { drag = true; c.setPointerCapture(e.pointerId); setPlaying(false); setIdx(toIdx(e)); };
        const move = (e) => { if (drag)
            setIdx(toIdx(e)); };
        const up = () => { drag = false; };
        c.addEventListener('pointerdown', down);
        c.addEventListener('pointermove', move);
        c.addEventListener('pointerup', up);
        c.addEventListener('pointercancel', up);
        return () => {
            c.removeEventListener('pointerdown', down);
            c.removeEventListener('pointermove', move);
            c.removeEventListener('pointerup', up);
            c.removeEventListener('pointercancel', up);
        };
    }, [setIdx, setPlaying]);
    const city = ready ? cityAt(idx, p) : null;
    const blh = air.weather?.blh[idx];
    const dt = air.weather?.dtPasja[idx];
    const atLatest = idx === air.lastMeas;
    return (<div className="timeline map-card">
      <div className="timeline__top">
        <button className="btn btn--icon timeline__play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play the last weeks hour by hour'} title="Play / pause (space)">
          {playing ? <Pause /> : <Play />}
        </button>
        <div className="timeline__meta">
          <strong className="num">{ready ? fmtWhen(timeAt(idx)) : '–'}</strong>
          {city && (<span className="timeline__val">
              <span className="dot" style={{ background: BAND_COLORS[bandIndex(city.v, p)] }}/>
              City {NAMES[p]} <b className="num">{round(city.v)}</b> {UNIT}
              {city.src === 'fc' && <span className="tag tag--fc">Forecast</span>}
            </span>)}
          {isNum(blh) && <span className="timeline__extra" title="ERA5 mixing-layer height: how deep the air that smoke mixes into is">Mixing layer <b className="num">{Math.round(blh)} m</b></span>}
          {isNum(dt) && dt < 0 && <span className="timeline__extra timeline__inv" title="Bežigrad colder than Pasja ravan (1,019 m): warm air is sitting on top of the city">Inversion</span>}
        </div>
        {ready && !atLatest && (<button className="btn btn--sm" onClick={() => { setPlaying(false); setIdx(air.lastMeas); }}>
            <SkipForward /> Now
          </button>)}
      </div>
      <canvas ref={canvas} className="timeline__chart" aria-label="City average over time. Drag to change the hour."/>
      <div className="legend" aria-label="Air quality bands">
        {BAND_LABELS.map((l, k) => (<span key={l} title={`${l}: ${k ? BANDS[p][k - 1] : 0}${BANDS[p][k] === Infinity ? '+' : '–' + BANDS[p][k]} ${UNIT}`}>
            <i style={{ background: BAND_COLORS[k] }}/>{l}
          </span>))}
        <span className="legend__inv"><i />Inversion</span>
      </div>
    </div>);
}
/** a darker shade of a band colour for the line, so pale bands stay visible on white */
function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.72).toString(16).padStart(2, '0');
    return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}
