"""Reference cases for the browser port of znacilke.py (src/lib/forecastFeatures.ts).

Run from a folder inside an ARSOhack checkout that holds the team's scripts and models
(podatki.py, znacilke.py, model.py, protokol.py, modeli/lj/final/*.joblib):

    python make_fixture.py <out.json> 2026-01-20T18:00 2025-12-10T05:00

For each replay moment it writes the input frames (PM, CAMS, weather) on the hourly grid around
it, plus the feature rows and P10/P50/P90 that napovej.py's predict() produces. The TypeScript
test rebuilds the features from the same frames and must match both.
"""
import json
import sys

import numpy as np
import pandas as pd

from napovej import replay_frames
from podatki import POLLUTANTS, STATIONS
from protokol import load_models
from znacilke import MAX_H, MetCache, SeriesCache, daily_rows, hourly_rows

BACK, AHEAD = 840, 96


def arr(a):
    return [None if not np.isfinite(v) else float(v) for v in np.asarray(a, float)]


def case(when, models, frames):
    grid, pm, met, cams, now, _truth = frames
    pm = {s: pm[s].copy() for s in pm}
    for s in pm:
        pm[s].loc[pm[s].index > now] = np.nan
    upto = int(np.searchsorted(grid, now, side="right")) - 1
    lo, hi = upto - BACK, upto + AHEAD
    g = grid[lo:hi]
    pmw = {s: pm[s].iloc[lo:hi] for s in STATIONS}
    camw = {s: cams[s].iloc[lo:hi] for s in STATIONS}
    metw = met.iloc[lo:hi]
    out = {
        "when": str(now), "t0": int(g[0].value // 10**6), "n": len(g),
        "pm": {s: {p: arr(pmw[s][p]) for p in POLLUTANTS} for s in STATIONS},
        "cams": {s: {p: arr(camw[s][f"cams_{p}"]) for p in POLLUTANTS} for s in STATIONS},
        "met": {c: arr(metw[c]) for c in metw.columns},
        "hourly": [], "daily": []
    }
    mc = MetCache(metw)
    for s in STATIONS:
        sc = SeriesCache(pmw[s], camw[s])
        for p in POLLUTANTS:
            y = sc.y[p]
            u = upto - lo
            obs = np.where(~np.isnan(y[: u + 1]))[0]
            if not len(obs):
                continue
            i = int(obs[-1])
            age = u - i
            M = models[p]
            h = np.arange(age + 1, age + MAX_H + 1)
            X, _, _ = hourly_rows(g, sc, mc, s, p, np.full(len(h), i), h)
            X = X[M["hourly_features"]]
            P = M["hourly"].predict(X)
            out["hourly"].append({"station": s, "p": p, "i": i, "h": h.tolist(),
                                  "X": [arr(r) for r in X.to_numpy(float)], "P": np.round(P, 6).tolist()})
            k = np.array([1, 2])
            Xd, _, days = daily_rows(g, sc, mc, s, p, np.full(2, i), k)
            Xd = Xd[M["daily_features"]]
            Pd = M["daily"].predict(Xd)
            out["daily"].append({"station": s, "p": p, "i": i, "k": k.tolist(), "days": [str(d.date()) for d in days],
                                 "X": [arr(r) for r in Xd.to_numpy(float)], "P": np.round(Pd, 6).tolist()})
    return out


def main():
    path, whens = sys.argv[1], sys.argv[2:]
    models = load_models("lj", "final")
    cases = [case(w, models, replay_frames(w)) for w in whens]
    feats = {"hourly": models["pm25"]["hourly_features"], "daily": models["pm25"]["daily_features"]}
    json.dump({"features": feats, "cases": cases}, open(path, "w"), separators=(",", ":"))
    print(path)


if __name__ == "__main__":
    main()
