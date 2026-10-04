# Match simulation

This is custom five-a-side football with standard offside and disciplinary
decisions, rather than futsal. Teams have one goalkeeper and four outfield
players. The default match is two 45-minute halves plus added time.

## Implemented rules

- Offside is checked for the participating pass receiver at the kick, against
  both the ball and second-last opponent, in the opponent's half. Level is
  onside. Direct throw-ins, corners and goal kicks are exempt. An offence awards
  the opponents an indirect free kick; another player must touch it before a goal.
- Careless challenges award a free kick; reckless challenges receive yellow;
  excessive force receives red. A second caution sends the player off. Sent-off
  players leave subsequent snapshots and reduce the team's strength.
- Deliberate handball stopping a promising attack receives a caution and a
  direct free kick, or a penalty inside the defending penalty area.
- Advantage can continue a promising attack after a careless foul.
- Last touch determines throw-ins, goal kicks and corners after the ball leaves
  the pitch. Shots can be blocked, held or parried for corners.
- Penalties are taken from the penalty spot, with other players behind the ball
  outside the area and the goalkeeper on the goal line. Indirect free kicks must
  be passed. Opponents keep their distance at kickoffs, free kicks and corners.
- Goals restart with the other side's kickoff. Teams change ends at half-time;
  the other team takes the second-half kickoff.
- Time lost to restarts and discipline is added to each half, including further
  losses during added time. A pending penalty is completed before either whistle.
- This custom format abandons a match if a team has fewer than three players.
  An abandoned result shows the score at stoppage and declares no winner.

## Attribute model and scope

Seeded randomness decides uncertain outcomes; it does not replace attributes.
Passing/control compete with pressure and defending; pace and dribbling decide
duels; positioning influences runs; finishing/composure compete with goalkeeping.
Stamina, role fit and numerical strength affect abilities throughout the match.
The same seed and lineups reproduce the same match.

This is an event model, not a complete implementation of every IFAB law or a
physical tracking system. Body-part geometry, off-ball interference, DOGSO
assessment, penalty encroachment/retakes, goalkeeper handling violations,
injuries, substitutions, VAR, own goals and knockout extra time/shootouts are not
modelled. The five-player minimum and match abandonment threshold are custom
format choices. Rule reference: <https://www.theifab.com/laws/latest/>.

Replay snapshots carry period, direction, active players, cards and live stats.
Offside metadata preserves the positions at the kick; its displayed guide is
labelled "At the pass" to distinguish that decision from interpolated movement.
`durationMinutes` includes added time; `regulationMinutes` does not. The replay
uses that actual timeline for both its clock and progress bar.
