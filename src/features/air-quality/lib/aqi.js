/* PURE. Band maths. */
import { BANDS, BAND_COLORS, BAND_LABELS, PROFILES } from './config';
export function bandIndex(v, p = 'pm25') {
    const b = BANDS[p];
    for (let i = 0; i < b.length; i++)
        if (v <= b[i])
            return i;
    return b.length - 1;
}
export const colorFor = (v, p) => BAND_COLORS[bandIndex(v, p)];
export const labelFor = (v, p) => BAND_LABELS[bandIndex(v, p)];
/** the band for this person: one step stricter for sensitive groups */
export function effBand(band, profile) {
    const pr = PROFILES[profile] || PROFILES.everyone;
    return Math.min(5, band + pr.shift);
}
/** WCAG relative luminance of a #rrggbb colour */
export function luminance(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
