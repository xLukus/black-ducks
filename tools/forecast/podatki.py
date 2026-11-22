"""Load and align the historical inputs from the data package into hourly frames.

Everything is returned on a complete hourly UTC grid (tz-naive UTC timestamps), so the
feature code can work with plain positional shifts. The same frame layout is produced by
the live loader in napovej.py, so training and live prediction share one feature builder.

Frames:
  pm[station]   -> columns pm10, pm25                (MEASUREMENT, ARSO)
  met           -> weather at the basin floor + Pasja ravan / Krvavec temperature
                   (MODEL: ERA5 reanalysis in training, Open-Meteo forecast live)
  cams[station] -> cams_pm10, cams_pm25              (MODEL: CAMS Europe via Open-Meteo)
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent        # repo root
CACHE = Path(__file__).resolve().parent / "_cache"

STATIONS = {
    "E403": dict(name="LJ Bežigrad", lat=46.0655449, lon=14.5127203),
    "E405": dict(name="LJ Celovška", lat=46.0720916, lon=14.4871183),
    "E404": dict(name="LJ Vič", lat=46.037487, lon=14.4892717),
}
STATION_IDX = {s: i for i, s in enumerate(STATIONS)}
POLLUTANTS = ["pm25", "pm10"]
PASJA = dict(lat=46.0978, lon=14.2281)     # 1018 m, for a modelled inversion signal
KRVAVEC = dict(lat=46.297352, lon=14.533315)

MET_COLS = {  # Open-Meteo name -> our name
    "temperature_2m": "t2m", "relative_humidity_2m": "rh", "precipitation": "precip",
    "wind_speed_10m": "wind", "wind_direction_10m": "wdir", "wind_gusts_10m": "gust",
    "cloud_cover": "cloud", "shortwave_radiation": "rad", "boundary_layer_height": "blh",
    "surface_pressure": "psfc",
}


def _cached(name, fn):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f"{name}.pkl"
    if f.exists():
        return pd.read_pickle(f)
    df = fn()
    df.to_pickle(f)
    return df


def _naive(s):
    s = pd.to_datetime(s, utc=True)
    return s.dt.tz_convert(None)


def load_pm():
    """Hourly ARSO PM10/PM2.5 for the three Ljubljana stations (measurement)."""
    def build():
        cols = ["time_utc", "station_code", "pm10", "pm25"]
        a = pd.read_csv(ROOT / "01_meritve/arso_lj_pm_urno_2016_2026.csv.gz", usecols=cols)
        b = pd.read_csv(ROOT / "01_meritve/arso_lj_pm_urno_2026_11_dopolnitev.csv", usecols=cols)
        df = pd.concat([a, b], ignore_index=True)
        df["time_utc"] = _naive(df.time_utc)
        df = df[df.station_code.isin(STATIONS)]
        df = df.drop_duplicates(["station_code", "time_utc"], keep="first")
        df[["pm10", "pm25"]] = df[["pm10", "pm25"]].clip(lower=0)
        return df
    return _cached("pm", build)


def load_met():
    """Hourly ERA5 (Open-Meteo) at Bežigrad + temperature at Pasja ravan and Krvavec (model)."""
    def build():
        use = ["time_utc", "point_id"] + list(MET_COLS)
        frames = [pd.read_csv(ROOT / "03_vreme_inverzija" / f, usecols=use)
                  for f in ("era5_openmeteo_urno_2016_2020.csv.gz", "era5_openmeteo_urno_2021_2026.csv.gz")]
        df = pd.concat(frames, ignore_index=True)
        df["time_utc"] = _naive(df.time_utc)
        base = df[df.point_id == "E403"].set_index("time_utc")[list(MET_COLS)].rename(columns=MET_COLS)
        for pid, col in [("PASJA", "t2m_pasja"), ("KRVAVEC", "t2m_krvavec")]:
            base[col] = df[df.point_id == pid].set_index("time_utc").temperature_2m
        return base.sort_index()
    return _cached("met", build)


def load_cams():
    """Hourly CAMS Europe PM at each station's grid point (model)."""
    def build():
        df = pd.read_csv(ROOT / "02_modeli/cams_openmeteo_urno_2016_2026.csv.gz",
                         usecols=["time_utc", "point_id", "pm10", "pm2_5"])
        df["time_utc"] = _naive(df.time_utc)
        df = df[df.point_id.isin(STATIONS)]
        return df.rename(columns={"point_id": "station_code", "pm10": "cams_pm10", "pm2_5": "cams_pm25"})
    return _cached("cams", build)


def hourly_frames(start=None, end=None):
    """Return (grid, pm, met, cams) aligned on one complete hourly grid.

    pm and cams are dicts keyed by station code."""
    pm_long, met, cams_long = load_pm(), load_met(), load_cams()
    lo = start or min(pm_long.time_utc.min(), met.index.min())
    hi = end or max(pm_long.time_utc.max(), met.index.max())
    grid = pd.date_range(pd.Timestamp(lo).floor("h"), pd.Timestamp(hi).floor("h"), freq="h")
    pm = {s: g.set_index("time_utc")[["pm10", "pm25"]].reindex(grid) for s, g in pm_long.groupby("station_code")}
    cams = {s: g.set_index("time_utc")[["cams_pm10", "cams_pm25"]].reindex(grid) for s, g in cams_long.groupby("station_code")}
    return grid, pm, met.reindex(grid), cams
