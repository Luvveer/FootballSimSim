# Match simulation

`@footballsimsim/simulation` is the deterministic match engine used by the API. It accepts a validated `MatchConfig` and returns the complete event timeline, replay snapshots, statistics, ratings, and final score.

The package exports two public functions:

- `validateMatchConfig(config)` checks team size, goalkeeper assignments, duplicate selections, and match duration.
- `simulateMatch(config)` runs the match. The same seed and lineups produce the same result.

Build and test the package from the repository root:

```bash
npm run build --workspace @footballsimsim/simulation
npm run test --workspace @footballsimsim/simulation
```

## Match format

This is custom five-a-side football with standard offside and disciplinary decisions, not futsal. Each team has one goalkeeper and four outfield players. A normal match has two 45-minute halves plus added time.

The engine models these rules:

- Offside is checked for the pass receiver when the ball is played. The receiver is compared with the ball and second-last opponent in the opponent's half. A level receiver is onside. Throw-ins, corners, and goal kicks are exempt.
- An offside offence awards an indirect free kick. Another player must touch the ball before a goal can count.
- Careless challenges result in a free kick. Reckless challenges receive a yellow card, and excessive force receives a red card. A second yellow card sends the player off.
- Deliberate handball that stops a promising attack receives a yellow card and a direct free kick, or a penalty inside the defending penalty area.
- The referee can play advantage after a careless foul when the attacking team keeps a promising position.
- Last touch decides throw-ins, goal kicks, and corners. Shots can be blocked, caught, or parried behind for a corner.
- Penalty takers start at the spot, other players stay behind the ball outside the area, and the goalkeeper starts on the goal line.
- Goals restart with the other team's kickoff. Teams change ends at half-time, and the other team starts the second half.
- Time lost to restarts and disciplinary decisions is added to each half. A pending penalty finishes before the whistle.
- A match is abandoned when a team has fewer than three active players. The score at stoppage remains in the result, but there is no winner.

The minimum-player rule is a project choice for this five-a-side format.

## Attribute model

Seeded randomness resolves uncertain actions. Player attributes determine the probabilities.

Passing and ball control compete with pressure and defending. Pace and dribbling affect one-on-one duels. Positioning influences runs, while finishing and composure compete with goalkeeper attributes. Stamina, role fit, and numerical strength change those abilities during the match. Playing someone outside a compatible role applies a penalty.

The engine builds four team ratings before kickoff: attack, control, defence, and goalkeeping. It also adjusts tactics during play. A trailing team raises its line and takes more risk; a late leader protects space and prefers safer possession.

Players retain their positions between events. Pace and remaining energy limit movement. Vision and positioning guide support runs and passing lanes. Defenders press, mark, and keep cover. Goalkeepers adjust their depth and lateral position. Shot distance and angle feed into expected goals and shot outcomes.

## Restarts and replay data

Throw-ins and other dead-ball situations include setup snapshots. The ball stays at the restart point while players move into legal positions. Replay snapshots contain:

- period, clock state, and team direction
- ball and active-player coordinates
- possession and current phase
- energy and card state
- live team statistics and tactics
- restart details when play is stopped

Offside events preserve the positions used for the decision. The frontend labels the guide "At the pass" because replay interpolation may move players after that moment.

`durationMinutes` is the full simulated timeline, including added time. `regulationMinutes` excludes added time. At normal playback speed, one match minute takes one real second. Half-time is a five-second pause in the frontend and does not advance the match clock.

## Deliberate omissions

This is an event model, not a complete IFAB implementation or a physical tracking system. It does not model body-part geometry, off-ball interference, DOGSO, penalty encroachment and retakes, goalkeeper handling violations, injuries, substitutions, VAR, own goals, extra time, or shootouts.

The applicable real-world rules are available from [The IFAB](https://www.theifab.com/laws/latest/). Where the project differs, this document and the tests describe the implemented behavior.
