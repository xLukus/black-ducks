/* The browser engine must give the same numbers as scikit-learn. The fixture holds random
   rows (with some missing values) and PMQuantileModel.predict() output for each. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModel } from './hgb';
import fixture from './forecast-fixture.json';
function loadModel(kind) {
    const src = readFileSync(new URL(`../../../../public/data/forecast-${kind}.js`, import.meta.url), 'utf8');
    const g = {};
    new Function('window', src)(g);
    return g.LjData['forecast-' + kind];
}
describe('forecast model engine matches scikit-learn', () => {
    for (const kind of ['hourly', 'daily']) {
        const model = createModel(loadModel(kind));
        for (const p of ['pm10', 'pm25']) {
            it(`${kind} ${p}`, () => {
                const fx = fixture[`${kind}:${p}`];
                let worst = 0;
                fx.rows.forEach((row, i) => {
                    const got = model.predict(p, row);
                    got.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - fx.pred[i][k]) / Math.max(1, fx.pred[i][k])); });
                });
                expect(worst).toBeLessThan(1e-6);
            });
        }
    }
});
