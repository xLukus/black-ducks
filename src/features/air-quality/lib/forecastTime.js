const localParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
export function forecastTimeLabel(t) {
    const parts = Object.fromEntries(localParts.formatToParts(t).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function availableForecastHours({ lastMeas, n, timeAt, readingAt }) {
    const hours = [];
    for (let i = lastMeas + 1; i < n; i++) {
        const reading = readingAt(i);
        if (reading && Number.isFinite(reading.v)) hours.push({ i, ...forecastTimeLabel(timeAt(i)) });
    }
    return hours;
}