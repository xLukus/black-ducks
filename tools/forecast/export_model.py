"""Export the trained PM forecast models (models/*.joblib) to public/data/forecast-<kind>.js,
so the static site can run them in the browser without a Python server.

    python -I tools/forecast/export_model.py            # from the repository root

Each HistGradientBoostingRegressor is flattened into typed arrays (one entry per tree node):
    feat   uint8    feature index in the model's feature list; 255 = leaf
    thr    float64  split threshold (numerical) / leaf value (leaf)
    kid    uint8x2  left and right child, relative to the tree's first node
    flag   uint8    bit0 = missing values go left, bit1 = categorical split
plus one uint32 bitset per categorical split (the `station` codes that go left).

It also writes src/lib/forecast-fixture.json: random rows with the scikit-learn predictions,
which `npm test` uses to check that the browser engine gives the same numbers.

Loading a joblib file runs pickle; this script only allows the classes the models are made of.
"""
import base64, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))     # model.py (PMQuantileModel)

import joblib, joblib.numpy_pickle as npk  # noqa: E402

_ALLOW = ('sklearn.', 'numpy', 'joblib.', 'model')
_orig = npk.NumpyUnpickler.find_class


def _find_class(self, mod, name):
    ok = mod.startswith(_ALLOW) or (mod, name) in {('functools', 'partial'), ('builtins', 'slice')}
    if not ok:
        raise RuntimeError(f'refusing to load {mod}.{name}')
    return _orig(self, mod, name)


npk.NumpyUnpickler.find_class = _find_class

QUANTILES = (0.1, 0.5, 0.9)


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


def export_regressor(reg, features):
    """Flatten one HistGradientBoostingRegressor. Node feature indices refer to the
    preprocessed column order (categoricals first), so map them back to `features`."""
    pre = reg._preprocessor
    order = []
    for _name, _tr, cols in pre.transformers_:
        if isinstance(cols, str):
            continue
        order += [features[i] for i, on in enumerate(cols) if on]
    to_feat = [features.index(f) for f in order]
    cats = [list(map(float, c)) for c in pre.named_transformers_['encoder'].categories_]
    assert all(c == [float(i) for i in range(len(c))] for c in cats), 'station codes must be 0..n-1'

    feat, thr, kid, flag, starts, bitsets = [], [], [], [], [], []
    for (tree,) in reg._predictors:
        starts.append(len(feat))
        raw = tree.raw_left_cat_bitsets
        for n in tree.nodes:
            if n['is_leaf']:
                feat.append(255); thr.append(n['value']); kid += [0, 0]; flag.append(0)
                continue
            feat.append(to_feat[n['feature_idx']])
            kid += [n['left'], n['right']]
            assert n['left'] < 256 and n['right'] < 256
            if n['is_categorical']:
                thr.append(float(len(bitsets)))
                bitsets.append(int(raw[n['bitset_idx']][0]))     # 0..2 fit in the first word
                flag.append((1 if n['missing_go_to_left'] else 0) | 2)
            else:
                thr.append(n['num_threshold'])
                flag.append(1 if n['missing_go_to_left'] else 0)
    return {
        'baseline': float(np.ravel(reg._baseline_prediction)[0]),
        'starts': b64(np.array(starts, np.uint32)),
        'feat': b64(np.array(feat, np.uint8)),
        'thr': b64(np.array(thr, np.float64)),
        'kid': b64(np.array(kid, np.uint8)),
        'flag': b64(np.array(flag, np.uint8)),
        'bitsets': [int(b) for b in bitsets],
        'nStations': len(cats[0])
    }


def fixture_rows(reg, features, n, rng):
    """random but plausible inputs, drawn from the thresholds the trees actually use"""
    pre = reg._preprocessor
    order = []
    for _name, _tr, cols in pre.transformers_:
        if not isinstance(cols, str):
            order += [features[i] for i, on in enumerate(cols) if on]
    thr = {f: [] for f in features}
    for (tree,) in reg._predictors:
        for nd in tree.nodes:
            if not nd['is_leaf'] and not nd['is_categorical']:
                thr[order[nd['feature_idx']]].append(nd['num_threshold'])
    X = {}
    for f in features:
        if f == 'station':
            X[f] = rng.integers(0, 3, n).astype(float)
            continue
        t = np.array(thr[f]) if thr[f] else np.array([0.0, 1.0])
        lo, hi = np.percentile(t, 2), np.percentile(t, 98)
        X[f] = rng.uniform(lo - 0.1 * abs(lo), hi + 0.1 * abs(hi), n)
        X[f][rng.random(n) < 0.03] = np.nan                    # exercise the missing-value paths
    if 'y0' in X:
        X['y0'] = np.abs(np.nan_to_num(X['y0'], nan=10.0))      # the base value is never missing
    if 'y_mean24' in X:
        X['y_mean24'] = np.abs(np.nan_to_num(X['y_mean24'], nan=10.0))
    return X


def main():
    import pandas as pd
    info = json.load(open(os.path.join(ROOT, 'models', 'info.json')))
    rng = np.random.default_rng(0)
    fixture = {}
    for kind in ('hourly', 'daily'):
        out = {'info': info, 'kind': kind, 'quantiles': QUANTILES, 'pollutants': {}}
        for pol in ('pm10', 'pm25'):
            bundle = joblib.load(os.path.join(ROOT, 'models', pol + '.joblib'))
            m = bundle[kind]
            feats = list(bundle[kind + '_features'])
            out['features'] = feats
            out['trainedUntil'] = bundle['trained_until']
            out['pollutants'][pol] = {
                'baseCol': m.base_col, 'group': m.group,
                'Q': {str(k): float(v) for k, v in m.Q.items()},
                'models': {str(q): export_regressor(m.models[q], feats) for q in QUANTILES}
            }
            X = fixture_rows(m.models[0.5], feats, 60, rng)
            df = pd.DataFrame({f: X[f] for f in feats})
            df['station'] = df['station'].astype(int)
            P = m.predict(df)
            rows = [{f: (None if not np.isfinite(v) else float(v)) for f, v in zip(feats, r)} for r in df[feats].to_numpy(float)]
            fixture[f'{kind}:{pol}'] = {'rows': rows, 'pred': np.round(P, 9).tolist()}
        path = os.path.join(ROOT, 'public', 'data', f'forecast-{kind}.js')
        with open(path, 'w') as f:
            f.write(f'/* PM forecast model ({kind}), exported from models/*.joblib by tools/forecast/export_model.py. '
                    f'Trained until {out["trainedUntil"]}. */\n')
            f.write(f"(window.LjData=window.LjData||{{}})['forecast-{kind}']={json.dumps(out, separators=(',', ':'))};\n")
        print(path, round(os.path.getsize(path) / 1e6, 2), 'MB')
    fx = os.path.join(ROOT, 'src', 'lib', 'forecast-fixture.json')
    json.dump(fixture, open(fx, 'w'), separators=(',', ':'))
    print(fx, round(os.path.getsize(fx) / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
