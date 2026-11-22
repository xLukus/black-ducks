// Keep the full sensor solution available to the map and show only its leading sites.
export function firstProposedSites(picks) {
    return picks.slice(0, 5);
}