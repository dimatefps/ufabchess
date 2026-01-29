import { supabase } from "./supabase.js";

export async function getFinishedTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("status", "finished")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getStandingsByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points,
      games_played,
      rating_at_end,
      players (
        full_name
      )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });

  if (error) throw error;
  return data;
}


