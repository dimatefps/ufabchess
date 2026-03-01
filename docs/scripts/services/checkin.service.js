import { supabase } from "./supabase.js";

/* ══════════════════════════════════
   CHECK-IN SERVICE
══════════════════════════════════ */

const SESSION_SELECT = `
  id, tournament_id, session_number, match_date, match_time,
  max_players, status,
  tournaments ( name, edition )
`;

/** Buscar TODAS as sessões abertas */
export async function getOpenWeeks() {
  const { data, error } = await supabase
    .from("tournament_sessions")
    .select(SESSION_SELECT)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Compatibilidade — retorna apenas a primeira */
export async function getOpenWeek() {
  const sessions = await getOpenWeeks();
  return sessions[0] ?? null;
}

/** Buscar check-ins de uma sessão */
export async function getCheckins(sessionId) {
  const { data, error } = await supabase
    .from("tournament_checkins")
    .select(`
      id, player_id, checked_in_at,
      players ( full_name, rating_rapid, games_played_rapid )
    `)
    .eq("tournament_session_id", sessionId)
    .order("checked_in_at", { ascending: true });

  if (error) throw error;
  return data;
}

/** Fazer check-in */
export async function doCheckin(sessionId) {
  const { data, error } = await supabase.rpc("checkin_tournament", {
    p_tournament_session_id: sessionId
  });
  if (error) throw error;
  return data;
}

/** Cancelar check-in */
export async function cancelCheckin(sessionId) {
  const { data, error } = await supabase.rpc("cancel_checkin", {
    p_tournament_session_id: sessionId
  });
  if (error) throw error;
  return data;
}

/** Verificar se o jogador logado já fez check-in */
export async function isPlayerCheckedIn(sessionId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) return false;

  const { data } = await supabase
    .from("tournament_checkins")
    .select("id")
    .eq("tournament_session_id", sessionId)
    .eq("player_id", player.id)
    .maybeSingle();

  return !!data;
}

/** Buscar todas as sessões de um torneio */
export async function getWeeksByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_sessions")
    .select("id, session_number, match_date, match_time, max_players, status")
    .eq("tournament_id", tournamentId)
    .order("session_number", { ascending: false });

  if (error) throw error;
  return data;
}