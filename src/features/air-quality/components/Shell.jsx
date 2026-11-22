import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, X } from 'lucide-react';
import { useStore } from '../state/store';
import { air, timeAt } from '../lib/air';
import { assess } from '../lib/alerts';
import { ALERT_LEVELS, ALERT_REPEAT_MS, PROFILES, PROFILE_KEYS } from '../lib/config';
import { fmtWhen } from '../lib/format';
import { Segmented } from './ui';
import watchLogo from '@/assets/breathe-watch-logo.png.asset.json';
const NAV = [
    { to: '/', label: 'Map', end: true },
    { to: '/basin', label: 'Why winter is worse' },
    { to: '/sensors', label: 'Sensor plan' },
    { to: '/heating', label: 'Heating plan' }
];
export function TopBar({ contentBrand = false }) {
    return (<header className="topbar">
      <Link to="/" className="brand" aria-label="Breathe Ljubljana, home">
        {contentBrand ? <img className="content-brand-logo" src={watchLogo.url} alt="Breathe" width="1189" height="355" /> : <>
          <span className="brand__mark" aria-hidden="true"/>
          <span>Breathe Ljubljana</span>
        </>}
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map(n => (<Link key={n.to} to={n.to} activeOptions={{ exact: n.to === '/' }} className="nav__link" activeProps={{ className: 'is-active' }}>
            {n.label}
          </Link>))}
      </nav>
      <div className="topbar__right">
        <LiveStatus />
        <AlertsMenu />
      </div>
    </header>);
}
function LiveStatus() {
    const ready = useStore(s => s.ready);
    useStore(s => s.version);
    if (!ready)
        return <span className="status"><span className="spinner"/> Loading</span>;
    const live = air.live.arso;
    return (<span className="status" title={[
            live ? 'ARSO measurements: live' : 'ARSO measurements: bundled data (live feed not reachable)',
            'Citizen sensors: ' + (air.live.sensors ? 'live' : 'bundled'),
            'Weather and mixing height: ' + (air.live.meteo ? 'live' : 'bundled'),
            'CAMS forecast: ' + (air.live.cams ? 'live' : 'not reachable')
        ].join('\n')}>
      <span className={'status__dot' + (live ? ' is-live' : '')}/>
      <span className="status__text">{live ? 'Live' : 'Offline data'} · {fmtWhen(timeAt(air.lastMeas))}</span>
    </span>);
}
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;
function AlertsMenu() {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const box = useRef(null);
    const { profile, alertLevel, notify, setProfile, setAlertLevel, setNotify, ready, pollutant } = useStore();
    useStore(s => s.version);
    const msg = ready ? assess(profile, pollutant, alertLevel) : null;
    const on = notify && canNotify() && Notification.permission === 'granted';
    useEffect(() => {
        if (!open)
            return;
        const close = (e) => { if (box.current && !box.current.contains(e.target))
            setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);
    useEffect(() => {
        const fn = () => setOpen(true);
        window.addEventListener('bl:open-alerts', fn);
        return () => window.removeEventListener('bl:open-alerts', fn);
    }, []);
    // browser notification, at most once per band per few hours
    useEffect(() => {
        if (!on || !msg || !msg.title)
            return;
        try {
            const last = parseInt(localStorage.getItem('bl:alertAt') || '0', 10);
            const lastBand = parseInt(localStorage.getItem('bl:alertBand') || '-1', 10);
            if (msg.eff <= lastBand && Date.now() - last < ALERT_REPEAT_MS)
                return;
            new Notification(msg.title, { body: msg.body, tag: 'bl-air' });
            localStorage.setItem('bl:alertAt', String(Date.now()));
            localStorage.setItem('bl:alertBand', String(msg.eff));
        }
        catch { /* blocked or private mode */ }
    }, [on, msg?.title]);
    function enable() {
        if (on) {
            setNotify(false);
            setNote('Notifications are off.');
            return;
        }
        if (!canNotify()) {
            setNote('This browser does not support notifications.');
            return;
        }
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                setNotify(true);
                setNote('On. You get a message while this site is open in a tab.');
            }
            else
                setNote('Notifications are blocked for this site in your browser settings. The banner still works.');
        });
    }
    return (<div className="alerts" ref={box}>
      <button className="btn btn--ghost btn--icon alerts__btn" aria-label="Air quality alerts" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Bell />
        {msg && <span className="alerts__dot"/>}
      </button>
      {open && (<div className="popover alerts__menu" role="dialog" aria-label="Alerts">
          <h3>Warn me when the air turns bad</h3>
          <div className="field">
            <span className="label">For</span>
            <Segmented value={profile} onChange={setProfile} options={PROFILE_KEYS.map(k => ({ value: k, label: PROFILES[k].label }))}/>
          </div>
          <div className="field">
            <span className="label">From</span>
            <Segmented value={alertLevel} onChange={setAlertLevel} options={ALERT_LEVELS.map(l => ({ value: l.band, label: l.label }))}/>
          </div>
          <button className={'btn ' + (on ? '' : 'btn--primary')} style={{ marginTop: 16, width: '100%' }} onClick={enable}>
            {on ? 'Turn off notifications' : 'Turn on browser notifications'}
          </button>
          <p className="xs" style={{ marginTop: 10 }}>
            {note || 'Works while a tab of this site is open. There is no server, so nothing about you leaves this browser.'}
          </p>
        </div>)}
    </div>);
}
export function AlertBanner() {
    const { profile, alertLevel, ready, pollutant } = useStore();
    useStore(s => s.version);
    const [dismissed, setDismissed] = useState(() => { try {
        return sessionStorage.getItem('bl:dismissed') || '';
    }
    catch {
        return '';
    } });
    const msg = ready ? assess(profile, pollutant, alertLevel) : null;
    if (!msg || dismissed === msg.title)
        return null;
    return (<div className={'banner' + (msg.severe ? ' banner--severe' : '')} role="status">
      <div className="banner__text"><strong>{msg.title}.</strong> <span>{msg.body}</span></div>
      <button className="btn btn--ghost btn--icon btn--sm" aria-label="Dismiss" onClick={() => {
            try {
                sessionStorage.setItem('bl:dismissed', msg.title);
            }
            catch { /* private mode */ }
            setDismissed(msg.title);
        }}><X /></button>
    </div>);
}
export function Footer() {
    return (<footer className="footer">
      <div className="footer__in">
        <p><strong>Breathe Ljubljana</strong> · ADA Hack 2026.</p>
      </div>
    </footer>);
}
