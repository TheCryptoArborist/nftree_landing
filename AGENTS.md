# NFTree production deployment guardrails

These instructions apply to the entire repository.

## Production ownership

- This repository is the single Git source for the Netlify production project `treenft` and the custom domain `nftree.net`.
- The NFTree homepage, Mischief Finance route, Netlify Functions, and Garden Battles under `/battle` are one atomic site published from this repository's `public/` directory.
- Garden Battles is intentionally embedded at `public/battle`; preserving it is required during every NFTree deployment.

## Mandatory deployment method

- Production may be published only by pushing a reviewed commit to this repository's `main` branch and allowing Netlify's Git-connected build to deploy it.
- Never run `netlify deploy --prod`, `netlify deploy -p`, `npx netlify ... --prod`, or any equivalent CLI, MCP, API, or drag-and-drop production publish for the `treenft` project.
- Never deploy `public/battle`, a Garden Battles `dist` directory, `trials`, `leaderboard`, or any other partial directory directly to `treenft`.
- Never run `netlify link` from a Garden Battles workspace or change the `treenft` site ID/domain association.
- Local development commands such as the repository's normal build/lint/test commands are allowed. A local command must not publish production.

## Safe Garden Battles release path

1. Build Garden Battles in its own repository.
2. Copy only the completed Garden Battles browser bundle into this repository's `public/battle/` directory.
3. Do not replace, delete, or deploy the repository root `public/` directory from a Garden Battles build folder.
4. Verify the full NFTree repository before committing:
   - `public/index.html`
   - `public/app.js`
   - `public/r/mischief-finance/index.html`
   - `netlify/functions/nftree-listings.mjs`
   - `netlify/functions/nftree-sale-pools.mjs`
   - `netlify.toml`
   - `public/battle/index.html`
   - `public/battle/trials/index.html`
   - `public/battle/leaderboard/index.html`
5. Run the repository validation commands, including `npm run build`, before pushing.
6. Commit and push through Git. Let Netlify build the entire site from `main`.

## Stop conditions

- Stop before deployment if any NFTree root file, Mischief Finance file, Netlify Function, or Garden Battles entry page is unexpectedly missing.
- Stop if a task requests a direct Netlify production deploy. Use the Git-connected workflow instead.
- Do not alter the currently shipped Garden Battles bundle unless the task explicitly concerns a Garden Battles release.
