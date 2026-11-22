/* Boots the shared air data once and keeps it fresh. Call from the app root. */
import { useEffect } from 'react';
import { air, bootAir, refreshLive } from '../lib/air';
import { REFRESH_MS } from '../lib/config';
import { runModel } from '../lib/forecast';
import { useStore } from './store';
export function useAirBoot() {
    useEffect(() => {
        let alive = true;
        const S = useStore.getState;
        bootAir().then(() => {
            if (!alive)
                return;
            S().setReady(air.lastMeas);
            const refresh = () => {
                const before = air.lastMeas;
                const atLatest = S().idx === before;
                refreshLive().then(() => runModel()).then(() => {
                    if (!alive)
                        return;
                    if (atLatest && !S().playing)
                        S().setIdx(air.lastMeas);
                    S().bump();
                });
            };
            refresh();
            const t = setInterval(refresh, REFRESH_MS);
            const vis = () => { if (!document.hidden)
                refresh(); };
            document.addEventListener('visibilitychange', vis);
            cleanup = () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
        }).catch(e => { console.error(e); S().setError('Could not load the bundled data.'); });
        let cleanup = () => { };
        return () => { alive = false; cleanup(); };
    }, []);
}
/** re-render on data / time / pollutant changes; returns the bits most views need */
export function useAirTick() {
    const ready = useStore(s => s.ready);
    const version = useStore(s => s.version);
    const idx = useStore(s => s.idx);
    const pollutant = useStore(s => s.pollutant);
    return { ready, version, idx, pollutant };
}
