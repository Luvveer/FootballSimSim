# FootballSimSim

FootballSimSim is a StormHacks 2026 project about the football teams people argue over but can never actually put on the same pitch. Users build two five-a-side teams from historical FIFA player data, then watch an event-by-event match simulation driven by those players' attributes.

The core rule is simple: a player and a FIFA version form one historical player identity. Lionel Messi in FIFA 15, FIFA 18, and FIFA 22 are three selectable versions with different attributes. We should preserve that distinction throughout player search, team building, simulation, statistics, and presentation.

The first working prototype is implemented. The repository contains the web app, API, shared TypeScript contracts, simulation engine, and automated tests.

## Local setup

### Prerequisites

Install the following before starting:

- Node.js 20 or newer
- npm, which is included with Node.js
- A local FIFA dataset named `male_players.csv`, or the smaller `test.csv` fixture

Both dataset filenames are intentionally ignored by Git. Ask another team member for the current file and place it at the repository root. The API prefers `male_players.csv` and falls back to `test.csv`:

```text
FootballSimSim/
  male_players.csv
```

Do not remove columns from the CSV. The API reads the original headers and expects, at minimum, player identity, FIFA version, position, and rating fields. The current fixture contains 10 records, including two goalkeepers.

### Install dependencies

From the repository root, run:

```bash
npm install
npm run build
```

`npm install` installs every workspace, including the frontend, API, shared contracts, and simulation engine. `npm run build` then creates the generated `dist` files used by the workspace imports.

The initial build is required on a fresh clone. The API imports `@footballsimsim/shared` and `@footballsimsim/simulation` from their compiled output, and those `dist` directories are not stored in Git. Without the build, `npm run dev:api` can fail because it cannot resolve those packages. No environment file is needed for local development.

### Run the application

After `npm run build` finishes successfully, the frontend and API run as separate development processes. Open two terminals at the repository root.

Terminal 1 starts the API:

```bash
npm run dev:api
```

The API will be available at `http://localhost:3001`. Check it with:

```bash
curl http://localhost:3001/health
```

Terminal 2 starts the web app:

```bash
npm run dev
```

Open `http://localhost:5173` in a browser. Vite forwards requests beginning with `/api` to the local Fastify server, so both development processes must be running to use the real player data and match engine. The frontend has demo fallback data, but that fallback should not be used to verify backend work.

The complete first-time setup order is:

```bash
npm install
npm run build
```

Then keep these running in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev
```

### Verify your changes

Run these commands from the repository root before handing work to another teammate:

```bash
npm test
npm run typecheck
npm run build
```

- `npm test` runs the API and simulation tests.
- `npm run typecheck` checks the TypeScript workspace packages.
- `npm run build` creates production builds in dependency order.

The compiled frontend is written to `apps/web/dist`. The compiled API and internal packages write to their own `dist` directories. Build output and installed dependencies are ignored by Git.

### Useful development URLs

| Service | URL |
| --- | --- |
| Web app | `http://localhost:5173` |
| API health check | `http://localhost:3001/health` |
| Player search | `http://localhost:3001/players` |
| Available FIFA versions | `http://localhost:3001/players/versions` |
| One player's FIFA history | `http://localhost:3001/players/:playerId/versions` |
| Match simulation | `POST http://localhost:3001/matches/simulate` |

If the API fails during startup, first confirm that `test.csv` exists at the repository root and still has its header row. If the web app cannot load players, confirm that the API is running on port 3001, then use the retry button.

### Large dataset behavior

The same loader supports the current 10-row fixture and the intended dataset of roughly 180,000 rows. The API reads the CSV once at startup, preserves every column, builds indexed historical-player lookups, and precomputes searchable names, clubs, nationalities, versions, and positions.

The player browser requests 40 records at a time. Search and position filters run on the API, and the Load more button requests the next page using `limit` and `offset`. The browser never downloads the full dataset.

This is an in-memory prototype, so API startup and memory use will grow with the CSV. A synthetic 180,000-row load is part of the development verification process. Moving the full dataset into a database remains a later decision, not a requirement for running the simulator.

## What we are building

A user will be able to:

1. Search for a real player.
2. Choose a specific FIFA version of that player.
3. Inspect a player card with the version, club, nationality, normalized role, overall rating, and headline attributes.
4. Compare two FIFA versions of the same player using exact attribute changes and a radar chart.
5. Place five historical player versions into a lineup.
6. Build or select an opposing lineup.
7. Start a simulated match.
8. Watch the match unfold through a clock, score, and event timeline.
9. Review the result, team statistics, player statistics, ratings, and Man of the Match.

The result will come from an explainable probability model. Individual actions will compare relevant FIFA attributes, position and role context, and controlled randomness. Overall team rating may inform broad balance, but it will not decide the match by itself. A seed should make a simulation reproducible for tests and live demos.

