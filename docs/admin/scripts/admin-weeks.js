/* ══════════════════════════════════════════════════════
   ADMIN — Gerenciamento de Sessões
   Suporta:
     - Dias do torneio quadrimestral (2 rodadas fixas)
     - Torneios abertos com N rodadas (gerar 1 por vez)
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

  fillSelect("week-tournament-select",   quadrimestrais, "Nenhum torneio quadrimestral em andamento");
  fillSelect("diario-tournament-select", diarios,        "Nenhum torneio aberto em andamento");

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

    const btn = document.getElementById("btn-create-week");
    btn.disabled = true; btn.textContent = "Criando...";

    const { error } = await supabase.rpc("create_tournament_session", {
      p_tournament_id:  tournamentId,
      p_session_number: sessionNumber,
      p_match_date:     matchDate,
      p_max_players:    maxPlayers
    });

    btn.disabled = false; btn.textContent = "+ Criar Dia";
    if (error) { alert(error.message || "Erro ao criar dia."); return; }
    alert(`✅ Dia ${sessionNumber} criado com sucesso!`);
    await loadSessions();
  });

  /* ── Criar Torneio Aberto (diário) ───────────────── */
  document.getElementById("btn-create-diario")?.addEventListener("click", async () => {
    const tournamentId  = document.getElementById("diario-tournament-select").value;
    const matchDate     = document.getElementById("diario-date").value;
    const maxPlayers    = Number(document.getElementById("diario-max-players").value) || 24;
    const totalRounds   = Number(document.getElementById("diario-total-rounds")?.value) || 6;

    if (!tournamentId || !matchDate) {
      alert("Preencha todos os campos."); return;
    }

    const btn = document.getElementById("btn-create-diario");
    btn.disabled = true; btn.textContent = "Criando...";

    const { error } = await supabase.rpc("create_tournament_session", {
      p_tournament_id:  tournamentId,
      p_session_number: 1,
      p_match_date:     matchDate,
      p_max_players:    maxPlayers
    });

    if (error) {
      btn.disabled = false; btn.textContent = "+ Criar Torneio Aberto";
      alert(error.message || "Erro ao criar torneio aberto."); return;
    }

    const { data: session } = await supabase
      .from("tournament_sessions")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("match_date", matchDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.id) {
      await supabase
        .from("tournament_sessions")
        .update({ total_rounds: totalRounds })
        .eq("id", session.id);
    }

    btn.disabled = false; btn.textContent = "+ Criar Torneio Aberto";
    alert(`✅ Torneio aberto criado com ${totalRounds} rodadas!`);
    await loadSessions();
  });

  await loadSessions();
});

/* ══════════════════════════════════════════════════════
   LOAD SESSIONS
══════════════════════════════════════════════════════ */

