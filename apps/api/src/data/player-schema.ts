export const COMPACT_PLAYER_COLUMNS = [
  "player_id", "fifa_version", "short_name", "long_name", "player_roles", "overall", "club_name",
  "nationality_name", "pace", "shooting", "passing", "dribbling", "defending", "physic",
  "attacking_finishing", "skill_ball_control", "movement_agility", "movement_reactions", "power_stamina",
  "power_strength", "mentality_aggression", "mentality_interceptions", "mentality_positioning",
  "mentality_vision", "mentality_penalties", "mentality_composure", "defending_standing_tackle",
  "goalkeeping_diving", "goalkeeping_handling", "goalkeeping_kicking", "goalkeeping_positioning",
  "goalkeeping_reflexes", "goalkeeping_speed",
  "age", "height_cm", "weight_kg", "preferred_foot", "club_jersey_number", "body_type",
  "weak_foot", "skill_moves", "international_reputation", "work_rate",
] as const;

// Profile columns are shown in the player pop-up only. A source file without them still prepares fine.
export const OPTIONAL_PLAYER_COLUMNS: readonly string[] = [
  "age", "height_cm", "weight_kg", "preferred_foot", "club_jersey_number", "body_type",
  "weak_foot", "skill_moves", "international_reputation", "work_rate",
];
