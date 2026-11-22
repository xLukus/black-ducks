/* The base map shared by every page: a light, quiet OpenFreeMap style, optional terrain and
   3D buildings. Air layers and planning layers are added on top by their own modules. */
import maplibregl from 'maplibre-gl';
import { MAP } from '../lib/config';
const BUILDINGS = 'bl-buildings';
export function createBaseMap(o) {
    const map = new maplibregl.Map({
        container: o.container,
        style: MAP.style,
        center: o.center || MAP.center,
        zoom: o.zoom ?? MAP.zoom,
        pitch: o.pitch ?? MAP.pitch,
        bearing: o.bearing ?? MAP.bearing,
        maxBounds: MAP.maxBounds,
        minZoom: MAP.minZoom,
        maxZoom: MAP.maxZoom,
        maxPitch: MAP.maxPitch,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        fadeDuration: 100,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true }
    });
    if (o.scrollZoom === false)
        map.scrollZoom.disable();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');
    const layers = () => map.getStyle().layers || [];
    const firstSymbol = () => layers().find(l => l.type === 'symbol')?.id;
    const firstLine = () => layers().find(l => l.type === 'line')?.id || firstSymbol();
    let ex = 1;
    function quietStyle() {
        // tone the vendor style down a notch so the air colours carry the map
        for (const l of layers()) {
            try {
                if (l.type === 'symbol' && /poi|housenumber/i.test(l.id))
                    map.setLayoutProperty(l.id, 'visibility', 'none');
                if (l.type === 'fill-extrusion')
                    map.removeLayer(l.id);
            }
            catch { /* vendor layer without that property */ }
        }
    }
    function addTerrain() {
        const dem = {
            type: 'raster-dem', tiles: [MAP.dem], encoding: 'terrarium', tileSize: 256, maxzoom: 12,
            attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>'
        };
        // two sources on purpose: sharing one between terrain and hillshade causes artefacts
        map.addSource('bl-dem', dem);
        map.setTerrain({ source: 'bl-dem', exaggeration: MAP.exaggeration });
        ex = MAP.exaggeration;
        map.addSource('bl-dem-shade', { ...dem, maxzoom: 11 });
        map.addLayer({
            id: 'bl-hillshade', type: 'hillshade', source: 'bl-dem-shade',
            paint: {
                'hillshade-exaggeration': 0.35,
                'hillshade-shadow-color': '#8b929c',
                'hillshade-highlight-color': '#ffffff',
                'hillshade-accent-color': '#b9bec6'
            }
        }, firstLine());
    }
    function addBuildings() {
        const hit = layers().find(l => l['source-layer'] === 'building');
        const source = hit?.source || Object.keys(map.getStyle().sources).find(k => map.getStyle().sources[k].type === 'vector');
        if (!source)
            return;
        map.addLayer({
            id: BUILDINGS, type: 'fill-extrusion', source, 'source-layer': 'building', minzoom: MAP.buildingsMinZoom,
            paint: {
                'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#e2e4e8', 25, '#d3d6dc', 70, '#c2c7cf'],
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], MAP.buildingsMinZoom, 0, MAP.buildingsMinZoom + 0.4, 0.9]
            }
        }, firstSymbol());
        // With the camera tilted, MapLibre drops distant tiles to lower zoom levels — and
        // below z13 OpenMapTiles has no buildings, so the skyline used to vanish a few streets
        // away. Fewer zoom levels on screen keep high-zoom tiles (and buildings) toward the horizon.
        try {
            map.setSourceTileLodParams(1.6, 8, source);
        }
        catch { /* older MapLibre */ }
    }
    function addSky() {
        // a pale horizon so the tilted view reads as landscape, not as a map edge
        try {
            map.setSky({
                'sky-color': '#dfe9f3', 'horizon-color': '#f4f6f8', 'fog-color': '#f1f3f5',
                'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.25
            });
        }
        catch { /* older MapLibre */ }
    }
    let resolve;
    const ready = new Promise(r => { resolve = r; });
    let started = false;
    function start() {
        if (started)
            return;
        started = true;
        try {
            quietStyle();
            if (o.terrain !== false) {
                addTerrain();
                addSky();
            }
            if (o.buildings !== false)
                addBuildings();
        }
        catch (e) {
            console.warn('3D layers failed:', e);
        }
        resolve(map);
    }
    map.on('style.load', start);
    map.on('error', e => {
        console.warn('Map error:', e?.error?.message || e);
        if (!started && !map.isStyleLoaded())
            o.onFail?.('The base map could not load.');
    });
    return {
        map, ready,
        addBelowLabels: l => map.addLayer(l, firstSymbol()),
        addBelowRoads: l => map.addLayer(l, firstLine()),
        elevation(lng, lat) {
            if (!map.getTerrain())
                return null;
            const e = map.queryTerrainElevation([lng, lat]);
            // the basin floor is ~280 m: anything far below means the terrain tile is not loaded yet
            return e == null || e / ex < 100 ? null : e / ex;
        },
        exaggeration: () => ex,
        setBuildings(on) { if (map.getLayer(BUILDINGS))
            map.setLayoutProperty(BUILDINGS, 'visibility', on ? 'visible' : 'none'); },
        resetView() {
            map.flyTo({ center: MAP.center, zoom: MAP.zoom, pitch: o.pitch ?? MAP.pitch, bearing: o.bearing ?? MAP.bearing, duration: 1200 });
        },
        set3D(on) {
            map.easeTo({ pitch: on ? Math.max(MAP.pitch, 45) : 0, bearing: on ? (map.getBearing() || MAP.bearing) : 0, duration: 800 });
        },
        destroy() { map.remove(); }
    };
}
export const BUILDINGS_LAYER = BUILDINGS;
