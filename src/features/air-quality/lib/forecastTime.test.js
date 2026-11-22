import { describe, expect, it } from 'vitest';
import { availableForecastHours, forecastTimeLabel } from './forecastTime';
describe('forecast time selection', () => {
    it('offers only future hours with real readings', () => {
        const result = availableForecastHours({ lastMeas: 0, n: 4,
            timeAt: i => Date.parse('2026-11-22T08:00:00Z') + i * 3600000,
            readingAt: i => i === 1 ? { v: 12 } : i === 2 ? null : { v: NaN } });
        expect(result).toEqual([{ i: 1, date: '2026-11-22', time: '10:00' }]);
    });
    it('uses Ljubljana local time in winter', () => {
        expect(forecastTimeLabel(Date.parse('2026-11-22T23:00:00Z'))).toEqual({ date: '2026-11-23', time: '00:00' });
    });
    it('uses Ljubljana local time in summer', () => {
        expect(forecastTimeLabel(Date.parse('2026-07-22T08:00:00Z'))).toEqual({ date: '2026-07-22', time: '10:00' });
    });
});