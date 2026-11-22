# Breathe Ljubljana

Imported with owner permission from `toshevskasara/black-ducks-adahack`, branch `claude-anze`, revision `8952fdf`.

## Imported application

- `/`: interactive 3D air-quality map, place search, hourly planner, and alerts.
- `/basin`: winter inversions, basin cross-section, and historical statistics.
- `/sensors`: adjustable sensor-site ranking and planning map.
- `/heating`: cleaner-heating scenarios, exposure reduction, and cost estimates.

The original forecast models, fixtures, datasets, documentation, and offline Python tools are retained. Runtime calculations and live public-feed requests run in the browser; no accounts or private API keys are required. Preferences remain device-local, as in the source app.

The four pages now use TanStack file routing instead of the source hash router. Browser-only modules are dynamically loaded after hydration. Imported TS annotations were removed without changing calculation logic; project route files remain strict TypeScript.

Run `bun run test` for all tests, including the original model and planning checks. Import verification passed 28 tests and desktop/phone control checks. The source URL is a repository, not a deployed website, so a paired live-source screenshot/motion comparison was not available. Maps remain interactive, with no static-image substitutions.

## Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
