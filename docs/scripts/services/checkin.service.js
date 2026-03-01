import { supabase } from "./supabase.js";

/* ══════════════════════════════════
   CHECK-IN SERVICE
══════════════════════════════════ */

const WEEK_SELECT = `
  id, tournament_id, week_number, match_date, match_time,
  max_players, status,
  tournaments ( name, edition )
`;

/** Buscar TODAS as semanas abertas (múltiplas) */
export async function getOpenWeeks() {
  const { data, error } = await supabase
    .from("tournament_weeks")
    .select(WEEK_SELECT)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Mantido por compatibilidade — retorna apenas a primeira semana */
export async function getOpenWeek() {
  const weeks = await getOpenWeeks();
  return weeks[0] ?? null;
}

/** Buscar check-ins de uma semana */
export async function getCheckins(weekId) {
  const { data, error } = await supabase
    .from("tournament_checkins")
    .select(`
      id, player_id, checked_in_at,
      players ( full_name, rating_rapid, games_played_rapid )
    `)
    .eq("tournament_week_id", weekId)
    .order("checked_in_at", { ascending: true });

  if (error) throw error;
  return data;
}

/** Fazer check-in */
export async function doCheckin(weekId) {
  const { data, error } = await supabase.rpc("checkin_tournament", {
    p_tournament_week_id: weekId
  });
  if (error) throw error;
  return data;
}

/** Cancelar check-in */
export async function cancelCheckin(weekId) {
  const { data, error } = await supabase.rpc("cancel_checkin", {
    p_tournament_week_id: weekId
  });
  if (error) throw error;
  return data;
}

/** Verificar se o jogador logado já fez check-in em uma semana */
export async function isPlayerCheckedIn(weekId) {
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
    .eq("tournament_week_id", weekId)
    .eq("player_id", player.id)
    .maybeSingle();

  return !!data;
}

/** Buscar todas as semanas de um torneio */
export async function getWeeksByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_weeks")
    .select("id, week_number, match_date, match_time, max_players, status")
    .eq("tournament_id", tournamentId)
    .order("week_number", { ascending: false });

  if (error) throw error;
  return data;
}