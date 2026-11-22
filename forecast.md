# How the model makes a prediction

A short, mostly non-technical walk-through of the maths behind `napoved_pm`. The code is in `model.py` (model),
`znacilke.py` (inputs) and `treniraj.py` (training).

## 1. The question it answers

At a moment *t* (the latest hour with a measurement) the model is asked:

> What will PM be at this station *h* hours from now (h = 1 ... 48), or as the average of tomorrow / the day after?

It does not give one number. It gives three: **P10, P50, P90**.

* **P50**: the most likely value (the median: half the time reality is higher, half the time lower).
* **P10 to P90**: the range that holds the real value 80 % of the time.

## 2. It predicts the change, not the level

Pollution changes slowly, so "same as now" is already a good guess (that is *persistence*). Instead of predicting
PM directly, the model predicts **how much it will change**, as a ratio on a log scale:

$$
r = \ln(1 + y_{t+h}) - \ln(1 + y_t)
$$

* $y_t$ is the value now and $y_{t+h}$ the value in *h* hours. The `1 +` only avoids problems at 0 µg/m³.
* $r = 0$ means "no change", $r = +0.2$ about "+22 %", $r = -0.2$ about "−18 %".

So "same as now" is the model's natural starting point and it only has to learn **when and how much things
change**: evening build-up, a front clearing the basin, rain, an inversion forming. For the daily model,
$y_t$ is replaced by the mean of the last 24 hours.

## 3. The inputs (about 60 numbers per prediction)

| Group | Examples |
|---|---|
| Measurements up to now | current value, 1/2/3/6/12/24 h ago, 24 h and 7-day mean, the other pollutant |
| Weather at the target hour | wind, boundary-layer height, temperature, rain, humidity, radiation |
| Weather between now and then | mean wind, total rain, lowest boundary layer ("does the basin ventilate?") |
| Inversion | temperature at Pasja ravan / Krvavec minus temperature in the basin (positive = warm air on top) |
| CAMS (European model) | CAMS forecast, and how wrong CAMS was here recently (see 6) |
| Time and setup | hour, weekday, season, hours ahead *h*, station |

## 4. The model: many small decision trees added together

A decision tree is a chain of yes/no questions that ends in a number, for example:

```
boundary layer in the next hours < 60 m ?
├─ yes: wind < 5 km/h ?
│        ├─ yes: target hour 19-23 h ?  ── yes: +0.12   no: +0.04
│        └─ no:  −0.03
└─ no:  rain > 2 mm ?  ── yes: −0.15   no: −0.02
```

One tree is crude. **Gradient boosting** builds 300 of them one after another, and **each new tree corrects the
mistakes of all the trees before it**:

$$
F(x) = F_0 + \eta \sum_{m=1}^{300} f_m(x)
$$

* $F_0$: a starting constant (the typical change).
* $f_m$: tree number *m*, with at most 48 end leaves (24 for the daily model).
* $\eta = 0.06$: the learning rate. Each tree only adds a small step, which keeps the model from over-reacting to
  noise.

During training, every tree is fitted to the errors still left after the previous trees, on ~0.5 to 1 million
historical examples. A leaf must hold at least 80 examples (60 in the daily model), so the model can't memorise single days. Missing
inputs (gaps in weather or CAMS) are handled inside the trees: each split learns which way a missing value should go.

## 5. Three answers: P10, P50, P90 (quantile loss)

The same kind of model is trained three times, each with a different scoring rule (*pinball loss*). For quantile $q$:

$$
L_q(y, \hat y) =
\begin{cases}
q\,(y - \hat y) & \text{if the real value is above the prediction} \\
(1-q)\,(\hat y - y) & \text{if it is below}
\end{cases}
$$

* For **P50** ($q = 0.5$) too high and too low cost the same, so the best answer is the median.
* For **P90** ($q = 0.9$) predicting too low costs 9 times more than too high, so the model learns to answer a
  value that is exceeded only 10 % of the time. P10 is the mirror image.

The model's output $F_q(x)$ is a predicted change $r$. It is turned back into µg/m³:

