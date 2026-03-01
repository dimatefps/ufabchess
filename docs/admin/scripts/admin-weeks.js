/* ══════════════════════════════════════════════════════
   ADMIN — Gerenciamento de Sessões
   Suporta:
     - Dias do torneio quadrimestral
     - Torneios abertos (diários) autônomos
══════════════════════════════════════════════════════ */

import { supabase } from "../../scripts/services/supabase.js";

document.addEventListener("DOMContentLoaded", async () => {

  /* ── Sub-tabs ─────────────────────────────────────── */
  document.querySelectorAll(".admin-subtab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-subtab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-subpanel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`subpanel-${tab.dataset.subtab}`).classList.add("active");
    });
  });

  /* ── Carregar torneios por tipo ───────────────────── */
  const { data: allTournaments } = await supabase
    .from("tournaments")
    .select("id, name, edition, type")
    .eq("status", "ongoing")
    .order("created_at", { ascending: false });

  const quadrimestrais = (allTournaments ?? []).filter(t => t.type === "quadrimestral");
  const diarios        = (allTournaments ?? []).filter(t => t.type === "diario");

  // Preencher selects
  fillSelect("week-tournament-select",    quadrimestrais, "Nenhum torneio quadrimestral em andamento");
  fillSelect("diario-tournament-select",  diarios,        "Nenhum torneio aberto em andamento");

  function fillSelect(id, list, emptyMsg) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = list.length
      ? `<option value="">Selecione</option>` +
        list.map(t => `<option value="${t.id}">${t.edition ? `${t.name} • Ed. ${t.edition}` : t.name}</option>`).join("")
      : `<option value="" disabled>${emptyMsg}</option>`;
  }

  /* ── Criar novo Dia (quadrimestral) ──────────────── */
  document.getElementById("btn-create-week")?.addEventListener("click", async () => {
    const tournamentId  = document.getElementById("week-tournament-select").value;
    const sessionNumber = Number(document.getElementById("week-number").value);
    const matchDate     = document.getElementById("week-date").value;
    const maxPlayers    = Number(document.getElementById("week-max-players").value) || 18;

    if (!tournamentId || !sessionNumber || !matchDate) {
      alert("Preencha todos os campos."); return;
    }

    const { error } = await supabase.rpc("create_tournament_session", {
      p_tournament_id:  tournamentId,
      p_session_number: sessionNumber,
      p_match_date:     matchDate,
      p_max_players:    maxPlayers
    });

    if (error) { alert(error.message || "Erro ao criar dia."); return; }

    alert(`✅ Dia ${sessionNumber} criado com sucesso!`);
    loadSessions();
  });

  /* ── Criar Torneio Aberto (diário) ───────────────── */
  document.getElementById("btn-create-diario")?.addEventListener("click", async () => {
    const tournamentId = document.getElementById("diario-tournament-select").value;
    const matchDate    = document.getElementById("diario-date").value;
    const maxPlayers   = Number(document.getElementById("diario-max-players").value) || 24;

    if (!tournamentId || !matchDate) {
      alert("Preencha todos os campos."); return;
    }

    // Torneio aberto é sempre session_number = 1 (único dia)
    const { error } = await supabase.rpc("create_tournament_session", {
      p_tournament_id:  tournamentId,
      p_session_number: 1,
      p_match_date:     matchDate,
      p_max_players:    maxPlayers
    });

    if (error) { alert(error.message || "Erro ao criar torneio aberto."); return; }

    alert("✅ Torneio aberto criado com sucesso!");
    loadSessions();
  });

  /* ── Listar sessões ativas ────────────────────────── */
  async function loadSessions() {
    const sessionsList = document.getElementById("weeks-list");
    if (!sessionsList) return;

    const { data: sessions, error } = await supabase
      .from("tournament_sessions")
      .select(`
        id, session_number, match_date, max_players, status,
        tournaments ( id, name, edition, type )
      `)
      .in("status", ["open", "in_progress"])
      .order("match_date", { ascending: false });

    if (error) { console.error(error); return; }

    sessionsList.innerHTML = "";

    if (!sessions?.length) {
      sessionsList.innerHTML = `
        <li class="session-item" style="color:var(--text-muted);justify-content:center;border-style:dashed;">
          Nenhum dia ou torneio aberto ativo.
        </li>`;
      return;
    }

    for (const session of sessions) {
      const { count } = await supabase
        .from("tournament_checkins")
        .select("id", { count: "exact", head: true })
        .eq("tournament_session_id", session.id);

      const t        = session.tournaments;
      const isOpen   = session.status === "open";
      const isDiario = t?.type === "diario";
      const spotsLeft = session.max_players - (count || 0);
      const pct       = Math.round(((count || 0) / session.max_players) * 100);

      // Label do item:
      // Quadrimestral → "Dia 3 · Torneio UFABC 2025.1"
      // Diário        → "Torneio Aberto · Nome do Torneio"
      const sessionLabel = isDiario
        ? `Torneio Aberto`
        : `Dia ${session.session_number}`;

      const typeBadgeHtml = isDiario
        ? `<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:2px 7px;border-radius:10px;background:rgba(240,192,58,.1);border:1px solid rgba(240,192,58,.2);color:var(--yellow);">🎯 Aberto</span>`
        : `<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:2px 7px;border-radius:10px;background:rgba(118,150,86,.12);border:1px solid rgba(118,150,86,.25);color:var(--green);">🏆 Quadrimestral</span>`;

      const li = document.createElement("li");
      li.className = "session-item";
      li.innerHTML = `
        <div class="session-info">
          <div class="session-title">
            ${typeBadgeHtml}
            <span class="session-num">${sessionLabel}</span>
            <span class="session-tournament">${t?.name ?? "?"}</span>
            <span class="session-status ${isOpen ? "status-open" : "status-progress"}">
              ${isOpen ? "aberto" : session.status}
            </span>
          </div>
          <div class="session-meta">
            📅 ${session.match_date}
            <span class="session-spots">
              <span class="spots-count">${count || 0}/${session.max_players}</span> inscritos
              ${spotsLeft > 0 ? `· ${spotsLeft} vagas` : `· <span style="color:#f87171">Lotado</span>`}
            </span>
          </div>
          <div class="spots-bar">
            <div class="spots-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="session-actions"></div>`;

      const actionsEl = li.querySelector(".session-actions");

      // ── Botão Gerar Pareamento ──────────────────────
      if (session.status === "open") {
        const btnPair = document.createElement("button");
        btnPair.className = "btn-session-pair";
        btnPair.innerHTML = "⚡ Gerar Pareamento";

        btnPair.onclick = async () => {
          const label = isDiario ? "torneio aberto" : `Dia ${session.session_number}`;
          if (!confirm(`Gerar pareamento para ${label}?\nIsso fechará o check-in e enviará emails.`)) return;

          btnPair.disabled  = true;
          btnPair.innerHTML = "⏳ Gerando...";

          const { data, error } = await supabase.rpc("generate_pairings", {
            p_tournament_session_id: session.id
          });

          if (error || !data?.success) {
            alert(error?.message || data?.error || "Erro ao gerar pareamento.");
            btnPair.disabled  = false;
            btnPair.innerHTML = "⚡ Gerar Pareamento";
            return;
          }

          btnPair.innerHTML = "📧 Enviando emails...";

          const { data: { session: authSession } } = await supabase.auth.getSession();
          const { data: emailData, error: emailError } = await supabase.functions.invoke(
            "notify-pairings",
            {
              body:    { tournament_session_id: session.id },
              headers: { Authorization: `Bearer ${authSession?.access_token}` }
            }
          );

          if (emailError) {
            alert(`✅ Pareamento gerado!\n⚠️ Problema ao enviar emails. Veja o console.`);
          } else {
            const sent   = emailData?.sent ?? 0;
            const failed = emailData?.results?.filter(r => r.status !== "enviado").length ?? 0;
            let msg = `✅ Pareamento gerado!\n📧 ${sent} emails enviados.`;
            if (failed > 0) msg += `\n⚠️ ${failed} email(s) falharam.`;
            alert(msg);
          }

          loadSessions();
        };

        actionsEl.appendChild(btnPair);
      }

      // ── Botão Encerrar ──────────────────────────────
      const btnClose = document.createElement("button");
      btnClose.className = "btn-session-close";
      btnClose.innerHTML = "✕ Encerrar";

      btnClose.onclick = async () => {
        const label = isDiario ? "este torneio aberto" : `o Dia ${session.session_number}`;
        if (!confirm(`Encerrar ${label}?`)) return;

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