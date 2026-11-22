"""Shared protocol: folds, test winters, cities, dataset builders, model loading.

Everything that training (treniraj.py), the benchmark (benchmark.py) and other team members must agree
on lives here, so results stay comparable.

BENCHMARK RULES (also for other models / team members)
  * Test set: the three ARSO Ljubljana stations (E403 Bežigrad, E405 Celovška, E404 Vič), winter months
    (Nov-Mar) of each fold's test winter.
  * For fold F the model may only be trained on data whose *target time* is <= F.ucenje_do.
  * At issue time t a model may use measurements up to and including hour t, and weather / CAMS for any
    hour (ERA5 reanalysis and the CAMS archive stand in for forecasts; same for everyone).
  * Hourly task: issue every 3 h (00, 03, ..., 21 UTC), predict every hour t+1 ... t+48.
  * Daily task: issue at 22 UTC (23 local), predict the mean of tomorrow (k=1) and the day after (k=2),
    local day = UTC+1, at least 18 hourly values.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from podatki import STATION_IDX, STATIONS, hourly_frames
from znacilke import MAX_H, MetCache, SeriesCache, daily_rows, hourly_rows

HERE = Path(__file__).resolve().parent
MOD = HERE / "modeli"
POLLUTANTS = ["pm25", "pm10"]
LABEL = {"pm25": "PM2.5", "pm10": "PM10"}
THRESHOLDS = {"pm25": [25], "pm10": [50, 45]}   # daily limits: PM2.5 25 (EU 2030), PM10 50 (now) / 45 (EU 2030)
WINTER = [11, 12, 1, 2, 3]

FOLDS = [
    dict(ime="2024-25", ucenje_do="2024-10-31", test_od="2024-11-01", test_do="2025-03-31"),
    dict(ime="2025-26", ucenje_do="2025-10-31", test_od="2025-11-01", test_do="2026-03-31"),
]
BENCH_HOURLY_EVERY = 3        # issue every 3 h in the benchmark
BENCH_DAILY_ISSUE_UTC = 22    # daily forecasts issued at 22 UTC
TRAIN_DAILY_ISSUE_UTC = (5, 11, 17, 22)
STATION_ID_BASE = {"graz": 10, "klagenfurt": 30}   # categorical ids for stations of other cities
DEFAULT_EXCLUDE = ("SPO.06.036",)                  # Graz AT60036: 120 m above the basin floor, different regime


@dataclass
class City:
    name: str
    grid: pd.DatetimeIndex
    mc: MetCache
    stations: dict = field(default_factory=dict)   # code -> (station_id, SeriesCache, label)

    @property
    def end(self):
        return self.grid[-1]


def city_ljubljana():
    grid, pm, met, cams = hourly_frames()
    data_end = met.dropna(subset=["t2m"]).index.max()
    keep = grid <= data_end
    grid = grid[keep]
    c = City("lj", grid, MetCache(met.loc[grid]))
    for s in STATIONS:
        c.stations[s] = (STATION_IDX[s], SeriesCache(pm[s].loc[grid], cams[s].loc[grid]), STATIONS[s]["name"])
    return c


def city_other(name, exclude=DEFAULT_EXCLUDE, download=True):
    """Another city from the cache written by test_drugo_mesto.py (downloads if missing)."""
    import test_drugo_mesto as T
    cfg = T.MESTA[name]
    cache = HERE / "_cache" / "mesta" / name
    need = [f for f in ("meritve.csv", "vreme.csv", "cams.csv") if not (cache / f).exists()]
    if need:
        if not download:
            raise FileNotFoundError(f"manjka {need} v {cache}; poženite: python test_drugo_mesto.py --mesto {name}")
        cache.mkdir(parents=True, exist_ok=True)
        if not (cache / "meritve.csv").exists():
            T.download_eea(cfg, cache / "meritve.csv")
        if not (cache / "vreme.csv").exists():
            T.download_met(cfg, cache / "vreme.csv")
        if not (cache / "cams.csv").exists():
            T.download_cams(cfg, cfg["stations"], cache / "cams.csv")
    stations = {k: v for k, v in cfg["stations"].items() if k not in exclude}
    grid, pm, met, cams = T.load_city(cache, stations)
    c = City(name, grid, MetCache(met))
    for n, code in enumerate(sorted(stations)):
        if code in pm and code in cams:
            c.stations[code] = (STATION_ID_BASE[name] + n, SeriesCache(pm[code], cams[code]), stations[code][0])
    return c


# ---------------------------------------------------------------- dataset builders
def _pos(grid, ts, side="left"):
    return int(np.searchsorted(grid, pd.Timestamp(ts), side=side))


def hourly_set(city, p, issue_from, issue_to, target_max=None, horizons=None, every=1, months=None,
               rng=None, n_random=3):
    """Hourly rows. horizons=None (training): h=1,2,3 always + n_random random horizons 4..48 per issue time.
    Returns X, y, meta (city, station, issue, target, h)."""
    grid = city.grid
    i_lo, i_hi = max(_pos(grid, issue_from), 168), min(_pos(grid, issue_to, "right"), len(grid) - 1)
    Xs, ys, ms = [], [], []
    for code, (sid, sc, _) in city.stations.items():
        y = sc.y[p]
        if np.isnan(y).all() or i_hi <= i_lo:
            continue
        i = np.arange(i_lo, i_hi)
        if every > 1:
            i = i[grid[i].hour % every == 0]
        if months:
            i = i[np.isin(grid[i].month, months)]
        i = i[~np.isnan(y[i])]
        if not len(i):
            continue
        if horizons is None:
            short = np.array([1, 2, 3])
            ii = np.concatenate([np.repeat(i, 3), np.repeat(i, n_random)])
            hh = np.concatenate([np.tile(short, len(i)), rng.integers(4, MAX_H + 1, len(i) * n_random)])
        else:
            hh_ = np.asarray(list(horizons))
            ii, hh = np.repeat(i, len(hh_)), np.tile(hh_, len(i))
        X, yt, j = hourly_rows(grid, sc, city.mc, sid, p, ii, hh)
        tgt = grid[np.clip(j, 0, len(grid) - 1)]
        ok = (j < len(grid)) & ~np.isnan(yt) & ~np.isnan(X["m_t2m"].to_numpy())
        if target_max is not None:
            ok &= np.asarray(tgt <= pd.Timestamp(target_max))
        Xs.append(X[ok]); ys.append(yt[ok])
        ms.append(pd.DataFrame({"city": city.name, "station": code, "issue": grid[ii[ok]], "target": tgt[ok], "h": hh[ok]}))
    if not Xs:
        return None, None, None
    return pd.concat(Xs, ignore_index=True), np.concatenate(ys), pd.concat(ms, ignore_index=True)


def daily_set(city, p, day_from, day_to, issue_hours=TRAIN_DAILY_ISSUE_UTC, ks=(1, 2)):
    """Daily rows for target local days in [day_from, day_to]. Returns X, y, meta (city, station, issue, day, k)."""
    grid = city.grid
    pos = np.where(np.isin(grid.hour, issue_hours))[0]
    pos = pos[pos >= 720]
    Xs, ys, ms = [], [], []
    for code, (sid, sc, _) in city.stations.items():
        y = sc.y[p]
        if np.isnan(y).all():
            continue
        i0 = pos[~np.isnan(y[pos])]
        for k in ks:
            X, yt, tday = daily_rows(grid, sc, city.mc, sid, p, i0, np.full(len(i0), k))
            ok = (~np.isnan(yt) & ~np.isnan(X["d_t2m_mean"].to_numpy()) & ~np.isnan(X["y_mean24"].to_numpy())
                  & np.asarray(tday >= pd.Timestamp(day_from)) & np.asarray(tday <= pd.Timestamp(day_to)))
            Xs.append(X[ok]); ys.append(yt[ok])
            ms.append(pd.DataFrame({"city": city.name, "station": code, "issue": grid[i0[ok]], "day": tday[ok], "k": k}))
    if not Xs:
        return None, None, None
    return pd.concat(Xs, ignore_index=True), np.concatenate(ys), pd.concat(ms, ignore_index=True)


# ---------------------------------------------------------------- saved models
def model_dir(run, part="final"):
    return MOD / run / part


def list_runs():
    return sorted(p.parent.name for p in MOD.glob("*/info.json"))


def load_models(run="lj", part="final"):
    """{pollutant: dict(hourly=..., daily=..., hourly_features=..., daily_features=...)}.
    Falls back to the old layout modeli/<pollutant>.joblib."""
    d = model_dir(run, part)
    if all((d / f"{p}.joblib").exists() for p in POLLUTANTS):
        return {p: joblib.load(d / f"{p}.joblib") for p in POLLUTANTS}
    if part == "final" and all((MOD / f"{p}.joblib").exists() for p in POLLUTANTS):
        return {p: joblib.load(MOD / f"{p}.joblib") for p in POLLUTANTS}
    raise FileNotFoundError(f"ni modelov v {d}; najprej: python treniraj.py --ime {run}")


def run_info(run):
    f = MOD / run / "info.json"
    return json.loads(f.read_text()) if f.exists() else {}
