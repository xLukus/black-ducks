"""Build data/siting.js: the 250 m decision grid for the two planning tools.

Usage: python build_siting.py <ARSOhack dir> <output dir>

Produces one browser-ready file (plain <script>, works from file://) holding:

  * the 250 m grid shared by the ARSO emission inventory and the GRAL model
    (i from west, j from south; x_min = 453640 + 250i, y_min = 90000 + 250j,
    EPSG:3794) with, per cell:
      em          small-heating PM10 emission, kg/year          INVENTORY
      gral_eve    GRAL heating contribution, winter evenings    MODEL
      gral_jan    GRAL heating contribution, January mean       MODEL
      camx        CAMx regional PM10, period mean               MODEL
      flats       dwellings from the building cadastre          REGISTER
      blds        residential buildings                         REGISTER
      pre80       residential buildings built before 1980       REGISTER
      pre80_nodh  of those, further than 50 m from district heating
      dh_share    share of residential buildings within 50 m of the network
      unc         |percentile(em) - percentile(gral_eve)|       DERIVED
  * the 530 OSM sensitive locations, with the GRAL values for the 318 that
    fall inside the model grid, including `ur_nad_25` and a curve of
    "hours above 25 if the heating contribution drops by r".
  * the assumptions from notebook 07 (stove efficiency, costs).

Sources: ARSO (emission inventory, GRAL, CAMx), GURS (cadastre, ZKGJI district
heating), OpenStreetMap (sensitive locations, ODbL). Cite "Vir: ARSO".
"""
import base64, gzip, json, re, sqlite3, struct, sys
from pathlib import Path

import numpy as np
import pandas as pd
import h5py
from scipy.spatial import cKDTree

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

# the 250 m grid (ARSO), EPSG:3794 D96/TM
X0, Y0, CELL, NI, NJ = 453640.0, 90000.0, 250.0, 72, 84
DH_NEAR_M = 50.0                     # "almost certainly connected to district heating"
EVENING_UTC = range(16, 22)          # 17:00-22:00 local (CET, no DST in winter)
WINTER_MONTHS = (1, 2)               # matches the shipped povprecje_vecer_jan_feb
H25_STEPS = [round(0.05 * k, 2) for k in range(11)]   # 0 .. 0.50 reduction


def src(rel):
    """Accept either the ARSOhack layout or a flat directory of the same files."""
    for cand in (SRC / rel, SRC / rel.replace("/", "_")):
        if cand.exists():
            return cand
    raise SystemExit(f"missing input: {rel}")


def r(v, n=2):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


# ---------------------------------------------------------------- 1. emissions
em = pd.read_csv(src("04_prostor/emisije/emisije_kurisca_250m.csv"))
tot = pd.read_csv(src("04_prostor/emisije/emisije_mreza_250m_skupaj.csv"))
em = em.merge(tot[["i", "j", "promet_pm10_kg_leto", "promet_km"]], on=["i", "j"], how="left")
print(f"emission grid: {len(em)} cells, {em.pm10_kg_leto.sum()/1000:.1f} t PM10/year from small heating")

EM = np.zeros((NJ, NI))
EM[em.j.values, em.i.values] = em.pm10_kg_leto.values
LAT = np.full((NJ, NI), np.nan); LON = np.full((NJ, NI), np.nan)
LAT[em.j.values, em.i.values] = em.lat.values
LON[em.j.values, em.i.values] = em.lon.values

