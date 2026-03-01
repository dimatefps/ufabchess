/* ══════════════════════════════════════════════════════
   ADMIN — Gerenciamento de Sessões de Torneio
══════════════════════════════════════════════════════ */

import { supabase } from "../../scripts/services/supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
  const sessionTournamentSelect = document.getElementById("week-tournament-select");
  const sessionsList            = document.getElementById("weeks-list");

  if (!sessionTournamentSelect || !sessionsList) return;

  // Carregar torneios em andamento no select
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, edition")
    .eq("status", "ongoing")
    .order("created_at", { ascending: false });

  if (tournaments) {
    tournaments.forEach(t => {
      const option       = document.createElement("option");
      option.value       = t.id;
      option.textContent = t.edition ? `${t.name} • Edição ${t.edition}` : t.name;
      sessionTournamentSelect.appendChild(option);
    });
  }

  // ── Criar nova sessão ───────────────────────────────────────
  document.getElementById("btn-create-week")?.addEventListener("click", async () => {
    const tournamentId    = sessionTournamentSelect.value;
    const sessionNumber   = Number(document.getElementById("week-number").value);
    const matchDate       = document.getElementById("week-date").value;
    const maxPlayers      = Number(document.getElementById("week-max-players").value) || 18;

    if (!tournamentId || !sessionNumber || !matchDate) {
      alert("Preencha todos os campos");
      return;
    }

    const { data, error } = await supabase.rpc("create_tournament_session", {
      p_tournament_id:  tournamentId,
      p_session_number: sessionNumber,
      p_match_date:     matchDate,
      p_max_players:    maxPlayers
    });

    if (error) { alert(error.message || "Erro ao criar torneio do dia"); return; }

    alert("Torneio do dia criado com sucesso!");
    loadSessions();
  });

  // ── Listar sessões abertas ──────────────────────────────────
  async function loadSessions() {
    const { data: sessions, error } = await supabase
      .from("tournament_sessions")
      .select(`
        id, session_number, match_date, max_players, status,
        tournaments (name, edition)
      `)
      .in("status", ["open", "in_progress"])
      .order("match_date", { ascending: false });

    if (error) { console.error(error); return; }

    sessionsList.innerHTML = "";

    if (!sessions || sessions.length === 0) {
      sessionsList.innerHTML = `<li class="session-item" style="color:var(--text-muted);justify-content:center;border-style:dashed;">
        Nenhum torneio do dia aberto.
      </li>`;
      return;
    }

    for (const session of sessions) {
      const { count } = await supabase
        .from("tournament_checkins")
        .select("id", { count: "exact", head: true })
        .eq("tournament_session_id", session.id);

      const isOpen    = session.status === "open";
      const spotsLeft = session.max_players - (count || 0);
      const pct       = Math.round(((count || 0) / session.max_players) * 100);

      const li = document.createElement("li");
      li.className = "session-item";
      li.innerHTML = `
        <div class="session-info">
          <div class="session-title">
            <span class="session-num">Torneio ${session.session_number}</span>
            <span class="session-tournament">${session.tournaments?.name || "?"}</span>
            <span class="session-status ${isOpen ? "status-open" : "status-progress"}">
              ${isOpen ? "aberto" : session.status}
            </span>
          </div>
          <div class="session-meta">
            📅 ${session.match_date}
            <span class="session-spots">
              <span class="spots-count">${count || 0}/${session.max_players}</span> jogadores
              ${spotsLeft > 0 ? `· ${spotsLeft} vagas` : "· <span style='color:#f87171'>Lotado</span>"}
            </span>
          </div>
          <div class="spots-bar">
            <div class="spots-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="session-actions"></div>`;

      const actionsEl = li.querySelector(".session-actions");

      // ── Botão Gerar Pareamento ────────────────────────────
      if (session.status === "open") {
        const btnPair = document.createElement("button");
        btnPair.className = "btn-session-pair";
        btnPair.innerHTML = "⚡ Gerar Pareamento";

        btnPair.onclick = async () => {
          if (!confirm(
            `Gerar pareamento para Torneio ${session.session_number}?\n` +
            `Isso fechará o check-in e enviará emails para todos os jogadores.`
          )) return;

          btnPair.disabled   = true;
          btnPair.innerHTML  = "⏳ Gerando...";

          const { data, error } = await supabase.rpc("generate_pairings", {
            p_tournament_session_id: session.id
          });

          if (error || !data?.success) {
            alert(error?.message || data?.error || "Erro ao gerar pareamento.");
            btnPair.disabled  = false;
            btnPair.innerHTML = "⚡ Gerar Pareamento";
            return;
          }

          // Enviar emails via Edge Function
          btnPair.innerHTML = "📧 Enviando emails...";

          const { data: { session: authSession } } = await supabase.auth.getSession();
          const { data: emailData, error: emailError } = await supabase.functions.invoke(
            "notify-pairings",
            {
              body: { tournament_session_id: session.id },
              headers: { Authorization: `Bearer ${authSession?.access_token}` }
            }
          );

          if (emailError) {
            console.error("Erro ao enviar emails:", emailError);
            alert(`✅ Pareamento gerado!\n\n⚠️ Problema ao enviar emails.\nVeja o console.`);
          } else {
            const sent   = emailData?.sent ?? 0;
            const failed = emailData?.results?.filter(r => r.status !== "enviado").length ?? 0;
            let msg = `✅ Pareamento gerado!\n📧 ${sent} emails enviados.`;
            if (failed > 0) msg += `\n⚠️ ${failed} email(s) falharam.`;
            console.log("Emails:", emailData?.results);
            alert(msg);
          }

          loadSessions();
        };

        actionsEl.appendChild(btnPair);
      }

      // ── Botão Encerrar ────────────────────────────────────
      const btnClose    = document.createElement("button");
      btnClose.className = "btn-session-close";
      btnClose.innerHTML = "✕ Encerrar";

      btnClose.onclick = async () => {
        if (!confirm("Encerrar este torneio do dia?")) return;

        const { error } = await supabase
          .from("tournament_sessions")
          .update({ status: "finished" })
          .eq("id", session.id);

        if (error) { alert(error.message); return; }
        loadSessions();
      };

      actionsEl.appendChild(btnClose);
      sessionsList.appendChild(li);
    }
  }

  loadSessions();
});