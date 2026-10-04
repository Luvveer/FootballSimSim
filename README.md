# FootballSimSim

FootballSimSim lets two five-a-side squads made from historical FIFA player ratings play a seeded, event-by-event match. A player and a FIFA edition form one identity, so Lionel Messi in FIFA 15 and Lionel Messi in FC 24 are separate choices with different attributes.

The production app is available at [footballsimsim.tech](https://footballsimsim.tech).

## What is included

- Player search across FIFA 15 through FC 24, with edition and position filters
- Five formations for each team: `1-2-1`, `2-1-1`, `1-1-2`, `2-0-2`, and `3-0-1`
- Click, drag, swap, clear, and autofill controls for both lineups
- Player details and comparisons between editions
- A deterministic match engine driven by player attributes and a seed
- A timed replay with player movement, restarts, cards, offside decisions, shots, saves, and goals
- Full-time team statistics, player ratings, and Man of the Match

This is custom five-a-side football, not futsal. See [the simulation notes](packages/simulation/README.md) for the rules and known limits.

## Repository layout

```text
apps/
  api/          Fastify routes, dataset preparation, and request validation
  web/          React frontend and match replay
api/
  [...path].ts  Vercel serverless entry point
packages/
  shared/       Types and position normalization shared by every workspace
  simulation/   Seeded match engine and football rules
male_players.csv  Raw local dataset, ignored by Git and Vercel
players.csv       Prepared production dataset, ignored by Git but uploaded by Vercel CLI
vercel.json       Production build, function, and route configuration
```

The npm workspaces compile in dependency order: shared types, simulation, API, then web.

## Requirements

- Node.js 20 or newer
- npm
- `male_players.csv` for the full player library

Install dependencies from the repository root:

```bash
npm install
```

## Player data

The raw source is `male_players.csv` at the repository root. Keep that file unchanged. It is 92 MB in the current local setup and is not committed or deployed.

Prepare the runtime dataset with:

```bash
npm run data:prepare
```

The command writes `players.csv`. The current source produces 180,021 historical player-version records in a 34 MB file. Those are not 180,021 unique people. Each `player_id + fifa_version` pair is a separate record.

Preparation does four things:

1. Keeps the latest update for each `player_id + fifa_version` pair.
2. Normalizes detailed positions into `GK`, `DEF`, `MID`, and `FWD` roles.
3. Keeps the identity, profile, search, and match attributes used by the app.
4. Drops source columns that the app never reads.

You can pass different input and output paths:

```bash
npm run data:prepare -- path/to/source.csv path/to/output.csv
```

The API reads `players.csv` when no explicit path is supplied. If neither full dataset file exists, local development can fall back to the root `test.csv`. Tests use the smaller fixture under `apps/api/test/`. The production Vercel function explicitly loads the root `players.csv` file and never uses either fixture.

Both dataset files are ignored by Git. `.vercelignore` excludes the raw source but intentionally leaves `players.csv` available to a local Vercel CLI deployment. A Git-based Vercel build cannot recreate the full dataset because the source files are not in the repository.

## Local development

Prepare the dataset and compile the internal packages before starting the app:

```bash
npm run data:prepare
npm run build
```

Start the API in one terminal:

```bash
npm run dev:api
```

The API listens on `http://localhost:3001`. Check that the full dataset loaded:

```bash
curl http://localhost:3001/health
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api/*` requests to the local API and removes the `/api` prefix before forwarding them.

## API

Local API routes have no prefix. Production exposes the same routes below `/api` on the frontend domain.

| Method | Local path | Production path | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | `/api/health` | Report API health and loaded record count |
| `GET` | `/players` | `/api/players` | Search and paginate player versions |
| `GET` | `/players/versions` | `/api/players/versions` | List available FIFA editions |
| `GET` | `/players/:playerId` | `/api/players/:playerId` | Get one player, optionally by `version` |
| `GET` | `/players/:playerId/versions` | `/api/players/:playerId/versions` | Get every available edition for one player |
| `POST` | `/matches/simulate` | `/api/matches/simulate` | Validate two lineups and simulate a match |

`GET /players` accepts these query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Name, club, nationality, year, or edition text |
| `version` | One edition or a comma-separated list, such as `24.0,23.0` |
| `position` | `GK`, `DEF`, `MID`, or `FWD` |
| `limit` | Page size from 1 to 100; the default is 30 |
| `offset` | Number of matching records to skip |

The browser requests 40 records per page. Filtering and pagination happen in the API, so the browser never downloads the full CSV.

## Match requests

Each team must contain five selections, exactly one goalkeeper slot, unique slot IDs, and no repeated historical player version within that team. The supported match duration is 1 to 120 minutes. The web app sends 90 minutes.

Selections refer to records already loaded by the API:

```json
{
  "seed": "demo-1",
  "durationMinutes": 90,
  "homeTeam": {
    "id": "home",
    "name": "Home Team",
    "formation": "1-2-1",
    "lineup": [
      {
        "slotId": "GK",
        "role": "GK",
        "playerId": "192119",
        "fifaVersion": "24.0"
      }
    ]
  },
  "awayTeam": {
    "id": "away",
    "name": "Away Team",
    "formation": "2-1-1",
    "lineup": []
  }
}
```

The shortened example shows the shape only. Both `lineup` arrays need five valid entries.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite frontend |
| `npm run dev:api` | Start the Fastify API on port 3001 |
| `npm run data:prepare` | Build shared types and generate `players.csv` |
| `npm run build` | Build every workspace and the production frontend |
| `npm test` | Build internal dependencies and run all test suites |
| `npm run typecheck` | Type-check every workspace |

Run the full check before deploying:

```bash
npm run build
npm test
npm run typecheck
```

## Production deployment

The frontend and API deploy together as one Vercel project. Static frontend files come from `apps/web/dist`; `/api/*` routes go to the Fastify serverless entry point. All other paths return the frontend entry page so `/play` works when opened directly.

The production build needs a prepared `players.csv` in the repository root. Deploy from the local working tree because that file is intentionally absent from Git:

```bash
npm run data:prepare
npm run build
npx vercel link
npx vercel deploy --prod --yes
```

If Vercel blocks a deployment because it cannot match the commit author, fix the Git email or project membership before the next release. The deployment account must have access to the linked project.

After deployment, verify the frontend and data:

```bash
curl -I https://footballsimsim.tech/
curl https://footballsimsim.tech/api/health
curl 'https://footballsimsim.tech/api/players?q=Messi&limit=2'
```

The current production health response is:

```json
{"status":"ok","players":180021}
```

### Domain setup

`footballsimsim.tech` and `www.footballsimsim.tech` are assigned to the Vercel project. The current third-party DNS setup uses these records:

| Type | Host | Value |
| --- | --- | --- |
| `A` | `@` | `76.76.21.21` |
| `A` | `www` | `76.76.21.21` |

Do not leave old GitHub Pages `185.199.*` records or a `www` CNAME to `Joshua-Justus.github.io`; those records send visitors to the old site instead of Vercel.

## Configuration

The frontend uses same-origin `/api` requests by default. No production API environment variable is needed while both parts remain in the same Vercel project.

For a separately hosted API, set `VITE_API_BASE_URL` before building:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

Vite writes this value into the browser bundle. Changing it requires another frontend build.

## Current limits

- The API parses the 34 MB CSV and builds its search indexes when a serverless instance starts. Cold starts and memory use will grow with the dataset.
- Player data is read-only. Updating the dataset requires preparing it again and redeploying.
- Search is an in-memory scan, not a database query.
- There are no user accounts, saved squads, injuries, substitutions, VAR, own goals, extra time, or shootouts.
- The match model is explainable and repeatable, but it is not a physical football engine or a prediction of a real match.

A database becomes worthwhile when the dataset needs frequent updates, administrative editing, or more traffic than the in-memory loader can handle. Until then, the prepared CSV keeps the deployment simple and reproducible.