# ---------------------------------------------------------------- 2. GRAL 250 m
with h5py.File(src("02_modeli/gral/gral_kurisca_urno_250m.nc"), "r") as f:
    mesec = f["mesec"][:]
    ura = f["ura"][:]
    V = f["pm10_prispevek"]                       # (8760, NJ, NI) µg/m³
    n_t = V.shape[0]
    eve = np.isin(mesec, WINTER_MONTHS) & np.isin(ura, list(EVENING_UTC))
    jan = mesec == 1
    sum_eve = np.zeros((NJ, NI)); n_eve = 0
    sum_jan = np.zeros((NJ, NI)); n_jan = 0
    h25 = np.zeros((len(H25_STEPS), NJ, NI), np.int32)
    BLOCK = 876
    for a in range(0, n_t, BLOCK):
        b = min(a + BLOCK, n_t)
        v = np.nan_to_num(V[a:b], nan=0.0)
        if eve[a:b].any():
            sum_eve += v[eve[a:b]].sum(axis=0); n_eve += int(eve[a:b].sum())
        if jan[a:b].any():
            sum_jan += v[jan[a:b]].sum(axis=0); n_jan += int(jan[a:b].sum())
        for k, red in enumerate(H25_STEPS):
            h25[k] += (v * (1 - red) > 25).sum(axis=0)
    GRAL_EVE = sum_eve / max(n_eve, 1)
    GRAL_JAN = sum_jan / max(n_jan, 1)
print(f"GRAL: {n_eve} winter-evening hours, {n_jan} January hours; "
      f"evening mean {GRAL_EVE[GRAL_EVE > 0].mean():.2f} µg/m³, max {GRAL_EVE.max():.1f}")

# ---------------------------------------------------------------- 3. CAMx (regional, from the shipped browser file)
CAMX = np.zeros((NJ, NI))
try:
    txt = (OUT / "camx.js").read_text(encoding="utf-8")
    k = txt.index(".camx=")                       # not the `||{}` fallback before it
    obj = json.loads(txt[txt.index("{", k): txt.rindex("}") + 1])
    a = np.frombuffer(base64.b64decode(obj["pm10"]), np.uint8).reshape(obj["n"], obj["h"], obj["w"]).astype(float)
    a[a == 255] = np.nan
    fld = np.nanmean(a, axis=0)                                  # period mean, µg/m³
    cor = np.array(obj["corners"])                               # NW, NE, SE, SW
    lon0, lat0 = cor[:, 0].min(), cor[:, 1].min()
    lon1, lat1 = cor[:, 0].max(), cor[:, 1].max()
    # the CAMx grid is LCC-projected; over 18 km a linear map is well inside its 4.4 km cell
    fx = np.clip((LON - lon0) / (lon1 - lon0) * (obj["w"] - 1), 0, obj["w"] - 1)
    fy = np.clip((lat1 - LAT) / (lat1 - lat0) * (obj["h"] - 1), 0, obj["h"] - 1)
    ok = np.isfinite(fx) & np.isfinite(fy)
    CAMX[ok] = np.nan_to_num(fld[np.round(fy[ok]).astype(int), np.round(fx[ok]).astype(int)])
    print(f"CAMx regional mean sampled: {CAMX[CAMX > 0].mean():.1f} µg/m³ "
          f"(range {CAMX[CAMX > 0].min():.1f}-{CAMX.max():.1f}, near-uniform at 4.4 km)")
except Exception as e:
    print("CAMx skipped:", e)

# ---------------------------------------------------------------- 4. district heating network
con = sqlite3.connect(src("04_prostor/zkgji_vrocevod.gpkg"))
rows = con.execute("select geom from linije where vrsta_objekta in ('Vročevod','Toplovod')").fetchall()
con.close()


def gpkg_lines(blob):
    """Minimal GeoPackage WKB reader: yields (n,2) vertex arrays for Line/MultiLineString."""
    flags = blob[3]
    env = [0, 32, 48, 48, 64][(flags >> 1) & 7]
    p = 8 + env
    bo = "<" if blob[p] == 1 else ">"
    typ = struct.unpack_from(bo + "I", blob, p + 1)[0] & 0xFF
    p += 5
    parts = 1
    if typ == 5:                                      # MultiLineString
        parts = struct.unpack_from(bo + "I", blob, p)[0]
        p += 4
    for _ in range(parts):
        if typ == 5:
            bo = "<" if blob[p] == 1 else ">"
            p += 5
        n = struct.unpack_from(bo + "I", blob, p)[0]
        p += 4
        yield np.frombuffer(blob, bo + "f8", count=2 * n, offset=p).reshape(n, 2)
        p += 16 * n


