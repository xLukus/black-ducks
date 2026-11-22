/* Every constant on the site. One constant, one place. */
/** European Air Quality Index (EEA): upper limit of each band, µg/m³ */
export const BANDS = {
    pm25: [10, 20, 25, 50, 75, Infinity],
    pm10: [20, 40, 50, 100, 150, Infinity]
};
export const BAND_LABELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'];
/** The official EEA index colours. */
export const BAND_COLORS = ['#50f0e6', '#50ccaa', '#f0e641', '#ff5050', '#960032', '#7d2181'];
/** Text that is readable on top of each band colour. */
export const BAND_INK = ['#0b2b29', '#0b2b22', '#3a3500', '#3d0000', '#ffffff', '#ffffff'];
/** A darker version of each band colour, readable as text on white (≥ 4.5:1). */
export const BAND_TEXT = ['#0b7a72', '#1d7a60', '#7a6f00', '#c81e1e', '#960032', '#7d2181'];
export const NAMES = { pm25: 'PM2.5', pm10: 'PM10' };
export const UNIT = 'µg/m³';
export const PROFILES = {
    children: { label: 'Children', long: 'Children', shift: 1 },
    elderly: { label: '65+', long: 'Older people (65+)', shift: 1 },
    sensitive: { label: 'Asthma / heart', long: 'Asthma, lung or heart conditions', shift: 1 },
    everyone: { label: 'Everyone', long: 'Healthy adults', shift: 0 }
};
export const PROFILE_KEYS = Object.keys(PROFILES);
/** Why the air matters for each group — shown only for the group that is selected. */
export const GROUP_TEXT = {
    children: [
        'Children breathe more air for their body weight than adults, their lungs are still growing, and they run and play close to the ground.',
        'The same hour outside gives a child a bigger dose, so timing matters more for them.'
    ],
    elderly: [
        'With age, the heart and lungs have less reserve. Fine particles reach the blood and add strain on the heart.',
        'Bad-air days bring more hospital visits in this group, often a day or two later.'
    ],
    sensitive: [
        'Smoke and fine dust irritate airways that are already sensitive and can trigger an asthma attack within hours. Keep reliever medication at hand on poor days.',
        'For heart conditions, high-pollution days are linked to more heart and circulation problems in the following day or two.'
    ],
    everyone: [
        'You cannot see or smell PM2.5. Short exposure can bring a cough, a sore throat and tiredness.',
        'Over years, winter after winter, it adds up — which is why it is worth avoiding the worst hours even when you feel fine.'
    ]
};
/** one line per band, for the chosen group (EEA health messages, condensed) */
export const VERDICTS = [
    'Good time to go out',
    'Good time to go out',
    'Fine, but keep it easy',
    'Shorten time outside',
    'Limit time outside',
    'Stay inside if you can'
];
export const ADVICE_GENERAL = [
    'Enjoy your usual outdoor activities.',
    'Enjoy your usual outdoor activities.',
    'Enjoy your usual outdoor activities.',
    'If your eyes sting or your throat feels scratchy, ease off hard effort outdoors.',
    'Cut back on physical activity outdoors.',
    'Keep physical activity outdoors to a minimum.'
];
export const ADVICE_SENSITIVE = [
    'Enjoy your usual outdoor activities.',
    'Enjoy your usual outdoor activities.',
    'If symptoms appear, ease off intense activity outdoors.',
    'Reduce physical activity, especially outdoors, above all if you have symptoms.',
    'Reduce physical activity, especially outdoors.',
    'Avoid physical activity outdoors.'
];
/** share of GRAL's local heating excess seen in measurements (ARSO 2021 fit) */
export const K_LOCAL = 0.45;
export const DAY_WINDOW = { from: 7, to: 19 };
export const ALERT_LEVELS = [
    { band: 2, label: 'Moderate' },
    { band: 3, label: 'Poor' },
    { band: 4, label: 'Very poor' }
];
export const DEFAULT_ALERT_LEVEL = 3;
export const ALERT_REPEAT_MS = 3 * 3600e3;
export const REFRESH_MS = 15 * 60e3;
/** live endpoints — best effort, the site works without them */
export const ENDPOINTS = {
    arso: 'https://ada-hack-zrak.live-event-recap-spike.workers.dev/arso/history.csv',
    meteo: 'https://api.open-meteo.com/v1/forecast',
    cams: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    /** Sensor.Community, last 5 minutes of every sensor within 15 km (see ARSOhack v_zivo/README.md) */
    sensorCommunity: 'https://data.sensor.community/airrohr/v1/filter/area=46.05,14.5,15'
};
/** Linear calibration ARSO = a * sensor + b per Sensor.Community device, all winters
    (ARSOhack 01_meritve/senzorji_umerjanje_koeficienti.csv, method b_linearna, season "vse").
    21901 (Fužine) is broken since 9 Nov 2026 and 75285 never calibrated reliably: both left out. */
export const SC_CALIBRATION = {
    9821: { lat: 46.042, lon: 14.472, ref: 'E404', pm25: [1.1265, 2.578], pm10: [0.6318, 7.319] },
    14576: { lat: 46.072, lon: 14.470, ref: 'E405', pm25: [1.3318, 3.805], pm10: [0.7676, 11.153] },
    44606: { lat: 46.072, lon: 14.474, ref: 'E405', pm25: [3.2462, 1.740], pm10: [2.1622, 9.060] },
    56181: { lat: 46.052, lon: 14.544, ref: 'E403', pm25: [1.5255, 2.137], pm10: [0.6155, 7.821] },
    64688: { lat: 46.070, lon: 14.492, ref: 'E405', pm25: [1.1466, 5.540], pm10: [0.4727, 11.970] },
    67867: { lat: 46.096, lon: 14.470, ref: 'E405', pm25: [1.6592, 6.825], pm10: [0.6519, 13.201] },
    74650: { lat: 46.042, lon: 14.592, ref: 'E403', pm25: [2.1063, 4.181], pm10: [1.1700, 7.966] }
};
export const MAP = {
    style: 'https://tiles.openfreemap.org/styles/positron',
    dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    center: [14.5058, 46.0512],
    zoom: 11.9,
    /** the home map opens tilted, as a 3D view of the basin */
    pitch: 58,
    bearing: -18,
    maxBounds: [[14.2, 45.88], [14.85, 46.22]],
    minZoom: 9.5,
    maxZoom: 18.5,
    maxPitch: 75,
    exaggeration: 1.5,
    /** OpenMapTiles only carries buildings from z13; the LOD params keep them on screen toward the horizon */
    buildingsMinZoom: 13
};
export const SOURCES = 'ARSO (air quality, meteorology, CAMx and GRAL models), Sensor.Community, PurpleAir, ' +
    'ECMWF ERA5 and CAMS via Open-Meteo, OpenStreetMap (ODbL), Copernicus DEM, GURS cadastre. ' +
    'ADA Hack 2026 data package.';
