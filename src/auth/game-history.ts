export type ProfileStatistics = { rounds: number; wins: number; finishes: number; recoveries: number; coins_earned: number; coins_spent: number; competitions_won: number; best_time_ms: number | null };
export type GameHistory = {
  balance: number; statistics: ProfileStatistics | null;
  movements: { id: string; amount: number; kind: string; vehicle_id: string | null; created_at: string }[];
  competitions: { competition_id: string; vehicle_id: string; points: number }[];
  upgrades: { competition_id: string; vehicle_id: string; engine: number; tank: number; air: number }[];
  rounds: { id: string; round_number: number; winner_user_id: string | null; created_at: string }[];
};
