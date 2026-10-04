import type { MatchResult, Player } from './types'

export const demoPlayers: Player[] = [
  { id:'messi-15', name:'Lionel Messi', version:'FIFA 15', rating:93, position:'FWD', club:'FC Barcelona', nationality:'Argentina', pace:93, shooting:89, passing:86, dribbling:96, defending:27, physical:62 },
  { id:'ronaldo-17', name:'Cristiano Ronaldo', version:'FIFA 17', rating:94, position:'FWD', club:'Real Madrid', nationality:'Portugal', pace:92, shooting:92, passing:81, dribbling:91, defending:33, physical:80 },
  { id:'neymar-18', name:'Neymar Jr', version:'FIFA 18', rating:92, position:'FWD', club:'Paris SG', nationality:'Brazil', pace:92, shooting:84, passing:83, dribbling:94, defending:30, physical:60 },
  { id:'iniesta-12', name:'Andrés Iniesta', version:'FIFA 12', rating:91, position:'MID', club:'FC Barcelona', nationality:'Spain', pace:78, shooting:72, passing:91, dribbling:95, defending:68, physical:62 },
  { id:'buffon-07', name:'Gianluigi Buffon', version:'FIFA 07', rating:93, position:'GK', club:'Juventus', nationality:'Italy', pace:58, shooting:18, passing:71, dribbling:35, defending:92, physical:88 },
  { id:'mbappe-22', name:'Kylian Mbappé', version:'FIFA 22', rating:91, position:'FWD', club:'Paris SG', nationality:'France', pace:97, shooting:88, passing:80, dribbling:92, defending:36, physical:77 },
  { id:'henry-05', name:'Thierry Henry', version:'FIFA 05', rating:97, position:'FWD', club:'Arsenal', nationality:'France', pace:96, shooting:93, passing:85, dribbling:93, defending:38, physical:82 },
  { id:'modric-19', name:'Luka Modrić', version:'FIFA 19', rating:91, position:'MID', club:'Real Madrid', nationality:'Croatia', pace:76, shooting:76, passing:90, dribbling:91, defending:70, physical:67 },
  { id:'ramos-17', name:'Sergio Ramos', version:'FIFA 17', rating:89, position:'DEF', club:'Real Madrid', nationality:'Spain', pace:78, shooting:63, passing:70, dribbling:71, defending:87, physical:83 },
  { id:'casillas-12', name:'Iker Casillas', version:'FIFA 12', rating:89, position:'GK', club:'Real Madrid', nationality:'Spain', pace:55, shooting:16, passing:68, dribbling:32, defending:91, physical:83 },
  { id:'ronaldinho-06', name:'Ronaldinho', version:'FIFA 06', rating:95, position:'MID', club:'FC Barcelona', nationality:'Brazil', pace:90, shooting:88, passing:93, dribbling:97, defending:36, physical:74 },
  { id:'maldini-05', name:'Paolo Maldini', version:'FIFA 05', rating:94, position:'DEF', club:'AC Milan', nationality:'Italy', pace:86, shooting:56, passing:78, dribbling:75, defending:96, physical:89 },
]

export function demoResult(homeName: string, awayName: string): MatchResult {
  return {
    home: { name: homeName, score: 3, stats: { possession: 54, shots: 10, shotsOnTarget: 6, passAccuracy: 87 } },
    away: { name: awayName, score: 2, stats: { possession: 46, shots: 8, shotsOnTarget: 5, passAccuracy: 82 } },
    events: [
      { minute:0, type:'kickoff', team:'home', player:'', detail:'The match is underway.' },
      { minute:12, type:'goal', team:'home', player:'Lionel Messi', detail:'Drives low into the far corner.', homeScore:1, awayScore:0 },
      { minute:25, type:'save', team:'home', player:'Gianluigi Buffon', detail:'Strong hand to deny Mbappé.' },
      { minute:34, type:'goal', team:'away', player:'Kylian Mbappé', detail:'Finishes a quick move first time.', homeScore:1, awayScore:1 },
      { minute:48, type:'goal', team:'home', player:'Cristiano Ronaldo', detail:'Rises highest and heads home.', homeScore:2, awayScore:1 },
      { minute:63, type:'shot', team:'away', player:'Ronaldinho', detail:'Bends an effort just wide.' },
      { minute:71, type:'goal', team:'away', player:'Thierry Henry', detail:'Rounds the keeper and finishes.', homeScore:2, awayScore:2 },
      { minute:84, type:'goal', team:'home', player:'Lionel Messi', detail:'A late winner from the edge of the area.', homeScore:3, awayScore:2 },
      { minute:90, type:'fulltime', team:'home', player:'', detail:'Full time.' },
    ],
    playerRatings: [
      { player:'Lionel Messi', team:'home', rating:9.4 }, { player:'Cristiano Ronaldo', team:'home', rating:8.1 },
      { player:'Kylian Mbappé', team:'away', rating:8.3 }, { player:'Thierry Henry', team:'away', rating:8.0 },
    ],
    manOfTheMatch: { player:'Lionel Messi', rating:9.4 },
  }
}
