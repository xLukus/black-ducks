import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { createBaseMap } from '../map/baseMap';
import { attachAirLayers } from '../map/airLayers';
import { LayersPanel } from '../map/LayersPanel';
import { Timeline } from '../map/Timeline';
import { Sidebar } from './map/Sidebar';
import { NoMap } from '../components/ui';
import { useStore } from '../state/store';
export default function MapPage() {
    const el = useRef(null);
    const base = useRef(null);
    const [failed, setFailed] = useState(false);
    const [is3D, setIs3D] = useState(true);
    const [loading, setLoading] = useState({});
    useEffect(() => {
        if (!el.current)
            return;
        let b;
        try {
            b = createBaseMap({ container: el.current, onFail: () => setFailed(true) });
        }
        catch (e) {
            console.warn(e);
            setFailed(true);
            return;
        }
        base.current = b;
        const layers = attachAirLayers(b, (k, on) => setLoading(l => ({ ...l, [k]: on })));
        // keep the 2D/3D switch honest when the user tilts with the mouse or two fingers
        b.map.on('pitchend', () => setIs3D(b.map.getPitch() > 5));
        const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showUserLocation: false });
        b.map.addControl(geo, 'top-right');
        geo.on('geolocate', (pos) => {
            useStore.getState().setSelection({ kind: 'spot', lng: pos.coords.longitude, lat: pos.coords.latitude, label: 'Your location' });
        });
        return () => { layers.destroy(); b.destroy(); base.current = null; };
    }, []);
    const elevation = useCallback((lng, lat) => base.current?.elevation(lng, lat) ?? null, []);
    return (<main className="mappage">
      <Sidebar elevation={elevation}/>
      <div className="mapcol">
        <div className="mapbox">
          <div ref={el} className="mapbox__map"/>
          {failed && <NoMap>The planner on the left still works without it.</NoMap>}
          <LayersPanel loading={loading} is3D={is3D} on3D={on => base.current?.set3D(on)} onReset={() => base.current?.resetView()}/>
          <p className="maphint">Click anywhere to see the air there</p>
        </div>
        <Timeline />
      </div>
    </main>);
}
