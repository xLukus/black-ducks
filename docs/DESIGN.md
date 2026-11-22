# Design

Quiet, light and functional. The only strong colour on the page is the air-quality band.

* **Type:** Inter (self-hosted via @fontsource). Sentence case everywhere, no letter-spaced caps.
* **Colour:** neutral greys on white (`--ink` #111827, `--ink-2` #374151, `--ink-3` #5b6472 — the
  lightest text colour, 6:1 on white). One accent (#1d4ed8) for links, focus and existing instruments.
* **Bands:** the official EEA index colours. On a band chip the text uses `BAND_INK`; as text on white
  it uses `BAND_TEXT` (both checked ≥ 4.5:1 in the tests).
* **Source tags:** Measured / Sensor / Estimate / Forecast / Model — every number says where it came from.
* **No** glass, glows, gradients, stock photos or decorative motion.
* **Layout:** map page is a fixed app shell (sidebar 384 px + map + timeline); below 900 px it stacks
  map → timeline → sidebar. Content pages are a 1080 px column.
