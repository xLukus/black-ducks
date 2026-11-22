/* The air-quality layers on the home map. Imperative on purpose: MapLibre owns its own state,
   so this module subscribes to the store and pushes changes into the map, never the other way
   round except for clicks (which set the selection).

   Layers
     stations   reference stations (large discs) and calibrated sensors (small discs)
     pool       3D haze filling the basin up to the mixing-layer height (ERA5 model)
     gral       where home-heating smoke settles at this hour of a typical winter day (GRAL model)
     camx       ARSO's regional model field, 4.4 km (CAMx model)
     places     kindergartens, schools, hospitals, care homes */
import maplibregl from 'maplibre-gl';
import { air, cityAt, coordsOf, idxOf, timeAt, valueAt } from '../lib/air';
import { BAND_COLORS, BAND_INK, BANDS } from '../lib/config';
import { bandIndex } from '../lib/aqi';
import { loadData } from '../lib/data';
import { isNum } from '../lib/format';
import { useStore } from '../state/store';
import { BUILDINGS_LAYER } from './baseMap';
const BASIN_FLOOR_M = 299; // Bežigrad station altitude
export function attachAirLayers(base, onLoading) {
    const map = base.map;
    const st = useStore.getState;
    let gral = null, gralHour = -1;
    let camx = null;
    let camxKey = '';
    const poolState = { top: -1, color: '', op: -1 };
    let marker = null;
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'hover-pop' });
    // ---------------------------------------------------------------- stations
    function stationFeatures() {
        const { idx, pollutant: p } = st();
        return {
            type: 'FeatureCollection',
            features: air.stations.filter(s => s.kind === 'arso' || s.reliable !== false).map(s => {
                const r = valueAt(s, idx, p);
                const b = r ? bandIndex(r.v, p) : -1;
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
                    properties: {
                        id: s.id, name: s.short, kind: s.kind, has: r ? 1 : 0,
                        color: r ? BAND_COLORS[b] : '#c4c8cf', ink: r ? BAND_INK[b] : '#374151',
                        label: r ? (r.src === 'fc' ? '~' : '') + Math.round(r.v) : '–'
                    }
                };
            })
        };
    }
    function addStations() {
        map.addSource('aq-points', { type: 'geojson', data: stationFeatures() });
        // a sensor without a value this hour is noise; a reference station without one is news
        const shown = ['any', ['==', ['get', 'has'], 1], ['==', ['get', 'kind'], 'arso']];
        map.addLayer({
            id: 'aq-dot', type: 'circle', source: 'aq-points', filter: shown,
            paint: {
                'circle-radius': ['match', ['get', 'kind'], 'arso', 15, 11],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': ['match', ['get', 'kind'], 'arso', 3, 2],
                'circle-opacity': ['case', ['==', ['get', 'has'], 1], 1, 0.6],
                'circle-pitch-alignment': 'viewport'
            }
        });
        map.addLayer({
            id: 'aq-value', type: 'symbol', source: 'aq-points', filter: shown,
            layout: {
                'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'],
                'text-size': ['match', ['get', 'kind'], 'arso', 12.5, 10.5],
                'text-allow-overlap': true, 'text-ignore-placement': true
            },
            paint: { 'text-color': ['get', 'ink'] }
        });
        map.addLayer({
            id: 'aq-name', type: 'symbol', source: 'aq-points', minzoom: 11.5, filter: shown,
            layout: {
                'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
                'text-size': ['match', ['get', 'kind'], 'arso', 12, 10.5],
                'text-offset': ['match', ['get', 'kind'], 'arso', ['literal', [0, 1.7]], ['literal', [0, 1.35]]],
                'text-anchor': 'top', 'text-optional': true
            },
            paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }
        });
    }
    // ---------------------------------------------------------------- places
    function addPlaces() {
        const pl = air.places;
        if (!pl)
            return;
        map.addSource('aq-places', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: pl.rows.map((r, i) => ({
                    type: 'Feature', geometry: { type: 'Point', coordinates: [r[0], r[1]] },
                    properties: { i, cat: r[2], name: r[3] || '' }
                }))
            }
        });
        map.addLayer({
            id: 'aq-places', type: 'circle', source: 'aq-places', minzoom: 11,
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 4.5, 17, 7],
                'circle-color': '#374151',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.5]
            }
        }, 'aq-dot');
        map.addLayer({
            id: 'aq-places-name', type: 'symbol', source: 'aq-places', minzoom: 15,
            layout: {
                'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
                'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true
            },
            paint: { 'text-color': '#374151', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 }
        }, 'aq-dot');
    }
    // ---------------------------------------------------------------- smog pool
    function addPool(pool) {
        const dx = pool.dlng, dy = pool.dlat;
        map.addSource('aq-pool', {
            type: 'geojson', tolerance: 0,
            data: {
                type: 'FeatureCollection',
                features: pool.tiles.map(t => ({
                    type: 'Feature', properties: { h: t[2] },
                    geometry: { type: 'Polygon', coordinates: [[[t[0], t[1]], [t[0] + dx, t[1]], [t[0] + dx, t[1] + dy], [t[0], t[1] + dy], [t[0], t[1]]]] }
                }))
            }
        });
        base.addBelowLabels({
            id: 'aq-pool', type: 'fill-extrusion', source: 'aq-pool', filter: ['<', ['get', 'h'], 0],
            paint: { 'fill-extrusion-color': '#9aa4b2', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': true }
        });
    }
    function updatePool() {
        if (!map.getLayer('aq-pool'))
            return;
        const { idx, pollutant: p, layers } = st();
        const blh = air.weather?.blh[idx];
        const b = cityAt(idx, p);
        if (!layers.pool || !isNum(blh) || !b) {
            if (poolState.op !== 0) {
                map.setPaintProperty('aq-pool', 'fill-extrusion-opacity', 0);
                poolState.op = 0;
            }
            return;
        }
        const top = Math.round((BASIN_FLOOR_M + Math.min(Math.max(blh, 30), 600)) / 5) * 5;
        if (top !== poolState.top) {
            map.setFilter('aq-pool', ['<', ['get', 'h'], top]);
            map.setPaintProperty('aq-pool', 'fill-extrusion-height', ['*', base.exaggeration(), ['-', top, ['get', 'h']]]);
            poolState.top = top;
        }
        const color = BAND_COLORS[bandIndex(b.v, p)];
        if (color !== poolState.color) {
            map.setPaintProperty('aq-pool', 'fill-extrusion-color', color);
            poolState.color = color;
        }
        // denser haze for dirtier air; it fades out at street level so it never hides the city
        const op = Math.round((0.08 + 0.2 * Math.min(b.v / BANDS[p][3], 1)) * 100) / 100;
        if (op !== poolState.op) {
            map.setPaintProperty('aq-pool', 'fill-extrusion-opacity', ['interpolate', ['linear'], ['zoom'], 12.8, op, 14.8, op * 0.15]);
            poolState.op = op;
        }
    }
    // ---------------------------------------------------------------- heating smoke (GRAL)
    function ensureGral() {
        if (map.getSource('aq-gral'))
            return Promise.resolve();
        onLoading('gral', true);
        return loadData('gral').then(g => {
            gral = g;
            if (map.getSource('aq-gral'))
                return;
            gralHour = new Date(timeAt(st().idx)).getUTCHours();
            map.addSource('aq-gral', { type: 'image', url: g.frames[gralHour], coordinates: g.corners });
            base.addBelowRoads({
                id: 'aq-gral', type: 'raster', source: 'aq-gral',
                paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0, 'raster-resampling': 'linear' }
            });
        }).catch(e => console.warn(e)).finally(() => onLoading('gral', false));
    }
    function updateGral() {
        const src = map.getSource('aq-gral');
        if (!src || !gral || !st().layers.gral)
            return;
        const h = new Date(timeAt(st().idx)).getUTCHours(); // GRAL hours are UTC
        if (h === gralHour)
            return;
        gralHour = h;
        src.updateImage({ url: gral.frames[h], coordinates: gral.corners });
    }
    // ---------------------------------------------------------------- regional model (CAMx)
    function ensureCamx() {
        if (camx)
            return Promise.resolve();
        onLoading('camx', true);
        return loadData('camx').then(c => {
            const dec = (b64) => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
            const canvas = document.createElement('canvas');
            canvas.width = c.w;
            canvas.height = c.h;
            camx = { meta: c, pm10: dec(c.pm10), pm25: dec(c.pm25), offset: idxOf(Date.parse(c.t0)), canvas };
            map.addSource('aq-camx', { type: 'image', url: camxUrl(), coordinates: c.corners });
            base.addBelowRoads({
                id: 'aq-camx', type: 'raster', source: 'aq-camx',
                paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0, 'raster-resampling': 'linear' }
            });
        }).catch(e => console.warn(e)).finally(() => onLoading('camx', false));
    }
    function camxUrl() {
        const c = camx, { w, h } = c.meta, p = st().pollutant;
        const j = st().idx - c.offset;
        const ctx = c.canvas.getContext('2d');
        const img = ctx.createImageData(w, h);
        if (j >= 0 && j < c.meta.n) {
            const arr = c[p], off = j * w * h;
            for (let k = 0; k < w * h; k++) {
                const v = arr[off + k];
                if (v === 255)
                    continue;
                const col = BAND_COLORS[bandIndex(v, p)];
                img.data[k * 4] = parseInt(col.slice(1, 3), 16);
                img.data[k * 4 + 1] = parseInt(col.slice(3, 5), 16);
                img.data[k * 4 + 2] = parseInt(col.slice(5, 7), 16);
                img.data[k * 4 + 3] = 190;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c.canvas.toDataURL();
    }
    function updateCamx() {
        if (!camx || !st().layers.camx)
            return;
        const key = st().pollutant + ':' + (st().idx - camx.offset);
        if (key === camxKey)
            return;
        camxKey = key;
        map.getSource('aq-camx').updateImage({ url: camxUrl(), coordinates: camx.meta.corners });
    }
    // ---------------------------------------------------------------- visibility
    const LAYER_IDS = {
        stations: ['aq-dot', 'aq-value', 'aq-name'], pool: [], gral: ['aq-gral'], camx: ['aq-camx'],
        places: ['aq-places', 'aq-places-name'], buildings: [BUILDINGS_LAYER]
    };
    function applyLayers() {
        const L = st().layers;
        Object.keys(LAYER_IDS).forEach(k => {
            LAYER_IDS[k].forEach(id => { if (map.getLayer(id))
                map.setLayoutProperty(id, 'visibility', L[k] ? 'visible' : 'none'); });
        });
        if (L.gral)
            ensureGral().then(() => { gralHour = -1; updateGral(); applyVis('gral'); });
        if (L.camx)
            ensureCamx().then(() => { camxKey = ''; updateCamx(); applyVis('camx'); });
        poolState.op = -1;
        updatePool();
    }
    function applyVis(k) {
        const on = st().layers[k];
        LAYER_IDS[k].forEach(id => { if (map.getLayer(id))
            map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); });
    }
    // ---------------------------------------------------------------- selection marker
    function updateMarker(sel) {
        const ll = coordsOf(sel);
        if (!ll) {
            marker?.remove();
            marker = null;
            return;
        }
        if (!marker) {
            const el = document.createElement('div');
            el.className = 'sel-marker';
            marker = new maplibregl.Marker({ element: el, anchor: 'center' });
        }
        marker.setLngLat(ll).addTo(map);
    }
    // ---------------------------------------------------------------- interaction
    function wireClicks() {
        const set = st().setSelection;
        map.on('click', e => {
            const own = ['aq-dot', 'aq-places'].filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
            const hits = own.length ? map.queryRenderedFeatures(e.point, { layers: own }) : [];
            const stHit = hits.find(f => f.layer.id === 'aq-dot');
            if (stHit) {
                set({ kind: 'station', id: String(stHit.properties.id) });
                return;
            }
            const plHit = hits.find(f => f.layer.id === 'aq-places');
            if (plHit) {
                set({ kind: 'place', id: Number(plHit.properties.i) });
                return;
            }
            // anywhere else — a street, a park, a building — shows the air at that spot
            const b = map.getLayer(BUILDINGS_LAYER) ? map.queryRenderedFeatures(e.point, { layers: [BUILDINGS_LAYER] })[0] : null;
            set({ kind: 'spot', lng: e.lngLat.lng, lat: e.lngLat.lat, building: b ? { h: b.properties?.render_height ?? null } : null });
        });
        const enter = (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const f = e.features?.[0];
            if (!f)
                return;
            const p = f.properties;
            const text = f.layer.id === 'aq-dot'
                ? `${p.name} · ${p.has ? p.label + ' µg/m³' : 'no value'}`
                : `${p.name || cap(String(p.cat))}${p.name ? ' · ' + p.cat : ''}`;
            hover.setLngLat(f.geometry.coordinates).setText(text).addTo(map);
        };
        const leave = () => { map.getCanvas().style.cursor = ''; hover.remove(); };
        for (const id of ['aq-dot', 'aq-places']) {
            map.on('mousemove', id, enter);
            map.on('mouseleave', id, leave);
        }
    }
    // ---------------------------------------------------------------- render loop
    let raf = 0;
    function render() {
        if (raf)
            return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            map.getSource('aq-points')?.setData(stationFeatures());
            updatePool();
            updateGral();
            updateCamx();
        });
    }
    let unsub = () => { };
    base.ready.then(() => loadData('pool')).then(pool => {
        if (!map.getStyle())
            return;
        addPool(pool);
        addStations();
        addPlaces(); // goes under the station discs
        wireClicks();
        applyLayers();
        updateMarker(st().selection);
        render();
        unsub = useStore.subscribe((s, prev) => {
            if (s.idx !== prev.idx || s.pollutant !== prev.pollutant || s.version !== prev.version) {
                if (s.pollutant !== prev.pollutant) {
                    poolState.color = '';
                    camxKey = '';
                }
                render();
            }
            if (s.layers !== prev.layers)
                applyLayers();
            if (s.selection !== prev.selection) {
                updateMarker(s.selection);
                const ll = coordsOf(s.selection);
                if (ll && s.selection?.kind !== 'spot' && !map.getBounds().contains(ll)) {
                    map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 13.5), duration: 800 });
                }
            }
        });
    }).catch(e => console.warn('air layers:', e));
    return {
        flyTo(ll, zoom = 15) { map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), zoom), duration: 900, essential: true }); },
        destroy() { unsub(); hover.remove(); marker?.remove(); }
    };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
