import { useEffect, useRef, useState } from 'react';
import { createBaseMap } from './baseMap';
/** Creates a base map in `ref` once; `ready` flips when its style (and our 3D layers) are in. */
export function useBaseMap(ref, opts) {
    const [base, setBase] = useState(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const optsRef = useRef(opts);
    useEffect(() => {
        if (!ref.current)
            return;
        let b;
        try {
            b = createBaseMap({ ...optsRef.current, container: ref.current, onFail: () => setFailed(true) });
        }
        catch (e) {
            console.warn(e);
            setFailed(true);
            return;
        }
        let alive = true;
        setBase(b);
        b.ready.then(() => { if (alive)
            setReady(true); });
        return () => { alive = false; setReady(false); setBase(null); b.destroy(); };
    }, [ref]);
    return { base, ready, failed };
}
