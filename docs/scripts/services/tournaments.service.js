import { supabase } from "./supabase.js";

/* ══════════════════════════════════════════════
   QUADRIMESTRAL — Em andamento
   Retorna o torneio + classificação acumulada
   ══════════════════════════════════════════════ */
export async function getOngoingQuadrimestral() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition, status, type")
    .eq("status", "ongoing")
    .eq("type", "quadrimestral")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   QUADRIMESTRAL — Finalizados
   ══════════════════════════════════════════════ */
export async function getFinishedQuadrimestrais() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition, status, start_date")
    .eq("status", "finished")
    .eq("type", "quadrimestral")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   QUADRIMESTRAL — Classificação atual (ongoing)
   ══════════════════════════════════════════════ */
export async function getOngoingStandings(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points, games_played,
      players ( id, full_name, rating_rapid, rating_blitz, rating_standard, games_played_rapid ),
      tournaments ( time_control )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   QUADRIMESTRAL — Dias (sessões) de um torneio
   Para exibir progresso na aba quadrimestral
   ══════════════════════════════════════════════ */
export async function getSessionsByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_sessions")
    .select("id, session_number, match_date, status")
    .eq("tournament_id", tournamentId)
    .order("session_number");
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   QUADRIMESTRAL — Classificação final (finished)
   ══════════════════════════════════════════════ */
export async function getStandingsByTournament(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points, games_played, rating_at_end,
      players ( id, full_name, games_played_rapid )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   TORNEIO ABERTO — Em andamento ou próximo
   Busca o mais recente com status ongoing ou open
   ══════════════════════════════════════════════ */
export async function getOngoingDiario() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition, status, type")
    .eq("type", "diario")
    .in("status", ["ongoing"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   TORNEIO ABERTO — Histórico (finalizados)
   ══════════════════════════════════════════════ */
export async function getFinishedDiarios() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition, status, start_date")
    .eq("type", "diario")
    .eq("status", "finished")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   TORNEIO ABERTO — Classificação do dia
   (igual ao quadrimestral, usa mesma tabela)
   ══════════════════════════════════════════════ */
export async function getDiarioStandings(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_standings")
    .select(`
      points, games_played,
      players ( id, full_name, rating_rapid, games_played_rapid ),
      tournaments ( time_control )
    `)
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════
   LEGADO — mantido para compatibilidade
   ══════════════════════════════════════════════ */
export async function getOngoingTournament() {
  return getOngoingQuadrimestral();
}
export async function getFinishedTournaments() {
  return getFinishedQuadrimestrais();
}