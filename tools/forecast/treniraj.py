"""Train PM2.5 / PM10 models (hourly 1-48 h + daily tomorrow/day after) for the Ljubljana stations.

    python treniraj.py                          # Ljubljana only   -> modeli/lj/
    python treniraj.py --mesta lj,graz          # pooled LJ + Graz -> modeli/lj+graz/
    python treniraj.py --mesta lj,graz --utez-drugih 0.5        -> modeli/lj+graz_w0.5/
    python treniraj.py --hitro                  # fewer trees, ~2x faster (for trying things out)
    python treniraj.py --brez-koncnega          # only the benchmark folds, skip the final model

What gets trained (each is a full hourly + daily model for both pollutants):
  fold_2024-25/  trained on data up to 2024-10-31  -> benchmark tests it on winter 2024/25
  fold_2025-26/  trained on data up to 2025-10-31  -> benchmark tests it on winter 2025/26
  final/         trained on everything            -> used by napovej.py for live forecasts

Then run:  python benchmark.py --modeli <name>   (see protokol.py for the benchmark rules)

Other cities only add training rows. Their stations get their own station ids, the band calibration
uses Ljubljana rows only, and --utez-drugih sets how much their rows count (1 = same as Ljubljana).
"""
import argparse
import json
import sys
import time
import warnings

import joblib
import numpy as np
import pandas as pd

from model import PMQuantileModel
from protokol import (DEFAULT_EXCLUDE, FOLDS, LABEL, MAX_H, MOD, POLLUTANTS, TRAIN_DAILY_ISSUE_UTC, city_ljubljana,
                      city_other, daily_set, hourly_set)

warnings.filterwarnings("ignore")
W_DATA, W_HOURLY_FIT, W_DAILY_FIT = 1.0, 8.0, 0.6   # relative cost of steps, for the time estimate


class Progress:
    """Prints one line per step: [step] elapsed | remaining (estimate) | what is happening."""

    def __init__(self, total_weight):
        self.total, self.done, self.t0 = total_weight, 0.0, time.time()
        self.n, self.cur_w, self.started = 0, 0.0, False

    @staticmethod
    def _fmt(s):
        s = int(s)
        return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"

    def step(self, msg, weight):
        if self.started:
            self.done += self.cur_w
        self.started = True
        self.n += 1
        el = time.time() - self.t0
        eta = "--:--" if self.done == 0 else self._fmt(el / self.done * max(self.total - self.done, 0))
        print(f"  [{self.n:3d}] {self._fmt(el)} pretečeno | še ~{eta} | {msg}", flush=True)
        self.cur_w = weight

    def finish(self):
        print(f"  končano v {self._fmt(time.time() - self.t0)}", flush=True)


