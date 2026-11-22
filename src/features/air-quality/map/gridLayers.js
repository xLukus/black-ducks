/** YlOrRd: pale where it matters little, deep red where it matters most */
export const SCORE_RAMP = [
    [0, 'rgba(255,237,160,0)'], [0.2, 'rgba(254,217,118,.45)'], [0.45, 'rgba(253,141,60,.6)'],
    [0.7, 'rgba(227,26,28,.65)'], [1, 'rgba(128,0,38,.8)']
];
export function points(items, lon, lat, v) {
    return {
        type: 'FeatureCollection',
        features: items.map((c, k) => ({ type: 'Feature', properties: { v: v(c, k) }, geometry: { type: 'Point', coordinates: [lon(c), lat(c)] } }))
    };
}
export function addDots(map, id, opts = {}) {
    const ramp = opts.ramp || SCORE_RAMP;
    const color = ['interpolate', ['linear'], ['get', 'v']];
    ramp.forEach(r => color.push(r[0], r[1]));
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (opts.heatmap !== false) {
        map.addLayer({
            id: id + '-heat', type: 'heatmap', source: id, maxzoom: 13,
            paint: {
                'heatmap-weight': ['get', 'v'],
                'heatmap-intensity': 0.9,
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 10, 12.5, 26],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11.4, 0.8, 12.8, 0],
                'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(255,237,160,0)', 0.25, 'rgba(254,217,118,.5)', 0.5, 'rgba(253,141,60,.6)', 0.75, 'rgba(227,26,28,.65)', 1, 'rgba(128,0,38,.8)']
            }
        });
    }
    // radius grows with zoom so neighbouring dots nearly touch around z13
    map.addLayer({
        id: id + '-dots', type: 'circle', source: id,
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 12, 6, 13, 11, 15, 30, 17, 110],
            'circle-color': color,
            'circle-blur': 0.7,
            'circle-opacity': opts.heatmap === false ? 1 : ['interpolate', ['linear'], ['zoom'], 11.6, 0, 12.8, 1]
        }
    });
    return { setData: (d) => map.getSource(id).setData(d) };
}
/** numbered markers for proposed sites */
export function addPicks(map, id) {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: id + '-dot', type: 'circle', source: id,
        paint: { 'circle-radius': 12, 'circle-color': '#111827', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' }
    });
    map.addLayer({
        id: id + '-n', type: 'symbol', source: id,
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' }
    });
    return {
        set(picks) {
            map.getSource(id).setData({
                type: 'FeatureCollection',
                features: picks.map((p, k) => ({ type: 'Feature', properties: { n: String(k + 1) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))
            });
        }
    };
}
/** existing instruments: solid for ARSO, hollow ring for citizen sensors */
export function addExisting(map, id) {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: id + '-dot', type: 'circle', source: id,
        paint: {
            'circle-radius': ['case', ['==', ['get', 'kind'], 'arso'], 6, 5],
            'circle-color': ['case', ['==', ['get', 'kind'], 'arso'], '#1d4ed8', '#ffffff'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1d4ed8'
        }
    });
    return {
        set(list) {
            map.getSource(id).setData({
                type: 'FeatureCollection',
                features: list.map(s => ({ type: 'Feature', properties: { kind: s.kind }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }))
            });
        }
    };
}