$$
\hat y_q = (1 + y_t)\, e^{F_q(x)} - 1
$$

Because this transformation keeps the order of values, a median of the change is exactly the median of the value.

## 6. CAMS bias correction (learned, not hand-set)

Raw CAMS overestimates Ljubljana by 2 to 3 times, and the error grows from winter to winter. So the model gets
CAMS's recent error as an input, over the last 7 and 30 days:

$$
b = \ln \frac{1 + \sum \text{measured}}{1 + \sum \text{CAMS}}, \qquad \text{CAMS}_{\text{corrected}} = \text{CAMS} \cdot e^{\,b}
$$

The trees then decide for themselves how much to trust CAMS: mostly its *direction* ("CAMS expects a rise
tonight"), less its level.

## 7. Making the range honest (calibration)

Quantile trees tend to give a range that is too narrow. So the model is first trained **without its last 12
months of data**, then checked on that year. For each example the "miss" is measured:

$$
E = \max\big(\text{P10} - r,\; r - \text{P90}\big)
$$

($E > 0$ means the real value fell outside the range.) $Q$ is the value of $E$ that 80 % of misses stay below,
computed separately for 1-3 h, 4-12 h, 13-24 h and 25-48 h ahead (daily model: tomorrow and day after). Then the model is retrained on all data, and
every future range is widened by $Q$ on each side (on the log scale). This is *conformalised quantile regression*.
It is why the range really holds the real value about 80 % of the time.

## 8. Chance of exceeding the limit

From the three numbers the model computes the probability that the daily mean goes over a limit (e.g. PM10 > 50).
It assumes the value is spread like a bell curve on the log scale, with the upper half as wide as P50 to P90 and
the lower half as wide as P10 to P50:

$$
P(\text{value} > L) = 1 - \Phi\!\left(\frac{\ln(1+L) - \ln(1+\text{P50})}{s}\right),
\quad s = \frac{\ln(1+\text{P90}) - \ln(1+\text{P50})}{1.28}
$$

($\Phi$ is the standard normal distribution, 1.28 is its 90th percentile; below P50 the lower half-width is used.)
This way the probability never contradicts the range shown on the map: a limit at P90 always gives 10 %.

## 9. A worked example

Bežigrad, 20 January 2026, 18:00 UTC. PM2.5 now: $y_t = 36.9$ µg/m³. Forecast for 21:00 (h = 3):

1. Inputs: low boundary layer, calm wind, evening, CAMS expects a rise.
2. The three tree ensembles answer the change, say $r$ = −0.15 / +0.05 / +0.20 (P10 / P50 / P90).
3. Calibration for 1-3 h widens the range by, say, $Q = 0.08$: −0.23 / +0.05 / +0.28.
4. Back to µg/m³ with $(1 + 36.9)\,e^{r} - 1$: **P10 29.1, P50 38.8, P90 49.1 µg/m³**.

Daily example, same evening, PM10 tomorrow: P10 27.2, P50 37.4, P90 45.5. The limit 50 is above P90:
$s = (\ln 46.5 - \ln 38.4)/1.28 = 0.149$, $z = (\ln 51 - \ln 38.4)/0.149 = 1.90$, so
**P(PM10 > 50) ≈ 3 %**.

(The *r* and *Q* values in step 2-3 are illustrative; the daily example uses the model's real replay output.)

## 10. One model for everything

There is no separate model per station or per hour ahead. The station and *h* are inputs, so the trees share
what they learn: what a calm night does at Vič also informs Bežigrad, and 6 h ahead informs 7 h ahead. That is
also what lets Graz data be added (its stations simply get new station numbers).

In total: 2 pollutants × 2 tasks (hourly, daily) × 3 quantiles = **12 tree ensembles of 300 trees each**.

## What it is not

* Not a physical model: it learns patterns from 2016-2026 data. Weather it has never seen (a record inversion)
  can surprise it.
* In the benchmarks the "forecast weather" is ERA5 reanalysis (what really happened). Live, real forecasts are
  less accurate, so live errors are somewhat larger.
* Valid for the basin floor around the three stations, not for hills.