The first version is a web demo built for judges to understand within a minute. It needs believable football, a polished match presentation, and a clean explanation of why events happened. It does not need a physics engine or every law of football.

## Current data

`test.csv` is the prototype data source. It currently contains 10 player records plus the header, which is enough for two five-a-side teams as long as it includes two usable goalkeepers. Opposing teams may select the same historical player version, so the fixture can still support an end-to-end demo if its positional coverage is uneven.

For now:

- Keep every original column.
- Do not clean, reshape, or reduce the dataset.
- Load data locally from CSV or an in-memory representation derived from it.
- Do not introduce a production database before the match engine works.
- Treat `player_id + fifa_version` as the provisional historical identity.
- Confirm how `fifa_update` should affect identity if the full dataset contains several updates for one player and FIFA version.

The intended historical range is FIFA 15 through FIFA 23.

## Assumptions to confirm

These are working recommendations, not settled product decisions:

- The hackathon demo will be a desktop-first responsive web app, not a native mobile app.
- Each lineup will have five starters, including one goalkeeper, and no substitutes in the first release.
- The first supported shape will be 1-2-1, with one goalkeeper behind four outfield players. The lineup screen will show those positions on a small-sided pitch.
- Source positions are normalized to `GK`, `DEF`, `MID`, or `FWD`. Multi-position players may belong to more than one normalized role.
- Position selection will be flexible. Any player can occupy any slot, with no hard validation based on their normalized roles.
- A simulated match will cover 90 minutes without extra time, penalties, injuries, or substitutions.
- The live presentation will replay a completed simulation event by event. The backend will calculate the full result first, and the frontend will reveal it on a compressed clock.
- Team tactics will be omitted or limited to one small set of modifiers in the first version.
- The same historical player version cannot appear twice in one lineup, but opposing teams may select the same version.
- The match engine, not an AI model, owns every result and statistic.

## Minimum viable version

The smallest useful demo has one complete path:

1. Load historical players from `test.csv`.
2. Select or load two valid lineups.
3. Simulate a seeded 90-minute match.
4. Generate passes, interceptions, dribbles, shots, saves, and goals.
5. Track the score, possession, passes, shots, shots on target, tackles or interceptions, and saves.
6. Track each player's involvement and basic match statistics.
7. Calculate player ratings and Man of the Match.
8. Return one structured match result.
9. Present the teams, animated clock, event feed, score, and full-time report in the browser.

Assists can be derived from the last successful attacking pass before a goal. Fouls, cards, corners, set pieces, substitutions, injuries, and advanced tactics should wait until this path works reliably.

## Proposed architecture

The recommended shape is a small TypeScript monorepo with four clear areas:

```text
apps/
  web/             player selection, lineups, match presentation, results
  api/             data access, validation, and simulation endpoint
packages/
  shared/          contracts used by the browser, API, and engine
  simulation/      deterministic football logic with no UI dependencies
test.csv           untouched local source fixture, ignored by Git
```

The approved stack is React with Vite for the web app and Node.js with Fastify for the API. Shared contracts and the simulation engine are separate TypeScript workspace packages.

Keeping the simulation in a standalone package gives us three useful properties: it can be tested without a server, several teammates can work against stable shared types, and the same seed produces the same result regardless of the UI.

For hackathon deployment, the web app and API can live in one repository and deploy together or separately. We should choose the least fragile option supported by the final host.

## Shared contracts

The team should agree on a small set of types before parallel implementation begins:

- `HistoricalPlayer`: a FIFA dataset row with a stable historical key.
- `LineupSlot`: a selected player, assigned position, and optional role.
- `Team`: name, formation, and five lineup slots.
- `MatchConfig`: teams, seed, duration, and any approved tactical settings.
- `MatchState`: clock, possession, score, ball area, and active players.
- `MatchEvent`: timestamp, event type, actors, outcome, and human-readable metadata.
- `PlayerMatchStats`: passes, shots, goals, assists, defensive actions, saves, and rating inputs.
- `TeamMatchStats`: possession, passes, shots, shots on target, interceptions, tackles, and saves.
- `MatchResult`: configuration, final state, timeline, team statistics, player statistics, ratings, and Man of the Match.

The event and result contracts are the main boundary between the engine, API, and frontend. They should stay small and versionable.

## Frontend responsibilities

The frontend owns the experience, not the football outcome. Its responsibilities are:

- Search and filter players without losing FIFA-version identity.
- Show clear historical player cards.
- Build and validate a five-player team on a small-sided pitch.
- Configure or select the opponent.
- Submit a match request to the backend.
- Replay returned events against a compressed match clock.
- Animate possession changes, shots, saves, and goals.
- Show the live score and compact team statistics.
- Present a full-time report with player ratings and Man of the Match.
- Explain enough of the model that judges can see the result is data-driven.

