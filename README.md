# breathe.

> **breathe** · PM2.5 near you is 3× the WHO limit. Best time to run: tomorrow 14:00.

Built in 24 hours by team **Black Ducks** at **ADA Hack 2026** for the *Zrak, ki ga dihamo* challenge (Abelium × ARSO).

---

## What Breathe does

Breathe is a web app for everyday use. It's also a place to go deeper into how Ljubljana's air could be improved.

It shows the city on a map with its air-quality data, explains what each number means, and tells you when it's best to go outside. It takes sensitive groups of people and the institutions that serve them into account. It also simulates where new sensors should go, and shows how changing Ljubljana's heating systems would reduce the smoke.

- **Map and planner** (`/`): a 3D map of the city with official ARSO stations, calibrated citizen sensors and modelled heating smoke. Click any spot and choose a group: *children*, *65+*, *asthma / heart* or *everyone*. Breathe gives you:
  - the cleanest time to go out
  - the hours to avoid
  - the best hour to air the flat
- **Forecast:** our own model predicts PM2.5 and PM10 up to 48 hours ahead. Each prediction comes with a range and the chance that tomorrow's daily average goes over the limit.
- **Health guidance and alerts:** what the numbers mean for your group, and an optional notification before the air turns bad.
- **Why it happens** (`/basin`): Ljubljana sits in a bowl with a lid. This page explains winter inversions, with charts by month and by hour of day.
- **Where to put new sensors** (`/sensors`): three official stations cover about 300,000 people. This tool scores every 250 m of the city by:
  - how many people live there, and which kindergartens, schools and care homes are nearby
  - how polluted it is
  - how far it is from the nearest station

  It then proposes the next sites in order.
- **Cleaner heating** (`/heating`): pick a kindergarten, school or care home. Then choose what the city changes around it: replace old stoves or connect homes to district heating. Breathe shows how much cleaner its evening air gets and what the change would cost.

Every number in the app is labelled as **measured**, **sensor**, **estimate**, **forecast** or **model**.

---

## How it fits the challenge

| Challenge goal | Target group | Where in Breathe |
|---|---|---|
| **1 · Explain:** when and why the air gets worse, and who it hits hardest | citizens, decision makers | `/basin`, health guidance, sensitive-sites layer |
| **2 · Inform:** at the right time, in the right place | citizens | map, planner, 48 h forecast, alerts |
| **3 · Encourage:** action, not moralising | decision makers | `/heating`, `/sensors` |
| **4 · Verify:** the effect of a measure | decision makers | Partly: `/heating` estimates the effect before a measure is taken, and `/sensors` shows where to measure it afterwards |

---

## What's next

- **A mobile app** with push notifications.
- **Smart-home integration:** close windows or switch ventilation during smoke peaks, and air the flat in the cleanest hour.
- **Other cities:** the forecast model can already be trained on other cities' stations.

---

How the Forecasting works
---
If interested about the backbone of our forecast check out forecast.md
## Run it

```sh
bun install
bun run dev      # then open the local URL Vite prints
bun run test
```

No accounts or API keys needed. The data files in `public/data` are generated from the ADA Hack data package with the scripts in `tools/`.

<sub>Data: ARSO, ADA Hack 2026 data package · Map data © OpenStreetMap contributors</sub>
