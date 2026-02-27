import { supabase } from "./supabase.js";

/* =========================
   TORNEIOS FINALIZADOS
========================= */

export async function getFinishedTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select(`
      id,
      name,
      edition,
      status,
      start_date
    `)
    .eq("status", "finished")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data;
}

/* =========================
   CLASSIFICAÇÃO FINAL
========================= */

export async function getStandingsByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points,
      games_played,
      rating_at_end,
      players (
        id,
        full_name,
        games_played_rapid
      )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });

  if (error) throw error;
  return data;
}

/* =========================
   TORNEIO EM ANDAMENTO
========================= */

export async function getOngoingTournament() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition, status")
    .eq("status", "ongoing")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* =========================
   CLASSIFICAÇÃO ATUAL
========================= */

export async function getOngoingStandings(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points,
      games_played,
      players (
        id,
        full_name,
        rating_rapid,
        rating_blitz,
        rating_standard,
        games_played_rapid
      ),
      tournaments (
        time_control
      )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });

  if (error) throw error;
  return data;
}