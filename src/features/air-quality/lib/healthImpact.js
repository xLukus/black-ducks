import { bandIndex } from './aqi';
import { ADVICE_SENSITIVE, BAND_LABELS } from './config';

export const HEALTH_GROUPS = {
    children: {
        label: 'Children',
        short: 'Fine particles can irritate developing airways, causing coughing, wheezing or breathing difficulties, and can trigger asthma attacks in children with asthma.',
        long: 'Repeated exposure over months or years is associated with impaired lung development and a higher risk of developing asthma and respiratory infections, including pneumonia.'
    },
    elderly: {
        label: 'Elderly (65+)',
        short: 'Fine particles can cause coughing and breathlessness, worsen existing lung conditions and increase the risk of cardiovascular complications, especially in people with heart disease.',
        long: 'Prolonged exposure is associated with higher risks of heart disease, stroke, chronic lung disease and lung cancer.'
    },
    sensitive: {
        label: 'People with asthma',
        short: 'Fine particles can trigger coughing, wheezing, chest tightness, breathing difficulties or asthma attacks.',
        long: 'Repeated exposure can worsen asthma control, contribute to reduced lung function and increase the risk of respiratory infections. Long-term PM2.5 exposure is also associated with heart disease and lung cancer.'
    }
};

export function healthImpact(value, profile) {
    const group = HEALTH_GROUPS[profile];
    if (!group || !Number.isFinite(value) || value < 0) return null;
    const band = bandIndex(value, 'pm25');
    return {
        group, band, category: BAND_LABELS[band],
        shortContext: band < 2
            ? 'At this level, immediate effects are less likely, but sensitive people may still notice symptoms.'
            : band === 2
                ? 'Sensitive people may notice symptoms, especially during strenuous outdoor activity.'
                : 'As pollution rises, symptoms and acute complications become more likely, particularly in sensitive people.',
        recommendation: ADVICE_SENSITIVE[band],
        precaution: profile === 'sensitive'
            ? 'Follow your asthma action plan and keep prescribed reliever medication with you. Seek urgent help for severe breathing difficulty or symptoms not relieved by your usual treatment.'
            : profile === 'children'
                ? 'Choose cleaner hours and places away from traffic for play. Watch for coughing or wheezing and stop strenuous activity if symptoms appear.'
                : 'Choose cleaner hours for walks and avoid busy roads. Seek urgent help for chest pain or severe breathlessness.'
    };
}