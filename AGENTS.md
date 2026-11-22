<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application architecture

- Keep imported air-quality modules in `src/features/air-quality` as JavaScript/JSX; removing source-only TypeScript annotations preserves the upstream logic without weakening strict checks for project TypeScript.
- Use TanStack file routes for `/`, `/basin`, `/sensors`, and `/heating`; shared browser-only layout and MapLibre views load dynamically after hydration to keep browser state out of SSR.
- Preserve bundled datasets in `public/data` and pure-model tests beside the imported calculations; no account or Cloud service is needed for this upstream browser-only application.
- Keep the upstream visual system in `src/styles.css`, with semantic color tokens, so original layout and CSS cascade remain intact.
- Scope non-map branding to `.app--content` and render its logo conditionally; keep map styles, controls, and layer code unchanged during content-page restyling.
- Keep ranked-list presentation limits in a pure presentation helper so truncating visible sites does not change the solver or map markers.
- Derive health guidance through a pure PM2.5 category helper and pass the selected place/hour reading into the dialog; never substitute PM10 or fabricated values.
