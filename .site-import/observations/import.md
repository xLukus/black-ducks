# Source repository import

- Source: https://github.com/toshevskasara/black-ducks-adahack/tree/claude-anze
- Revision: 8952fdf
- Permission: user confirmed ownership or owner's permission in chat.
- Import mode: repository source migration, not webpage capture. The source was a GitHub repository, so no First-import linked-page list, live-source overlays, or paired motion comparison was available.
- Preserved: four page views, source layout/classes, original map layers, datasets, models, calculation tests, fonts, offline tools, and documentation.
- Adapted: TanStack file routes, client-only dynamic imports, TypeScript annotation removal for imported modules, fixture read paths, CSS token registration, and page metadata.
- Preview evidence: `preview-checks.json`; screenshots referenced there were inspected from `/tmp/browser/import-check` during this turn and are temporary.
- Tested sizes: desktop 1280 × 1800, phone 390 × 844.
- Verified: map tiles and terrain visibly render; place search changes selected station; profile advice changes; advice accordion opens; layers menu and heating-smoke switch work; 2D/3D and reset controls work; notifications next step updates; timeline plays, pauses and returns to now; all content pages navigate on the preview origin; sensor count changes ranked results to three; host filter and exposure mode change; zero-compliance burn ban gives −0.00 reduction; heating action, site, and headcount changes update outputs.
- Browser errors: none observed in checked flows.
- Tests: 28 passed across routing, AQI/planning/heating/siting, forecast engine, and forecast feature parity.
- No static map or motion fallbacks were introduced. Live feed/model availability remains dependent on the upstream public services.