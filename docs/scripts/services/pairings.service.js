import { supabase } from "./supabase.js";

/* ══════════════════════════════════
   PAIRINGS SERVICE
══════════════════════════════════ */

/** Buscar pareamentos de uma sessão */
export async function getPairings(sessionId) {
  const { data, error } = await supabase
    .from("pairings")
    .select(`
      id,
      round_number,
      table_number,
      player_white:player_white (
        id, full_name, rating_rapid, games_played_rapid
      ),
      player_black:player_black (
        id, full_name, rating_rapid, games_played_rapid
      )
    `)
    .eq("tournament_session_id", sessionId)
    .order("round_number", { ascending: true })
    .order("table_number", { ascending: true });

  if (error) throw error;
  return data;
}

/** Gerar pareamentos (admin) */
export async function generatePairings(sessionId) {
  const { data, error } = await supabase.rpc("generate_pairings", {
    p_tournament_session_id: sessionId
  });

  if (error) throw error;
  return data;
}