The first UI should favor one strong demonstration path over a large navigation system. Accessibility, readable contrast, keyboard behavior, responsive layouts, and reduced-motion handling still matter.

## Backend responsibilities

The backend owns data integrity and every match outcome. Its responsibilities are:

- Load and parse the unchanged player dataset.
- Query players and their available FIFA versions.
- Resolve a historical player by its agreed composite key.
- Validate team size, goalkeeper count, duplicate selections, and positions.
- Accept match configuration through an endpoint such as `POST /matches/simulate`.
- Run the seeded simulation.
- Maintain match state and generate events.
- Aggregate team and player statistics from those events.
- Calculate ratings and Man of the Match.
- Return a complete, typed result to the frontend.

The API should reject invalid teams with useful messages. The browser should not be trusted to calculate probabilities, statistics, or ratings.

## Match simulation approach

The first engine should be a seeded, event-driven state machine. It will advance the match in small variable time steps rather than simulate every physical movement.

At each step it will:

1. Read the current match state, including the team in possession and the ball area.
2. Select an eligible player using position, role, and involvement weights.
3. Choose a plausible action for that player and area of the pitch.
4. Select the opposing player most likely to contest the action.
5. Build an attacking score and defensive score from a short, documented set of FIFA attributes.
6. Convert their difference into a bounded success probability.
7. Draw from the seeded random generator.
8. Emit an event and update the clock, possession, field state, score, and statistics.

A logistic curve is a good starting point for opposed actions:

```text
success probability = min + (max - min) / (1 + exp(-(attack - defense) / scale))
```

The lower and upper bounds keep weak players capable of succeeding and elite players capable of failing. The scale controls how strongly an attribute advantage matters. Every coefficient and bound should be named, centralized, and covered by statistical tests.

Initial action models:

- Pass: short passing, vision, ball control, and composure against interceptions, reactions, and marking awareness.
- Interception: the inverse outcome of a contested pass, credited to the selected defender.
- Dribble: dribbling, ball control, agility, acceleration, and balance against standing tackle, interceptions, reactions, and strength.
- Shot: finishing, shot power, positioning, composure, distance, and angle determine shot quality and whether it is on target.
- Save: goalkeeper reflexes, diving, positioning, and handling oppose the shot quality.
- Goal: an on-target shot that beats the goalkeeper.

The engine should separate action selection from action resolution. This makes the model easier to explain, tune, and test. Team possession can emerge from successful actions and turnovers instead of being assigned as one fixed pre-match percentage.

### Statistical calibration

A believable engine needs batch tests, not just a few entertaining matches. With fixed lineups and many seeds, we should check that:

- Stronger teams win more often without winning every time.
- Shot and goal totals stay within plausible ranges.
- Better passers complete more passes over many matches.
- Better finishers convert more comparable chances.
- Better goalkeepers save more comparable shots.
- Reusing a seed reproduces the exact timeline and result.
- No probability produces impossible values or invalid statistics.

These tests are more useful than hard-coding a desired winner.

## Player match ratings

Ratings will begin at 6.0 and move according to position-aware contributions. Goals, assists, key passes, successful passing, tackles, interceptions, and saves add value. Wasteful shooting, possession losses, errors leading to shots, and goals conceded can reduce it where appropriate.

The first formula should be deliberately small. Goalkeepers and defenders need different weights from forwards, and minutes played should eventually matter. Final ratings will be clamped to the 1.0 to 10.0 range. The same transparent inputs can select Man of the Match.

## Proposed development order

1. Confirm the open product and technical decisions below.
2. Define shared player, team, event, statistics, and result contracts.
3. Build the CSV loader without changing the source columns.
4. Build team validation and small test fixtures.
5. Implement seeded randomness and the minimal event loop.
6. Add the first six event types and state transitions.
7. Aggregate team and player statistics from events.
8. Add ratings and Man of the Match.
9. Run deterministic and batch-calibration tests.
10. Expose the stable engine through the API.
11. Build player search, version selection, and lineup creation.
12. Build the live match view and full-time report.
13. Polish the demo flow and visual design.
14. Consider optional sponsor integrations only after the core path is stable.

Each step should end with something testable. We should not build the full interface while the event contract is still moving.

## Suggested team split

Once work begins, four people or agents can work in parallel after the shared contracts are agreed:

- Simulation owner: probability model, match state, events, seeded randomness, and calibration tests.
- Data and API owner: CSV loader, player queries, validation, endpoint, and API tests.
- Team-builder owner: player search, FIFA-version selection, cards, formation, and lineup validation UI.
- Match-view owner: clock, event timeline, animations, statistics, ratings, and full-time report.

