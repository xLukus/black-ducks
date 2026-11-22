/* App state. Preferences persist in localStorage; everything else lives for the session. */
import { create } from 'zustand';
import { DEFAULT_ALERT_LEVEL } from '../lib/config';
const DEFAULT_PREFS = {
    profile: 'children', pollutant: 'pm25', alertLevel: DEFAULT_ALERT_LEVEL, notify: false,
    layers: { stations: true, pool: true, gral: false, camx: false, places: true, buildings: true }
};
function readPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem('bl:prefs2') || '{}');
        return { ...DEFAULT_PREFS, ...raw, layers: { ...DEFAULT_PREFS.layers, ...(raw.layers || {}) } };
    }
    catch {
        return DEFAULT_PREFS;
    }
}
export const useStore = create((set) => ({
    ...readPrefs(),
    ready: false, error: null, version: 0, idx: 0, playing: false, selection: null,
    setReady: idx => set({ ready: true, idx }),
    setError: error => set({ error }),
    bump: () => set(s => ({ version: s.version + 1 })),
    setIdx: idx => set({ idx }),
    setPlaying: playing => set({ playing }),
    setSelection: selection => set({ selection }),
    setProfile: profile => set({ profile }),
    setPollutant: pollutant => set({ pollutant }),
    setAlertLevel: alertLevel => set({ alertLevel }),
    setNotify: notify => set({ notify }),
    setLayer: (k, on) => set(s => ({ layers: { ...s.layers, [k]: on } }))
}));
useStore.subscribe(s => {
    const p = { profile: s.profile, pollutant: s.pollutant, alertLevel: s.alertLevel, notify: s.notify, layers: s.layers };
    try {
        localStorage.setItem('bl:prefs2', JSON.stringify(p));
    }
    catch { /* private mode */ }
});
