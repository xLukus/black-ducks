const MLAT = 111320;
const MLON = 111320 * Math.cos(46.05 * Math.PI / 180);
export const M_PER_DEG = { lat: MLAT, lon: MLON };
/** metres between two points, flat-earth approximation (fine inside one basin) */
export function dist(aLon, aLat, bLon, bLat) {
    const x = (aLon - bLon) * MLON, y = (aLat - bLat) * MLAT;
    return Math.sqrt(x * x + y * y);
}
/** a circle polygon of `r` metres around a point */
export function circle(lon, lat, r, steps = 72) {
    const pts = [];
    for (let a = 0; a <= steps; a++) {
        const t = (a / steps) * Math.PI * 2;
        pts.push([lon + (Math.cos(t) * r) / MLON, lat + (Math.sin(t) * r) / MLAT]);
    }
    return pts;
}
