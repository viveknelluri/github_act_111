# Idea Check

Describe a business idea. The app searches the web for existing products/startups and patent sites, then writes a blunt verdict: exists / partly exists / not found, closest matches, gaps, suggested changes, patent view, sources, and links to verify manually.

## Deploy to Vercel
1. Push this folder to a GitHub repo (or run `vercel` from it).
2. Import it in Vercel. Framework preset: Vite. No other settings needed.
3. Project Settings > Environment Variables:
   - `ANTHROPIC_API_KEY` = your key. Make it a **Secret / Sensitive** variable. **Never** name it `VITE_...`, that would expose it in the browser.
   - `APP_ACCESS_CODE` = any passphrase (strongly recommended, see below).
   - Optional: `ANTHROPIC_MODEL`, `RATE_LIMIT_PER_HOUR`.
4. Redeploy after adding variables.

Local dev with the API routes: `npm i -g vercel`, copy `.env.example` to `.env.local`, then `vercel dev`. (`npm run dev` serves only the front end.)

## Cost and abuse
Every check makes 3 Claude calls plus web searches, which cost real money (roughly a few cents to tens of cents). A public URL with no access code lets anyone spend your credit. Set `APP_ACCESS_CODE`, set a spend limit in the Anthropic console, and note the built-in rate limit is best effort only (in-memory per instance).

## Limits
- Web search samples patent sites; it is not a full patent search. "None found" never means "no patent exists".
- In India, software per se is hard to patent (Section 3(k), Patents Act). Confirm with a patent agent.
- Screening aid only, not legal advice.

## Tests
`npm test` runs the handlers against a mocked Anthropic API.