The simulation and API owners should agree on `MatchConfig` and `MatchResult` first. The frontend owners can then develop against saved example responses while backend work continues.

## StormHacks tracks we plan to target

No sponsor service or prize-specific dependency has been approved or integrated. The first three tracks fit the product itself and do not need to influence the match engine.

| Track | Technology or service | Exact use | Why it helps | Status | Complexity | Risk to core work |
| --- | --- | --- | --- | --- | --- | --- |
| Best Sports Analytics | Existing FIFA data and our own statistical engine | Turn historical attributes into event probabilities, match statistics, ratings, and repeatable comparisons | This is the central technical story and produces analytics users can inspect | Required target | Medium | Low |
| Best Game | Core web app and simulation engine | Let users draft historical teams and watch replayable matches | The project already has player choice, uncertainty, replay value, and a clear result | Required target | Medium | Low |
| Best Design Track | React web interface, subject to stack approval | Build the pitch lineup, historical player cards, live match screen, and report | A strong visual match experience makes the simulator understandable in a short judging session | Required target | Medium to high | Medium |
| Best Use of ElevenLabs | ElevenLabs API | Read selected match events as live commentary | Voice could make the demo feel like a broadcast | Optional, not approved | Medium | Medium to high |
| Best Use of Gemini API | Gemini API | Turn completed structured events into pre-match notes or a post-match explanation | It can add personality without deciding the result | Optional, not approved | Medium | Medium |
| Best Use of Tiger Data | Tiger Data | Store event timelines and query simulation trends over time | Time-series analysis could support comparisons across many simulations | Optional, not approved | Medium to high | High |
| Best Use of Snowflake API | Snowflake | Analyze the full historical dataset after the prototype is stable | It may help at full-dataset scale but adds little to the first match | Optional, not approved | High | High |
| TiDB x AI Open Build | TiDB | Search historical players or find statistically similar versions | It may improve discovery when the full dataset is loaded | Optional, not approved | Medium to high | High |
| Best .Tech Domain Name | A `.tech` domain | Give the final deployed demo a memorable URL | Useful for presentation, but it does not improve the simulator | Optional, late-stage | Low | Low |
| Best Use of Solana | Solana | No meaningful use is currently proposed | Blockchain does not solve a core project problem here | Do not target | High | High |
| SSSS Python Track | Python | No meaningful Python component is currently proposed | Rewriting part of a TypeScript system would only chase eligibility | Do not target unless requirements change | High | High |

Before adding ElevenLabs, Gemini, Tiger Data, Snowflake, TiDB, Solana, or any other sponsor technology, we will explain the exact change and ask for approval.

## Main risks

- Simulation credibility: poorly tuned probabilities can produce absurd scores or make ratings feel meaningless.
- Hidden coupling: if UI text depends directly on engine internals, several teammates will block one another.
- Data identity: multiple `fifa_update` rows may make `player_id + fifa_version` ambiguous.
- Position handling: FIFA position fields and derived position-rating columns need a consistent mapping to lineup slots.
- Goalkeeper behavior: outfield and goalkeeper attributes differ enough that generic action logic will not work for both.
- Statistical drift: a match may look plausible while thousands of simulations reveal bias or broken distributions.
- Demo pacing: calculating a result is quick, but replaying 90 minutes must feel lively without taking too long.
- Scope: commentary AI, voice, databases, and prize integrations can consume the time needed to finish the actual game.
- Fixture size: the current 10 records cannot support two unique teams for a full integration test.

## Explicitly deferred

Do not build these until the complete minimum viable match works:

- Production database and dataset cleanup.
- AI-decided results or opaque outcome generation.
- Voice commentary and generated prose commentary.
- Sponsor APIs.
- Blockchain or collectible mechanics.
- Multiplayer accounts, authentication, social features, and saved profiles.
- Transfers, careers, tournaments, leagues, and squad management.
- Substitutions, fatigue systems, injuries, extra time, and penalties.
- Detailed tactics or many formations.
- Full foul, card, corner, free-kick, and offside systems.
- Real-time football physics or player movement simulation.
- Native mobile applications.

## Confirmed decisions

- Build a web app, not a native mobile app.
- Use React and TypeScript for the frontend.
- Use Fastify and TypeScript for the backend.
- Simulate five-a-side matches.
- Let opposing teams select the same historical player version.
- Keep player placement flexible rather than enforcing natural positions.
- Show the formation during player selection, then simulate when the user presses Start Match.
- Replay the match in about 60 seconds.
- Use the latest FIFA update within a FIFA version as the provisional canonical record.
- Keep `test.csv` untouched and use separate fixtures if automated tests need different player coverage.
- Initially target Best Sports Analytics, Best Game, and Best Design.

Implementation began after these decisions were confirmed.