def train_models(cities, cutoff, iters, other_weight=1.0, n_random=3, progress=None, tag=""):
    """Train hourly + daily models for both pollutants on data with target time <= cutoff.
    cities: list of City (first one = Ljubljana, the target city). Returns {pollutant: bundle}."""
    rng = np.random.default_rng(0)
    cutoff = pd.Timestamp(cutoff)
    say = progress.step if progress else (lambda m, w: print("  ", m, flush=True))
    out = {}
    for p in POLLUTANTS:
        L = LABEL[p]
        say(f"{tag}{L}: gradim učne vrstice ({', '.join(c.name for c in cities)})", W_DATA)
        H, D = [], []
        for c in cities:
            h = hourly_set(c, p, c.grid[0], cutoff + pd.Timedelta(hours=23 - MAX_H),
                           target_max=cutoff + pd.Timedelta(hours=23), rng=rng, n_random=n_random)
            d = daily_set(c, p, "2016-01-01", cutoff, issue_hours=TRAIN_DAILY_ISSUE_UTC)
            if h[0] is not None:
                H.append(h)
            if d[0] is not None:
                D.append(d)
        Xh = pd.concat([h[0] for h in H], ignore_index=True)
        yh = np.concatenate([h[1] for h in H])
        mh = pd.concat([h[2] for h in H], ignore_index=True)
        Xd = pd.concat([d[0] for d in D], ignore_index=True)
        yd = np.concatenate([d[1] for d in D])
        md = pd.concat([d[2] for d in D], ignore_index=True)
        counts = {k: int(v) for k, v in mh.groupby("city").size().items()}
        dcounts = {k: int(v) for k, v in md.groupby("city").size().items()}
        print(f"        urne vrstice: {', '.join(f'{k} {v:,}' for k, v in counts.items())} | "
              f"dnevne: {', '.join(f'{k} {v:,}' for k, v in dcounts.items())}", flush=True)
        target = cities[0].name
        wh = np.where(mh.city.to_numpy() == target, 1.0, other_weight)
        wd = np.where(md.city.to_numpy() == target, 1.0, other_weight)

        def cb(kind, w):
            return lambda m, n: say(f"{tag}{L}: {kind} model, {m} ({n:,} vrstic)", w)

        hourly = PMQuantileModel("y0", "hourly", iters=iters).fit(
            Xh, yh, mh.target, sample_weight=wh, cal_ok=(mh.city == target).to_numpy(), progress=cb("urni", W_HOURLY_FIT))
        daily = PMQuantileModel("y_mean24", "daily", iters=iters, leaf_nodes=24, min_leaf=60).fit(
            Xd, yd, md.day, sample_weight=wd, cal_ok=(md.city == target).to_numpy(), progress=cb("dnevni", W_DAILY_FIT))
        out[p] = dict(hourly=hourly, daily=daily, hourly_features=list(Xh.columns), daily_features=list(Xd.columns),
                      trained_until=str(cutoff.date()), rows_hourly=counts, rows_daily=dcounts)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mesta", default="lj", help="lj ali lj,graz (prvo mesto je ciljno, na njem je kalibracija)")
    ap.add_argument("--ime", help="ime modela (mapa v modeli/); privzeto iz --mesta")
    ap.add_argument("--utez-drugih", type=float, default=1.0, help="utež vrstic drugih mest (1 = enako kot Ljubljana)")
    ap.add_argument("--izloci", default=",".join(DEFAULT_EXCLUDE), help="postaje drugih mest, ki jih izpustimo")
    ap.add_argument("--hitro", action="store_true", help="manj dreves (hitreje, nekoliko slabše)")
    ap.add_argument("--brez-koncnega", action="store_true", help="samo modeli za benchmark, brez končnega")
    args = ap.parse_args()

    mesta = [m.strip() for m in args.mesta.split(",") if m.strip()]
    if mesta[0] != "lj":
        sys.exit("prvo mesto mora biti lj (ciljno mesto)")
    name = args.ime or "+".join(mesta) + (f"_w{args.utez_drugih:g}" if len(mesta) > 1 and args.utez_drugih != 1 else "")
    iters = 150 if args.hitro else 300
    exclude = tuple(s for s in args.izloci.split(",") if s)
    parts = [(f"fold_{f['ime']}", f["ucenje_do"]) for f in FOLDS] + ([] if args.brez_koncnega else [("final", None)])

    print(f"\n=== Učenje modela '{name}' ===")
    print(f"mesta: {', '.join(mesta)} | utež drugih mest: {args.utez_drugih} | drevesa: {iters} | "
          f"izpuščene postaje: {', '.join(exclude) or '-'}")
    print(f"deli: {', '.join(p for p, _ in parts)}\n")
    print("Nalagam podatke ...", flush=True)
    t0 = time.time()
    cities = [city_ljubljana()]
    for m in mesta[1:]:
        cities.append(city_other(m, exclude=exclude))
    for c in cities:
        print(f"  {c.name}: {len(c.stations)} postaj, {c.grid[0]:%Y-%m-%d} – {c.end:%Y-%m-%d}", flush=True)
    print(f"  ({time.time() - t0:.0f} s)")

    per_part = len(POLLUTANTS) * (W_DATA + 6 * W_HOURLY_FIT + 6 * W_DAILY_FIT)
    prog = Progress(per_part * len(parts))
    outdir = MOD / name
    outdir.mkdir(parents=True, exist_ok=True)
    for part, cutoff in parts:
        cutoff = cutoff or str(cities[0].end.date())
        print(f"\n--- {part}: učni podatki do {cutoff} ---", flush=True)
        bundles = train_models(cities, cutoff, iters, args.utez_drugih, progress=prog, tag=f"{part} · ")
        (outdir / part).mkdir(exist_ok=True)
        for p, b in bundles.items():
            joblib.dump(b, outdir / part / f"{p}.joblib", compress=3)
        print(f"  shranjeno: modeli/{name}/{part}/", flush=True)
    prog.finish()

    info = dict(ime=name, mesta=mesta, utez_drugih=args.utez_drugih, izpuscene=list(exclude), drevesa=iters,
                deli=[p for p, _ in parts], ustvarjeno=pd.Timestamp.now().isoformat(timespec="seconds"))
    (outdir / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nModel '{name}' je v modeli/{name}/.")
    print(f"Preizkus proti vztrajnosti:  python benchmark.py --modeli {name}")
    print("Primerjava več modelov:      python benchmark.py --modeli lj lj+graz\n")


if __name__ == "__main__":
    main()