async function loadSessions() {
  const sessionsList = document.getElementById("weeks-list");
  if (!sessionsList) return;

  sessionsList.innerHTML = `<li style="color:var(--text-muted);font-size:.85rem;padding:10px 0;">Carregando...</li>`;

  const { data: sessions, error } = await supabase
    .from("tournament_sessions")
    .select(`id, session_number, match_date, match_time, max_players, status, total_rounds, current_round, tournaments ( id, name, edition, type )`)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  if (error || !sessions?.length) {
    sessionsList.innerHTML = `
      <li class="session-item" style="color:var(--text-muted);justify-content:center;border-style:dashed;">
        Nenhum dia ou torneio aberto ativo no momento.
      </li>`;
    return;
  }

  const counts = await Promise.all(
    sessions.map(s =>
      supabase
        .from("tournament_checkins")
        .select("id", { count: "exact", head: true })
        .eq("tournament_session_id", s.id)
        .then(({ count }) => count ?? 0)
    )
  );

  sessionsList.innerHTML = "";

  sessions.forEach((session, idx) => {
    const count       = counts[idx];
    const t           = session.tournaments;
    const isDiario    = t?.type === "diario";
    const isOpen      = session.status === "open";
    const spotsLeft   = session.max_players - count;
    const pct         = Math.min(100, Math.round((count / session.max_players) * 100));
    const dateStr     = formatDate(session.match_date);
    const accentColor = isDiario ? "var(--yellow)" : "var(--green)";

    const typeLabel = isDiario
      ? `<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:2px 7px;border-radius:10px;background:rgba(240,192,58,.1);border:1px solid rgba(240,192,58,.2);color:var(--yellow);">🎯 Torneio Aberto</span>`
      : `<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:2px 7px;border-radius:10px;background:rgba(118,150,86,.12);border:1px solid rgba(118,150,86,.25);color:var(--green);">🏆 Quadrimestral</span>`;

    const sessionLabel = isDiario
      ? `${t?.name ?? "Torneio Aberto"}${t?.edition ? ` · Ed. ${t.edition}` : ""}`
      : `Dia ${session.session_number} · ${t?.name ?? "?"}${t?.edition ? ` · Ed. ${t.edition}` : ""}`;

    const statusBadge = isOpen
      ? `<span class="session-status status-open">aberto</span>`
      : `<span class="session-status status-progress">em andamento</span>`;

    // Bloco de rodadas (só diário)
    let roundsHtml = "";
    if (isDiario) {
      const total     = session.total_rounds ?? 6;
      const current   = session.current_round ?? 0;
      const nextRound = current + 1;
      const roundPct  = Math.round((current / total) * 100);

      const pills = Array.from({ length: total }, (_, i) => {
        const r = i + 1; const done = r <= current;
        return `<span style="display:inline-block;min-width:28px;text-align:center;padding:3px 7px;border-radius:20px;font-size:.7rem;font-weight:700;background:${done ? accentColor : "var(--border)"};color:${done ? "#1a1208" : "var(--text-muted)"};">R${r}</span>`;
      }).join("");

      const btnGerar = current < total
        ? `<button class="btn-gerar-rodada" data-session-id="${session.id}" data-round="${nextRound}"
             style="margin-top:10px;background:${accentColor};color:#1a1208;border:none;font-family:inherit;font-size:.78rem;font-weight:700;padding:8px 16px;border-radius:var(--radius-sm);cursor:pointer;transition:opacity .18s;width:auto;">
             ▶ Gerar Rodada ${nextRound} / ${total}
           </button>`
        : `<span style="font-size:.8rem;color:var(--green);font-weight:700;margin-top:10px;display:inline-block;">✅ Todas as ${total} rodadas geradas</span>`;

      roundsHtml = `
        <div style="margin-top:12px;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${pills}</div>
          <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${roundPct}%;background:${accentColor};transition:width .4s;border-radius:2px;"></div>
          </div>
          ${btnGerar}
        </div>`;
    }

    let actionBtns = "";
    if (!isDiario && isOpen) {
      actionBtns += `<button class="btn-session-pair btn-gerar-quadrimestral" data-session-id="${session.id}" data-session-label="${sessionLabel}">⚡ Gerar Pareamento</button>`;
    }
    if (isDiario && isOpen && (session.current_round ?? 0) === 0) {
      actionBtns += `<button class="btn-session-pair btn-gerar-rodada" data-session-id="${session.id}" data-round="1" style="background:var(--yellow);color:#1a1208;">▶ Gerar Rodada 1</button>`;
    }
    actionBtns += `<button class="btn-session-close btn-encerrar" data-session-id="${session.id}" data-label="${sessionLabel}">✕ Encerrar</button>`;

    const li = document.createElement("li");
    li.className = "session-item";
    li.style.borderLeft = `3px solid ${accentColor}`;
    li.innerHTML = `
      <div class="session-info" style="flex:1;">
        <div class="session-title">${typeLabel}<span class="session-num">${sessionLabel}</span>${statusBadge}</div>
        <div class="session-meta">📅 ${dateStr}
          <span class="session-spots">
            <span class="spots-count">${count}/${session.max_players}</span> inscritos
            ${spotsLeft > 0 ? `· ${spotsLeft} vagas` : `· <span style="color:#f87171">Lotado</span>`}
          </span>
        </div>
        <div class="spots-bar" style="margin-top:6px;"><div class="spots-fill" style="width:${pct}%;background:${accentColor};"></div></div>
        ${roundsHtml}
      </div>
      <div class="session-actions" style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">${actionBtns}</div>`;

    sessionsList.appendChild(li);
  });

  /* Bind: Gerar Rodada (diário) */
  sessionsList.querySelectorAll(".btn-gerar-rodada").forEach(btn => {
    btn.addEventListener("click", async () => {
      await generateRoundDiario(btn.dataset.sessionId, Number(btn.dataset.round), btn);
    });
  });

  /* Bind: Gerar Pareamento (quadrimestral) */
  sessionsList.querySelectorAll(".btn-gerar-quadrimestral").forEach(btn => {
    btn.addEventListener("click", async () => {
      await generatePairingQuadrimestral(btn.dataset.sessionId, btn.dataset.sessionLabel, btn);
    });
  });

  /* Bind: Encerrar */
  sessionsList.querySelectorAll(".btn-encerrar").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Encerrar "${btn.dataset.label}"?\nEsta ação não pode ser desfeita.`)) return;
      const { error } = await supabase.from("tournament_sessions").update({ status: "finished" }).eq("id", btn.dataset.sessionId);
      if (error) { alert(error.message || "Erro ao encerrar."); return; }
      await loadSessions();
    });
  });
}

/* ══════════════════════════════════════════════════════
   GERAR RODADA — Torneio Aberto
   Passa round_number pro email → só envia a rodada atual
══════════════════════════════════════════════════════ */

async function generateRoundDiario(sessionId, roundNumber, btn) {
  const original  = btn.textContent;
  btn.disabled    = true;
  btn.textContent = `⏳ Gerando rodada ${roundNumber}…`;

  const { data, error } = await supabase.rpc("generate_round_diario", {
    p_session_id:   sessionId,
    p_round_number: roundNumber
  });

  if (error || data?.success === false) {
    btn.disabled    = false;
    btn.textContent = original;
    alert(`❌ Erro ao gerar rodada ${roundNumber}:\n${data?.error || error?.message || "Erro desconhecido."}`);
    return;
  }

  const total    = data.total_rounds;
  const players  = data.total_players;
  const pairings = data.pairings ?? [];
  const byeId    = data.bye_player;

  const lines = pairings.map(p => `Mesa ${p.board}: ${p.player_white} (${p.rating_white}) × ${p.player_black} (${p.rating_black})`);
  if (byeId) lines.push(`⚠️ BYE: um jogador ficou sem par`);

  alert(`✅ Rodada ${roundNumber} / ${total} gerada!\n${players} jogadores · ${pairings.length} mesas\n\n${lines.join("\n")}`);

  // Email com round_number → filtra só esta rodada
  btn.textContent = "📧 Enviando emails...";
  await sendEmailNotification(sessionId, roundNumber);

  btn.disabled    = false;
  btn.textContent = original;
  await loadSessions();
}

/* ══════════════════════════════════════════════════════
   GERAR PAREAMENTO — Quadrimestral (comportamento original)
   Sem round_number no email → envia todas as rodadas
══════════════════════════════════════════════════════ */

async function generatePairingQuadrimestral(sessionId, label, btn) {
  if (!confirm(`Gerar pareamento para ${label}?\nIsso fechará o check-in e enviará emails.`)) return;

  btn.disabled    = true;
  btn.textContent = "⏳ Gerando...";

  const { data, error } = await supabase.rpc("generate_pairings", {
    p_tournament_session_id: sessionId
  });

  if (error || !data?.success) {
    btn.disabled    = false;
    btn.textContent = "⚡ Gerar Pareamento";
    alert(error?.message || data?.error || "Erro ao gerar pareamento.");
    return;
  }

  btn.textContent = "📧 Enviando emails...";

  try {
    const { data: authData } = await supabase.auth.getSession();
    const { data: emailData, error: emailError } = await supabase.functions.invoke("notify-pairings", {
      body:    { tournament_session_id: sessionId }, // sem round_number → todas as rodadas
      headers: { Authorization: `Bearer ${authData?.session?.access_token}` }
    });

    if (emailError) {
      alert(`✅ Pareamento gerado!\n⚠️ Problema ao enviar emails.`);
    } else {
      const sent   = emailData?.sent ?? 0;
      const failed = (emailData?.results ?? []).filter(r => r.status !== "enviado").length;
      let msg = `✅ Pareamento gerado!\n📧 ${sent} emails enviados.`;
      if (failed > 0) msg += `\n⚠️ ${failed} email(s) falharam.`;
      alert(msg);
    }
  } catch (e) {
    console.warn("Erro ao enviar emails (não crítico):", e);
    alert(`✅ Pareamento gerado!\n⚠️ Não foi possível enviar emails.`);
  }

  btn.disabled    = false;
  btn.textContent = "⚡ Gerar Pareamento";
  await loadSessions();
}

/* ══════════════════════════════════════════════════════
   SEND EMAIL NOTIFICATION
   roundNumber = número da rodada (diário) ou null (quadrimestral)
══════════════════════════════════════════════════════ */

async function sendEmailNotification(sessionId, roundNumber = null) {
  try {
    const { data: authData } = await supabase.auth.getSession();
    const body = roundNumber !== null
      ? { tournament_session_id: sessionId, round_number: roundNumber }
      : { tournament_session_id: sessionId };

    await supabase.functions.invoke("notify-pairings", {
      body,
      headers: { Authorization: `Bearer ${authData?.session?.access_token}` }
    });
  } catch (e) {
    console.warn("Notificação de email falhou (não crítico):", e);
  }
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */

function formatDate(dateStr) {
  const date   = new Date(dateStr + "T12:00:00");
  const days   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}