import { describe, expect, it } from 'vitest';
import { healthImpact } from './healthImpact';

describe('PM2.5 health guidance', () => {
    it('uses existing EEA PM2.5 categories without shifting them for sensitive groups', () => {
        for (const group of ['children', 'elderly', 'sensitive']) {
            expect([10, 10.1, 20, 20.1, 25, 25.1, 50, 50.1, 75, 75.1].map(v => healthImpact(v, group)?.band))
                .toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
        }
    });
    it('does not invent concentrations when data is missing or invalid', () => {
        for (const value of [undefined, null, NaN, Infinity, -1]) expect(healthImpact(value, 'children')).toBeNull();
    });
    it('changes outdoor activity recommendations as severity increases', () => {
        expect(healthImpact(8, 'sensitive')?.band).toBe(0);
        expect(healthImpact(80, 'sensitive')?.band).toBe(5);
        expect(healthImpact(8, 'sensitive')?.recommendation).not.toEqual(healthImpact(80, 'sensitive')?.recommendation);
    });
    it('provides distinct risks for all three groups', () => {
        const guidance = ['children', 'elderly', 'sensitive'].map(group => healthImpact(30, group));
        expect(new Set(guidance.map(g => g?.group.short)).size).toBe(3);
        expect(new Set(guidance.map(g => g?.group.long)).size).toBe(3);
    });
});