pts = []
for (blob,) in rows:
    for ln in gpkg_lines(blob):
        pts.append(ln)
        # densify so a nearest-vertex query approximates distance to the line
        d = np.hypot(*(np.diff(ln, axis=0).T))
        for k in np.nonzero(d > 10)[0]:
            m = int(d[k] // 10)
            t = np.linspace(0, 1, m + 2)[1:-1][:, None]
            pts.append(ln[k] + t * (ln[k + 1] - ln[k]))
DH = np.vstack(pts)
dh_tree = cKDTree(DH)
print(f"district heating: {len(rows)} lines -> {len(DH):,} points for distance queries")

# ---------------------------------------------------------------- 5. building cadastre
with gzip.open(src("04_prostor/kn_stavbe_atributi.csv.gz"), "rt", encoding="utf-8") as f:
    kn = pd.read_csv(f, usecols=["stevilo_stanovanj", "leto_izgradnje", "stanovanjska", "x_d96", "y_d96"])
kn = kn.dropna(subset=["x_d96", "y_d96"])
kn["ci"] = ((kn.x_d96 - X0) // CELL).astype(int)
kn["cj"] = ((kn.y_d96 - Y0) // CELL).astype(int)
kn = kn[(kn.ci >= 0) & (kn.ci < NI) & (kn.cj >= 0) & (kn.cj < NJ)]
res = kn[kn.stanovanjska == True].copy()
res["d_dh"] = dh_tree.query(res[["x_d96", "y_d96"]].values, workers=-1)[0]
res["near_dh"] = res.d_dh <= DH_NEAR_M
res["pre80"] = (res.leto_izgradnje > 0) & (res.leto_izgradnje < 1980)
print(f"cadastre: {len(kn):,} buildings in the grid, {len(res):,} residential, "
      f"{res.near_dh.sum():,} within {DH_NEAR_M:.0f} m of district heating")


def grid_sum(df, col=None):
    g = np.zeros((NJ, NI))
    v = df.groupby(["cj", "ci"]).size() if col is None else df.groupby(["cj", "ci"])[col].sum()
    idx = np.array(list(v.index))
    if len(idx):
        g[idx[:, 0], idx[:, 1]] = v.values
    return g


FLATS = grid_sum(res, "stevilo_stanovanj")
BLDS = grid_sum(res)
PRE80 = grid_sum(res[res.pre80])
PRE80_NODH = grid_sum(res[res.pre80 & ~res.near_dh])
NEAR_DH = grid_sum(res[res.near_dh])
DH_SHARE = np.divide(NEAR_DH, BLDS, out=np.zeros_like(BLDS), where=BLDS > 0)

# ---------------------------------------------------------------- 6. uncertainty: inventory vs model
# Notebook 04 §7: the inventory says where it is burned, GRAL says where people
# breathe it. Where the two rank a cell differently, a measurement is worth most.
sig = (EM > 0) | (GRAL_EVE > 0.2)


def pct_rank(a, mask):
    out = np.zeros_like(a)
    v = a[mask]
    order = v.argsort().argsort().astype(float)
    out[mask] = order / max(len(v) - 1, 1)
    return out


PE, PG = pct_rank(EM, sig), pct_rank(GRAL_EVE, sig)
UNC = np.where(sig, np.abs(PE - PG), 0.0)
UNC_S = np.where(sig, PE - PG, 0.0)
print(f"uncertainty: mean |rank gap| {UNC[sig].mean():.3f}, "
      f"{int((UNC > 0.4).sum())} cells disagree by more than 0.4")

# ---------------------------------------------------------------- 7. sensitive locations
osm = pd.read_csv(src("04_prostor/osm_obcutljive_lokacije.csv"))
gp = pd.read_csv(src("02_modeli/gral/gral_kurisca_obcutljive_lokacije.csv"))
CAT = {"vrtec": "kindergarten", "sola": "school", "bolnisnica": "hospital",
       "zdravstveni_dom": "health centre", "dom_za_starejse": "elderly home"}
gp_by_id = gp.set_index("osm_id")

sites = []
for t in osm.itertuples():
    g = gp_by_id.loc[t.osm_id] if t.osm_id in gp_by_id.index else None
    sites.append(dict(osm_id=t.osm_id, cat=CAT.get(t.kategorija, t.kategorija),
                      name=(t.ime if isinstance(t.ime, str) else (t.naslov if isinstance(t.naslov, str) else "")),
                      lat=round(float(t.lat), 5), lon=round(float(t.lon), 5),
                      jan=r(g.povprecje_januar, 2) if g is not None else None,
                      eve=r(g.povprecje_vecer_jan_feb, 2) if g is not None else None,
                      season=r(g.povprecje_kurilna_sezona, 2) if g is not None else None,
                      h25=int(g.ur_nad_25) if g is not None and np.isfinite(g.ur_nad_25) else None))

# locate each site on the 250 m grid via the nearest cell centre (lat/lon are shipped per cell)
valid = np.isfinite(LAT)
cell_pts = np.column_stack([LON[valid], LAT[valid]])
cell_ij = np.column_stack([np.repeat(np.arange(NJ), NI).reshape(NJ, NI)[valid],
                           np.tile(np.arange(NI), NJ).reshape(NJ, NI)[valid]])
ctree = cKDTree(cell_pts)
for s in sites:
    d, k = ctree.query([s["lon"], s["lat"]])
    j, i = int(cell_ij[k][0]), int(cell_ij[k][1])
    s["i"], s["j"] = i, j
    base = h25[0, j, i]
    if s["h25"] and base > 0:
        # shape of the fall-off from this cell's own hourly series, rescaled to the
        # site's published ur_nad_25 (which is computed at 15 m, not 250 m)
        s["h25curve"] = [round(float(h25[k_, j, i]) / base, 3) for k_ in range(len(H25_STEPS))]
    else:
        s["h25curve"] = None
print(f"sensitive locations: {len(sites)}, with GRAL values: {sum(1 for s in sites if s['eve'] is not None)}")

# ---------------------------------------------------------------- 8. write
keep = sig | (FLATS > 0) | (BLDS > 0)
jj, ii = np.nonzero(keep)
cells = [[int(i), int(j), r(LON[j, i], 5), r(LAT[j, i], 5), r(EM[j, i], 1), r(GRAL_EVE[j, i], 2),
          r(GRAL_JAN[j, i], 2), r(CAMX[j, i], 1), int(FLATS[j, i]), int(BLDS[j, i]),
          int(PRE80[j, i]), int(PRE80_NODH[j, i]), r(DH_SHARE[j, i], 2),
          r(UNC[j, i], 3), r(UNC_S[j, i], 3)] for j, i in zip(jj, ii)]

out = dict(
    grid=dict(x0=X0, y0=Y0, cell=CELL, ni=NI, nj=NJ),
    fields=["i", "j", "lon", "lat", "em", "gral_eve", "gral_jan", "camx", "flats",
            "blds", "pre80", "pre80_nodh", "dh_share", "unc", "unc_signed"],
    cells=cells,
    sites=sites,
    h25_steps=H25_STEPS,
    meta=dict(
        ef_new_vs_old=0.25,          # notebook 07: a new stove emits ~25 % of an old one
        cost_stove_eur=6000,         # notebook 07 CENE, no subsidies
        cost_district_heating_eur=8000,
        dh_near_m=DH_NEAR_M,
        evening="17:00-22:00 local, January and February",
        em_total_t=round(float(EM.sum()) / 1000, 1),
        gral_year=2021,
        note="emission inventory = where it is burned; GRAL = where it is breathed"),
)
txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
js = ("/* 250 m planning grid: ARSO emission inventory + GRAL heating model + GURS cadastre\n"
      "   and district heating + OSM sensitive locations -- generated by build_siting.py from the\n"
      "   ADA Hack 2026 data package (github.com/vidacex/ARSOhack). Vir: ARSO; GURS; "
      "© OpenStreetMap contributors. */\n"
      f"(window.LjData=window.LjData||{{}}).siting={txt};\n")
(OUT / "siting.js").write_text(js, encoding="utf-8")
print(f"siting.js  {len(js)/1024:.0f} KB  ({len(cells)} cells, {len(sites)} sites)")
