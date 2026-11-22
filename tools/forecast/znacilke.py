"""Feature builders shared by training (treniraj.py) and live prediction (napovej.py).

Leakage rule: at issue time t we may use measurements up to and including hour t, and
weather / CAMS *forecasts* for any hour (in training these are ERA5 reanalysis and the CAMS
archive, i.e. "perfect forecast"; live they are Open-Meteo forecasts).

Times: arrays are positions on a complete hourly UTC grid. Local time = UTC+1 (ARSO convention).
"""
import numpy as np
import pandas as pd

from podatki import POLLUTANTS, STATION_IDX

MAX_H = 48
LOCAL = 1  # hours, UTC+1 without DST (ARSO)
MET_TARGET = ["t2m", "rh", "precip", "wind", "gust", "cloud", "rad", "blh", "psfc"]


def _other(p):
    return "pm10" if p == "pm25" else "pm25"


def _roll(a, w, fn, minp=1):
    return getattr(pd.Series(a).rolling(w, min_periods=minp), fn)().to_numpy()


def _take(a, idx):
    """a[idx] with NaN where idx is out of range."""
    idx = np.asarray(idx)
    ok = (idx >= 0) & (idx < len(a))
    out = np.full(idx.shape, np.nan)
    out[ok] = a[idx[ok]]
    return out


class MetCache:
    """Pre-computed weather arrays + trailing-window aggregates for every window length 1..MAX_H+24."""

    def __init__(self, met: pd.DataFrame):
        self.m = {c: met[c].to_numpy(float) for c in met.columns}
        self.m["dT_pasja"] = self.m["t2m_pasja"] - self.m["t2m"]      # > 0 means warmer aloft = inversion
        self.m["dT_krvavec"] = self.m["t2m_krvavec"] - self.m["t2m"]
        wd = np.deg2rad(self.m["wdir"])
        self.m["wdir_sin"], self.m["wdir_cos"] = np.sin(wd), np.cos(wd)
        self._win = {}

    def win(self, col, w, fn):
        """Trailing window of length w ending at each position (inclusive)."""
        k = (col, w, fn)
        if k not in self._win:
            self._win[k] = _roll(self.m[col], w, fn)
        return self._win[k]


