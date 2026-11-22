"""Predict PM2.5 / PM10 for the three ARSO Ljubljana stations with the trained models.

    python napovej.py                              # live: ARSO feed + Open-Meteo forecast + CAMS (needs internet)
    python napovej.py --replay 2026-01-20T18:00    # offline: pretend it is that moment (UTC), using package data
    python napovej.py --out ../web/data            # where to write files (default: napovedi/)

Writes:
  napoved.json          everything for the map, per station: current measurement, next 48 h, tomorrow/day after
  napoved_urno.csv      station, pollutant, time_utc, p10, p50, p90
  napoved_dnevno.csv    station, pollutant, day (local), p10, p50, p90, P(exceedance)

Labels: "meritev" = ARSO measurement, "ocena" = model estimate (weather/CAMS forecast + measurements).
"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "v_zivo"))

from model import prob_over  # noqa: E402
from podatki import KRVAVEC, MET_COLS, PASJA, POLLUTANTS, STATIONS, hourly_frames, load_pm  # noqa: E402
from znacilke import LOCAL, MAX_H, MetCache, SeriesCache, daily_rows, hourly_rows  # noqa: E402

THRESHOLDS = {"pm25": [25], "pm10": [50, 45]}
OM_WEATHER = "https://api.open-meteo.com/v1/forecast"
OM_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
PAST_DAYS = 35


# ---------------------------------------------------------------- live inputs
def _om(url, params):
    import requests
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    h = r.json()["hourly"]
    df = pd.DataFrame(h)
    df["time"] = pd.to_datetime(df.time)
    return df.set_index("time")


def live_frames():
    """Build the same frames as podatki.hourly_frames() from live sources."""
    import zrak_v_zivo as zv   # repo helper: ARSO XML feed + cloud capture

    common = dict(timezone="UTC", past_days=PAST_DAYS, forecast_days=3)
    s0 = STATIONS["E403"]
    met = _om(OM_WEATHER, dict(latitude=s0["lat"], longitude=s0["lon"], hourly=",".join(MET_COLS), **common)).rename(columns=MET_COLS)
    met["t2m_pasja"] = _om(OM_WEATHER, dict(latitude=PASJA["lat"], longitude=PASJA["lon"], hourly="temperature_2m", **common)).temperature_2m
    met["t2m_krvavec"] = _om(OM_WEATHER, dict(latitude=KRVAVEC["lat"], longitude=KRVAVEC["lon"], hourly="temperature_2m", **common)).temperature_2m
    cams = {}
    for s, v in STATIONS.items():
        a = _om(OM_AQ, dict(latitude=v["lat"], longitude=v["lon"], hourly="pm10,pm2_5", domains="cams_europe", **common))
        cams[s] = a.rename(columns={"pm10": "cams_pm10", "pm2_5": "cams_pm25"})

    # measurements: package history + cloud capture of the ARSO feed + the very latest hour
    hist = load_pm()
    try:
        z = zv.arso_zgodovina(dni=PAST_DAYS)
        try:
            z = pd.concat([z, zv.arso_zadnja_ura()], ignore_index=True)
        except Exception as e:  # noqa: BLE001
            print("  ARSO XML (zadnja ura) ni dosegljiv:", e)
        z = z[z.station_code.isin(STATIONS)][["time_utc", "station_code", "pm10", "pm25"]]
        z["time_utc"] = pd.to_datetime(z.time_utc, utc=True).dt.tz_convert(None)
        hist = pd.concat([hist, z], ignore_index=True).drop_duplicates(["station_code", "time_utc"], keep="last")
    except Exception as e:  # noqa: BLE001
        print("  zajem ARSO v oblaku ni dosegljiv, uporabim samo paket:", e)

    now = pd.Timestamp.now(tz="UTC").tz_convert(None).floor("h")
    grid = pd.date_range(now - pd.Timedelta(days=PAST_DAYS - 1), now + pd.Timedelta(hours=MAX_H + 24), freq="h")
    pm = {s: g.set_index("time_utc")[["pm10", "pm25"]].astype(float).reindex(grid) for s, g in hist.groupby("station_code")}
    return grid, pm, met.reindex(grid), {s: c.reindex(grid) for s, c in cams.items()}, now


def replay_frames(when):
    """Package data, with measurements after `when` hidden. Weather = ERA5 (a perfect forecast)."""
    when = pd.Timestamp(when).tz_localize(None) if pd.Timestamp(when).tzinfo else pd.Timestamp(when)
    grid, pm, met, cams = hourly_frames()
    truth = {s: pm[s].copy() for s in pm}
    for s in pm:
        pm[s].loc[pm[s].index > when] = np.nan
    return grid, pm, met, cams, when, truth


# ---------------------------------------------------------------- prediction
def predict(grid, pm, met, cams, now, models):
    mc = MetCache(met)
    hourly, daily, current = [], [], {}
    for s in STATIONS:
        sc = SeriesCache(pm[s], cams[s])
        for p in POLLUTANTS:
            y = sc.y[p]
            upto = int(np.searchsorted(grid, now, side="right")) - 1
            obs = np.where(~np.isnan(y[: upto + 1]))[0]
            if not len(obs):
                print(f"  {s} {p}: ni meritev, preskočeno"); continue
            i = int(obs[-1])
            age = int(upto - i)
            if age > 6:
                print(f"  opozorilo: {s} {p} zadnja meritev je stara {age} h")
            current[(s, p)] = dict(time_utc=grid[i], value=float(y[i]), age_h=age)
            M = models[p]
            # hourly: targets from now+1 to now+48 (horizon counted from the last measurement)
            h = np.arange(age + 1, age + MAX_H + 1)
            X, _, j = hourly_rows(grid, sc, mc, s, p, np.full(len(h), i), h)
            P = M["hourly"].predict(X[M["hourly_features"]])
            hourly.append(pd.DataFrame({"station": s, "pollutant": p, "time_utc": grid[np.clip(j, 0, len(grid) - 1)],
                                        "p10": P[:, 0], "p50": P[:, 1], "p90": P[:, 2]}))
            # daily: tomorrow and day after (local days)
            k = np.array([1, 2])
            Xd, _, days = daily_rows(grid, sc, mc, s, p, np.full(2, i), k)
            Pd = M["daily"].predict(Xd[M["daily_features"]])
            row = pd.DataFrame({"station": s, "pollutant": p, "day": days.date, "p10": Pd[:, 0], "p50": Pd[:, 1], "p90": Pd[:, 2]})
            for thr in THRESHOLDS[p]:
                row[f"p_over_{thr}"] = prob_over(Pd, thr)
            daily.append(row)
    return pd.concat(hourly, ignore_index=True), pd.concat(daily, ignore_index=True), current


def to_json(H, D, current, now, mode):
    out = {"ustvarjeno_utc": f"{now:%Y-%m-%dT%H:%MZ}", "nacin": mode,
           "opis": "p50 = najverjetnejša vrednost, p10-p90 = 80 % interval. 'ocena' = model iz meritev ARSO, "
                   "vremenske napovedi Open-Meteo in CAMS; ni meritev.",
           "meje": {"pm25_dnevno": 25, "pm10_dnevno": 50, "pm10_dnevno_2030": 45}, "postaje": []}
    for s, v in STATIONS.items():
        st = {"koda": s, "ime": v["name"], "lat": v["lat"], "lon": v["lon"], "zdaj": {}, "urno": {}, "dnevno": {}}
        for p in POLLUTANTS:
            if (s, p) in current:
                c = current[(s, p)]
                st["zdaj"][p] = {"vrsta": "meritev", "time_utc": f"{c['time_utc']:%Y-%m-%dT%H:%MZ}", "vrednost": round(c["value"], 1), "starost_h": c["age_h"]}
            h = H[(H.station == s) & (H.pollutant == p)]
            st["urno"][p] = [{"vrsta": "ocena", "time_utc": f"{t:%Y-%m-%dT%H:%MZ}", "p10": round(a, 1), "p50": round(b, 1), "p90": round(c, 1)}
                             for t, a, b, c in zip(h.time_utc, h.p10, h.p50, h.p90)]
            d = D[(D.station == s) & (D.pollutant == p)]
            st["dnevno"][p] = [{"vrsta": "ocena", "dan": str(r.day), "p10": round(r.p10, 1), "p50": round(r.p50, 1), "p90": round(r.p90, 1),
                                **{c: round(float(getattr(r, c)), 2) for c in d.columns if c.startswith("p_over_")}} for r in d.itertuples()]
        out["postaje"].append(st)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--replay", help="UTC time, e.g. 2026-01-20T18:00 (offline, package data)")
    ap.add_argument("--out", default=str(HERE / "napovedi"))
    ap.add_argument("--graf", action="store_true", help="also save a PNG of the forecast")
    ap.add_argument("--model", default="lj", help="trained model to use (folder in modeli/), e.g. lj or lj+graz")
    args = ap.parse_args()
    from protokol import load_models
    models = load_models(args.model, "final")
    truth = None
    if args.replay:
        grid, pm, met, cams, now, truth = replay_frames(args.replay)
        mode = f"replay {args.replay} (vreme = ERA5)"
    else:
        grid, pm, met, cams, now = live_frames()
        mode = "v živo"
    H, D, current = predict(grid, pm, met, cams, now, models)

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    H.round(2).to_csv(out / "napoved_urno.csv", index=False)
    D.round(3).to_csv(out / "napoved_dnevno.csv", index=False)
    (out / "napoved.json").write_text(json.dumps(to_json(H, D, current, now, mode), ensure_ascii=False, indent=1), encoding="utf-8")

    pd.set_option("display.width", 160)
    print(f"\n{mode}, izdano {now:%Y-%m-%d %H:%M} UTC")
    print(D.round(1).to_string(index=False))
    if truth is not None:
        H["meritev"] = [truth[s].loc[t, p] if t in truth[s].index else np.nan for s, p, t in zip(H.station, H.pollutant, H.time_utc)]
        err = (H.p50 - H.meritev).abs().groupby([H.station, H.pollutant]).mean().round(1)
        print("\nreplay: MAE naslednjih 48 h proti meritvi\n", err.to_string())
    if args.graf:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(2, 3, figsize=(15, 6.5), sharex=True)
        for col, s in enumerate(STATIONS):
            for row, p in enumerate(POLLUTANTS):
                ax = axes[row, col]
                h = H[(H.station == s) & (H.pollutant == p)]
                past = pm[s][p].loc[now - pd.Timedelta(hours=48): now]
                ax.plot(past.index, past.values, "k-", lw=1.2, label="meritev")
                ax.fill_between(h.time_utc, h.p10, h.p90, alpha=.25, color="#1f6feb", label="ocena P10–P90")
                ax.plot(h.time_utc, h.p50, color="#1f6feb", lw=1.6, label="ocena P50")
                if "meritev" in h:
                    ax.plot(h.time_utc, h.meritev, "k:", lw=1, label="kasnejša meritev")
                ax.axvline(now, color="gray", lw=.8)
                ax.set_title(f"{STATIONS[s]['name']} {p.upper().replace('PM25', 'PM2.5')}")
                ax.grid(alpha=.3)
        axes[0, 0].legend(fontsize=8)
        fig.autofmt_xdate(); fig.tight_layout()
        fig.savefig(out / "napoved.png", dpi=120)
        print("graf:", out / "napoved.png")
    print("zapisano:", out)


if __name__ == "__main__":
    main()
