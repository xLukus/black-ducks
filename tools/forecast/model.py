"""Quantile model with a persistence-relative target and conformal calibration of the P10-P90 band.

* Target is log1p(future) - log1p(base), where base is the current value (hourly) or the mean of
  the last 24 h (daily). "Same as now" is therefore the starting point and trees only learn changes;
  this is what makes the model beat persistence at short horizons.
* Quantiles in log space map 1:1 to quantiles in µg/m³ (monotone transform), so P50 is unbiased
  as a median, unlike exp(mean(log)).
* Conformalised quantile regression (CQR): the last `cal_days` of training data are held out, the
  band is widened/narrowed per group (horizon bucket or lead day) so that it covers 80 % there,
  then the model is refit on all data and keeps that correction.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

QUANTILES = (0.1, 0.5, 0.9)
H_BUCKETS = [(1, 3), (4, 12), (13, 24), (25, 48)]


def group_hourly(X):
    h = X["h"].to_numpy()
    return np.select([(h >= a) & (h <= b) for a, b in H_BUCKETS], [f"{a}-{b}h" for a, b in H_BUCKETS], "other")


def group_daily(X):
    return np.char.add("k", X["k"].to_numpy().astype(str))


GROUPS = {"hourly": group_hourly, "daily": group_daily}


class PMQuantileModel:
    def __init__(self, base_col, group, iters=400, leaf_nodes=48, min_leaf=80, cal_days=365, level=0.8):
        self.base_col, self.group, self.iters = base_col, group, iters
        self.leaf_nodes, self.min_leaf, self.cal_days, self.level = leaf_nodes, min_leaf, cal_days, level
        self.models, self.Q = {}, {}

    def _new(self, q):
        return HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=self.iters, learning_rate=0.06,
                                             max_leaf_nodes=self.leaf_nodes, min_samples_leaf=self.min_leaf,
                                             l2_regularization=1.0, categorical_features=["station"], random_state=0)

    def _target(self, X, y):
        return np.log1p(y) - np.log1p(X[self.base_col].to_numpy())

    def _fit_raw(self, X, t, w=None, progress=None, tag=""):
        out = {}
        for q in QUANTILES:
            if progress:
                progress(f"{tag} P{int(q * 100)}", len(X))
            out[q] = self._new(q).fit(X, t, sample_weight=w)
        return out

    @staticmethod
    def _raw(models, X):
        R = np.column_stack([models[q].predict(X) for q in QUANTILES])
        return np.sort(R, axis=1)

    def fit(self, X, y, times, calibrate=True, sample_weight=None, cal_ok=None, progress=None):
        """sample_weight: per-row weight (e.g. lower for other cities).
        cal_ok: rows allowed in the calibration hold-out (e.g. only the target city).
        progress: callback(message, n_rows) called before every tree fit."""
        X = X.reset_index(drop=True)
        t = self._target(X, y)
        times = pd.DatetimeIndex(times)
        w = None if sample_weight is None else np.asarray(sample_weight, float)
        if calibrate:
            ok = np.ones(len(X), bool) if cal_ok is None else np.asarray(cal_ok, bool)
            last = times[ok].max() if ok.any() else times.max()
            cal = np.asarray(times > last - pd.Timedelta(days=self.cal_days)) & ok
            m = self._fit_raw(X[~cal], t[~cal], None if w is None else w[~cal], progress, "kalibracija")
            R = self._raw(m, X[cal])
            E = np.maximum(R[:, 0] - t[cal], t[cal] - R[:, 2])   # > 0 means outside the band
            g = GROUPS[self.group](X[cal])
            for grp in np.unique(g):
                e = E[g == grp]
                self.Q[grp] = float(np.quantile(e, min(1.0, self.level * (len(e) + 1) / len(e))))
        self.models = self._fit_raw(X, t, w, progress, "končni")
        return self

    def predict(self, X):
        """Returns n x 3 array (P10, P50, P90) in µg/m³."""
        R = self._raw(self.models, X)
        if self.Q:
            q = np.array([self.Q.get(g, 0.0) for g in GROUPS[self.group](X)])
            R[:, 0] -= q
            R[:, 2] += q
        base = np.log1p(X[self.base_col].to_numpy())
        return np.clip(np.expm1(R + base[:, None]), 0, None)


def prob_over(P, thr):
    """P(value > thr) from the calibrated (P10, P50, P90), assuming a split log-normal shape.
    Consistent with the band shown on the map: P(>P90) = 0.1, P(>P50) = 0.5, P(>P10) = 0.9."""
    from scipy.special import ndtr
    lo, mid, hi = (np.log1p(P[:, k]) for k in range(3))
    z90 = 1.2815515655446004
    s_up = np.maximum((hi - mid) / z90, 1e-3)
    s_dn = np.maximum((mid - lo) / z90, 1e-3)
    x = np.log1p(thr) - mid
    return 1 - ndtr(np.where(x > 0, x / s_up, x / s_dn))