class SeriesCache:
    """Issue-time features of one station: measurement lags, rolling stats, CAMS bias."""

    def __init__(self, pm: pd.DataFrame, cams: pd.DataFrame):
        self.y = {p: pm[p].to_numpy(float) for p in POLLUTANTS}
        self.c = {p: cams[f"cams_{p}"].to_numpy(float) for p in POLLUTANTS}
        self.f = {}
        for p in POLLUTANTS:
            y, c = self.y[p], self.c[p]
            f = {}
            for L in (1, 2, 3, 6, 12, 24):
                f[f"y_lag{L}"] = np.r_[np.full(L, np.nan), y[:-L]]
            f["y_mean3"] = _roll(y, 3, "mean")
            f["y_mean24"] = _roll(y, 24, "mean", 12)
            f["y_max24"] = _roll(y, 24, "max", 12)
            f["y_min24"] = _roll(y, 24, "min", 12)
            f["y_mean168"] = _roll(y, 168, "mean", 72)
            # CAMS bias as log ratio measured / CAMS over trailing windows (paired hours only)
            both = ~np.isnan(y) & ~np.isnan(c)
            for w in (168, 720):
                sy = _roll(np.where(both, y, np.nan), w, "sum", w // 4)
                sc = _roll(np.where(both, c, np.nan), w, "sum", w // 4)
                f[f"cams_logratio{w}"] = np.log((sy + 1) / (sc + 1))
            self.f[p] = f

    def issue(self, p, i):
        f = self.f[p]
        o = _other(p)
        out = {k: _take(v, i) for k, v in f.items()}
        out["y0"] = _take(self.y[p], i)
        out["o0"] = _take(self.y[o], i)
        out["o_mean24"] = _take(self.f[o]["y_mean24"], i)
        out["ratio_25_10"] = (_take(self.y["pm25"], i) + 1) / (_take(self.y["pm10"], i) + 1)
        out["c0"] = _take(self.c[p], i)
        return out


def _calendar(ts: pd.DatetimeIndex, prefix):
    lt = ts + pd.Timedelta(hours=LOCAL)
    doy = lt.dayofyear.to_numpy()
    return {f"{prefix}hour": lt.hour.to_numpy(), f"{prefix}dow": lt.dayofweek.to_numpy(),
            f"{prefix}doy_sin": np.sin(2 * np.pi * doy / 365.25), f"{prefix}doy_cos": np.cos(2 * np.pi * doy / 365.25)}


def hourly_rows(grid, sc: SeriesCache, mc: MetCache, station, p, i, h):
    """Feature table for (issue position i, horizon h) pairs of one station/pollutant.
    Returns (X DataFrame, y_target array, target positions j)."""
    i, h = np.asarray(i), np.asarray(h)
    j = i + h
    X = sc.issue(p, i)
    X["h"] = h
    X["station"] = np.full(len(i), STATION_IDX[station] if isinstance(station, str) else int(station))
    X.update(_calendar(grid[np.clip(j, 0, len(grid) - 1)], "t_"))
    X["issue_hour"] = ((grid[np.clip(i, 0, len(grid) - 1)].hour + LOCAL) % 24).to_numpy()
    for col in MET_TARGET + ["dT_pasja", "dT_krvavec", "wdir_sin", "wdir_cos"]:
        X[f"m_{col}"] = _take(mc.m[col], j)
    for col in ("blh", "wind", "t2m", "dT_pasja"):
        X[f"m0_{col}"] = _take(mc.m[col], i)
    X["m_t2m_change"] = X["m_t2m"] - X["m0_t2m"]
    # weather over the window (t, t+h]
    for name, col, fn in [("w_wind_mean", "wind", "mean"), ("w_precip_sum", "precip", "sum"),
                          ("w_blh_min", "blh", "min"), ("w_blh_mean", "blh", "mean"),
                          ("w_gust_max", "gust", "max"), ("w_dT_max", "dT_pasja", "max")]:
        v = np.full(len(i), np.nan)
        for hh in np.unique(h):
            m = h == hh
            v[m] = _take(mc.win(col, int(hh), fn), j[m])
        X[name] = v
    # CAMS at target, its trend from now, and bias-corrected value
    c = sc.c[p]
    X["c_t"] = _take(c, j)
    X["c_trend"] = np.log1p(X["c_t"]) - np.log1p(X["c0"])
    X["c_t_corr7"] = X["c_t"] * np.exp(X["cams_logratio168"])
    X["c_t_corr30"] = X["c_t"] * np.exp(X["cams_logratio720"])
    # most recent observation at the same hour of day as the target
    back = 24 * np.ceil(h / 24).astype(int)
    X["y_samehour"] = _take(sc.y[p], j - back)
    return pd.DataFrame(X), _take(sc.y[p], j), j


def local_day_index(grid):
    """Local (UTC+1) calendar date for every grid position."""
    return (grid + pd.Timedelta(hours=LOCAL)).normalize()


def daily_rows(grid, sc: SeriesCache, mc: MetCache, station, p, i, k):
    """Features for issue position i and lead k days (k=1: tomorrow, local day).
    Target = mean of the local day (needs >= 18 hourly values)."""
    i, k = np.asarray(i), np.asarray(k)
    lday = local_day_index(grid)
    t_issue = grid[np.clip(i, 0, len(grid) - 1)]
    target_day = (t_issue + pd.Timedelta(hours=LOCAL)).normalize() + pd.to_timedelta(k, "D")
    # first grid position of the target local day: local 00:00 = UTC 23:00 of the previous day
    start = ((target_day - pd.Timedelta(hours=LOCAL)) - grid[0]) // pd.Timedelta(hours=1)
    start = np.asarray(start, dtype=int)
    end = start + 23  # inclusive
    X = sc.issue(p, i)
    X["k"] = k
    X["station"] = np.full(len(i), STATION_IDX[station] if isinstance(station, str) else int(station))
    X["issue_hour"] = ((t_issue.hour + LOCAL) % 24).to_numpy()
    X["hours_to_start"] = start - i
    X.update(_calendar(pd.DatetimeIndex(target_day) + pd.Timedelta(hours=12 - LOCAL), "d_"))
    for name, col, fn in [("d_wind_mean", "wind", "mean"), ("d_wind_max", "wind", "max"), ("d_blh_mean", "blh", "mean"),
                          ("d_blh_min", "blh", "min"), ("d_t2m_mean", "t2m", "mean"), ("d_t2m_min", "t2m", "min"),
                          ("d_precip_sum", "precip", "sum"), ("d_rh_mean", "rh", "mean"), ("d_cloud_mean", "cloud", "mean"),
                          ("d_rad_max", "rad", "max"), ("d_dT_mean", "dT_pasja", "mean"), ("d_dT_max", "dT_pasja", "max"),
                          ("d_dTk_mean", "dT_krvavec", "mean"), ("d_gust_max", "gust", "max"), ("d_psfc_mean", "psfc", "mean")]:
        X[name] = _take(mc.win(col, 24, fn), end)
    # evening/night between issue and target day: does it ventilate before the day starts?
    gap = np.clip(start - 1 - i, 1, None)
    for name, col, fn in [("g_wind_mean", "wind", "mean"), ("g_blh_min", "blh", "min"), ("g_precip_sum", "precip", "sum")]:
        v = np.full(len(i), np.nan)
        for gg in np.unique(gap):
            m = gap == gg
            v[m] = _take(mc.win(col, int(gg), fn), (start - 1)[m])
        X[name] = v
    c = sc.c[p]
    cd = _take(_roll(c, 24, "mean", 18), end)
    X["c_day"] = cd
    X["c_day_corr7"] = cd * np.exp(X["cams_logratio168"])
    X["c_day_corr30"] = cd * np.exp(X["cams_logratio720"])
    # target
    ymean = _take(_roll(sc.y[p], 24, "mean", 18), end)
    return pd.DataFrame(X), ymean, pd.DatetimeIndex(target_day)
