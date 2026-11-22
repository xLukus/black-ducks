/* Inversion statistics for basin.html.
   Source: ARSO measurements 2016-2026 in the ADA Hack 2026 package
   (03_vreme_inverzija/inverzija_urno_2016_2026.csv, igra2_lj_inverzija_dnevno.csv,
   01_meritve/arso_lj_pm_urno_2016_2026.csv.gz). Vir: ARSO.
   Inversion = Ljubljana Bezigrad (299 m) colder than Pasja ravan (1,019 m).
   These are measurements, not a model. */
(window.LjData = window.LjData || {})['basin-stats'] = {
  winterShare: 19.5,                 // % of Nov-Feb hours with an inversion
  worstMonth: { name: 'December', share: 28.2 },
  daysPerYear: [94, 140],            // days with at least one inversion hour
  daysPerWinter12h: [14, 33],        // days per winter with 12 h or more
  longestStreak: { days: 16, when: '20 Jan - 4 Feb 2024' },
  strongest: { dt: 15.8, when: '26 Dec 2016, 10:00' },
  pm: { pm10: { inv: 50, no: 25 }, pm25: { inv: 37, no: 20 } },
  exceedanceWithInversion: { share: 55, of: 202 },
  radiosonde: { morningShare: 49, medianMixingM: 125 },
  monthly: [
    { m: 'Jan', v: 22.2 }, { m: 'Feb', v: 13.5 }, { m: 'Mar', v: 8.4 }, { m: 'Apr', v: 5.6 },
    { m: 'May', v: 2.5 }, { m: 'Jun', v: 1.7 }, { m: 'Jul', v: 2.1 }, { m: 'Aug', v: 4.5 },
    { m: 'Sep', v: 8.5 }, { m: 'Oct', v: 13.9 }, { m: 'Nov', v: 13.7 }, { m: 'Dec', v: 28.2 }
  ],
  // share of winter hours with an inversion, by hour of day (local)
  hourly: [
    28, 29, 30, 31, 31, 32, 32, 33, 34, 33, 28, 21,
    15, 11, 9, 8, 8, 10, 14, 19, 23, 25, 26, 27
  ],
  peakHours: '08-10', quietHours: '15-17',
  history: [
    { when: 'Late 1960s', text: 'Thousands of coal stoves. Ljubljana’s air was counted among the most polluted in the world, and the first air measurements start in 1969.' },
    { when: '1970s', text: 'Smoke and sulphur dioxide from home chimneys and the coal-fired heating plant dominate winter air. Ljubljana is often called the foggiest capital in Europe, with inversions typically 200-300 m thick.' },
    { when: '1980s-2000s', text: 'District heating, gas and cleaner coal cut sulphur dioxide and black smoke. The problem changes shape: from winter smoke to fine particles all year, from traffic and from wood stoves in winter.' },
    { when: '2016-2017', text: 'Bežigrad still records 33-36 days a year above the daily PM10 limit of 50 µg/m³. The EU allows 35.' },
    { when: '2025', text: 'Down to 10 days. Better, but the basin has not changed: on inversion days the lid still doubles the particles, and the smoke now comes mostly from old wood stoves around the centre.' }
  ]
};
