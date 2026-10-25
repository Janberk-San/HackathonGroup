# Data integration

The website serves saved forecasts; no running model is required.

## Refresh

```sh
node scripts/import-partner.mjs /path/to/HackathonGroup-main --prefer-frontend-forecasts
npm run check
npm test
```

The explicit flag uses `frontend_forecasts.csv` when the redundant combined export contains older predictions. City IDs, reporting years, observed rates, national values, and the four-year horizon still require agreement. Without the flag, every value must agree.

Inputs: `exports/frontend_forecasts.csv`, `exports/national_rates_by_year.csv`, and `exports/city_forecasts_vs_national.csv`. Validation comes from `models/training_summary.json`, with the README summary as a fallback. Original inputs and SHA-256 hashes are retained outside the published assets.

## Chart contract

`web/data/city-crime.json` uses schema version 2 and annual rates per 100,000 people. City IDs are seven-digit GEOID strings. Categories are `violent` and `property`.

- `cities[geoid].metrics[category]`: baselineYear, currentRate, predictedYear, predictedRate.
- `national[year].rates[category]`: the matching national rate.
- `provenance.reportedValidation`: model evaluation metrics and source hash.

A forecast is exactly four years after its baseline. Null means unavailable; zero is a valid rate. Map boundaries and police reporting areas may differ. The national rate is not calculated from the displayed cities.

## Model files

`model-pipeline/models/` contains model weights, metadata, importance tables, and the training report. The frontend uses the report’s actual held-out metrics. Median percentage errors are not confidence intervals. Rebuilding the model is a separate offline workflow described in `model-pipeline/README.md`.

## Optional API

Set `mode: 'api'` and `apiBaseUrl` in `web/config.js` to use:

```text
GET /cities/{geoid}/crime-comparison?horizonYears=4&metric=violent
```

Return geoid, unit (`per100000`), metric definition, baselineYear, currentRate, nationalYear, nationalRate, predictedYear, predictedRate, sources, and optional provenance/modelVersion. The provider validates identity, category, units, and years and cancels stale selections.

## Gemma research

`POST /api/ai/research` and `POST /api/ai/chat` accept a city GEOID, category, and optional question. `GET /api/ai/status` returns connection status without secrets.

`server/gemma.js` retrieves grounded Google Search evidence, checks publication metadata on article pages, and asks Gemma to synthesize a short review. Only source IDs from retrieved evidence are accepted. Recent means the past 90 days. Blocked, undated, or failed retrieval is distinct from no relevant coverage. News never modifies model values. Results cache for 15 minutes.

Set `GEMINI_API_KEY` in `.env.local` locally and as a secret through Sites runtime environment variables in production. `GEMMA_MODEL` and `GOOGLE_SEARCH_MODEL` are optional model overrides. Keys stay outside source and browser responses.

The supported server build uses Vinext and the Sites Vite integration. `web/` is authored frontend source; `public/` and `dist/` are generated. Run `npm run build` with Node 22.13+ before publication. `npm run preview:local` runs the shared API handler and map through Node on machines that cannot run the Cloudflare emulator.
