import { supabase } from "../services/supabase.js";

/* ══════════════════════════════════════════════════════
   MEU PERFIL — Sistema completo de login, cadastro,
   vinculação, perfil e registro de resultados pós-torneio
   ══════════════════════════════════════════════════════ */

const RATING_BY_LEVEL = {
  iniciante:     1200,
  intermediario: 1400,
  avancado:      1800
};

function renderTitleBadge(title) {
  if (!title) return "";
  const t = title.toUpperCase();
  if (t === "GMF") return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (t === "MF")  return `<span class="title-badge mf" title="Mestre Federal">MF</span>`;
  if (t === "CMF") return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

/* ═══════════════════════════════════════════
   STATE MANAGEMENT
   ═══════════════════════════════════════════ */

const STATES = ["loading", "auth", "verify", "link", "register", "profile", "new-password"];

function showState(name) {
  STATES.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle("active", s === name);
  });
}

function goToAuth() {
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === "login");
  });
  const formLogin  = document.getElementById("form-login");
  const formSignup = document.getElementById("form-signup");
  if (formLogin)  formLogin.style.display  = "block";
  if (formSignup) { formSignup.style.display = "none"; formSignup.reset(); }
  const resetBox = document.getElementById("reset-box");
  if (resetBox) resetBox.style.display = "none";
  document.querySelectorAll(".form-error, .form-success").forEach(el => el.classList.remove("visible"));
  showState("auth");
}

/* ═══════════════════════════════════════════
   GLOBALS
   ═══════════════════════════════════════════ */

let currentUser   = null;
let matchedPlayer = null;
let myPlayer      = null;
let ownChart      = null;

const _urlHash   = new URLSearchParams(window.location.hash.replace("#", ""));
const _urlParams = new URLSearchParams(window.location.search);
const _urlType   = _urlHash.get("type") || _urlParams.get("type");

let isRecoveryMode     = _urlType === "recovery";
let isEmailConfirmMode = _urlType === "signup";

if (isRecoveryMode)     showState("new-password");
if (isEmailConfirmMode) showState("loading");

// Fallback timeout — spinner infinito após 8s vai para login
setTimeout(() => {
  const loadingEl = document.getElementById("state-loading");
  if (loadingEl?.classList.contains("active")) {
    console.warn("Timeout de loading — redirecionando para auth.");
    goToAuth();
  }
}, 8000);

/* ═══════════════════════════════════════════
   AUTH STATE CHANGE
   ═══════════════════════════════════════════ */

let _initRunning = false;

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    isRecoveryMode = true;
    showState("new-password");
    return;
  }
  if (event === "SIGNED_IN" && session?.user?.email_confirmed_at && !isRecoveryMode) {
    isEmailConfirmMode = false;
    if (!_initRunning) await init();
    return;
  }
  if (event === "SIGNED_IN" && session && !session.user?.email_confirmed_at && !isRecoveryMode) {
    currentUser = session.user;
    document.getElementById("verify-email-display").textContent = session.user.email;
    showState("verify");
    return;
  }
  if (event === "SIGNED_OUT") {
    currentUser = null; matchedPlayer = null; myPlayer = null; ownChart = null;
    if (window._gridAbortController) {
      window._gridAbortController.abort();
      window._gridAbortController = null;
    }
  }
});

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */

async function init() {
  if (isRecoveryMode || isEmailConfirmMode || _initRunning) return;
  _initRunning = true;
  showState("loading");
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) { currentUser = null; goToAuth(); return; }
    currentUser = user;
    if (!user.email_confirmed_at) {
      document.getElementById("verify-email-display").textContent = user.email;
      showState("verify");
      return;
    }
    await checkPlayerProfile(user);
  } catch (err) {
    console.error("Erro no init:", err);
    goToAuth();
  } finally {
    _initRunning = false;
  }
}

/* ═══════════════════════════════════════════
   CHECK PLAYER PROFILE
   ═══════════════════════════════════════════ */

async function checkPlayerProfile(user) {
  const { data: linked } = await supabase
    .from("players").select("*").eq("user_id", user.id).maybeSingle();

  if (linked) { myPlayer = linked; await renderProfileView(linked, user); return; }

  const userEmail = user.email.toLowerCase().trim();
  const { data: emailMatch, error: emailMatchError } = await supabase
    .from("players").select("*").ilike("email", userEmail).is("user_id", null).limit(1).maybeSingle();

  if (emailMatchError) console.error("Erro ao buscar player por email:", emailMatchError);

  if (emailMatch) { matchedPlayer = emailMatch; renderLinkPrompt(emailMatch); return; }

  showRegisterForm(user);
}

/* ═══════════════════════════════════════════
   RENDER: LINK PROMPT
   ═══════════════════════════════════════════ */

function renderLinkPrompt(player) {
  const el    = document.getElementById("link-player-info");
  const badge = renderTitleBadge(player.title);
  el.innerHTML = `
    <div><span class="link-player-name">${badge} ${player.full_name}</span></div>
    <div>
      <span class="link-player-rating">${player.rating_rapid ?? 1400}</span>
      <span class="link-player-games"> · ${player.games_played_rapid ?? 0} partidas</span>
    </div>`;
  showState("link");
}

/* ═══════════════════════════════════════════
   RENDER: REGISTER FORM
   ═══════════════════════════════════════════ */

function showRegisterForm(user) {
  const emailInput = document.getElementById("reg-email");
  if (emailInput) emailInput.value = user.email;
  const nameInput = document.getElementById("reg-name");
  const meta = user.user_metadata;
  if (meta?.full_name && nameInput && !nameInput.value) nameInput.value = meta.full_name;
  showState("register");
}

/* ═══════════════════════════════════════════
   RENDER: PROFILE VIEW
   ═══════════════════════════════════════════ */

async function renderProfileView(player, user) {
  const grid     = document.getElementById("profile-grid");
  const initials = player.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  // O ERRO ESTAVA AQUI: Use 'player.title' em vez de 'c'
  const badge    = renderTitleBadge(player.title);

  const { count: totalPlayers } = await supabase.from("players").select("id", { count: "exact", head: true });
  const { count: playersAbove } = await supabase.from("players").select("id", { count: "exact", head: true }).gt("rating_rapid", player.rating_rapid ?? 0);
  const rank = (playersAbove ?? 0) + 1;

  if (ownChart) { ownChart.destroy(); ownChart = null; }

  grid.innerHTML = `
    <!-- Header -->
    <div class="profile-header-card">
      <div class="p-avatar">${initials}</div>
      <div class="p-info">
        <h2>${badge}${player.full_name}</h2>
        <div class="p-email">${user.email}</div>
        <div class="p-rank">${rank}º de ${totalPlayers ?? "?"} jogadores no ranking</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-card">
      <div class="stat-value">${player.rating_rapid ?? 1400}</div>
      <div class="stat-label">Rating Rápidas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${player.games_played_rapid ?? 0}</div>
      <div class="stat-label">Partidas Jogadas</div>
    </div>

    <!-- Gráfico de evolução -->
    <div class="chart-card">
      <div class="chart-header">
        <span class="card-title" style="margin:0;">Evolução do Rating</span>
        <div class="chart-tc-tabs">
          <button class="tc-tab active" data-tc="rapid">Rápidas</button>
        </div>
      </div>
      <div class="chart-canvas-wrap">
        <canvas id="rating-chart-own"></canvas>
        <div id="chart-own-empty" class="chart-empty" style="display:none;">
          Nenhuma partida registrada ainda.
        </div>
      </div>
    </div>

    <!-- Tabs de seção — agora com "Partidas" -->
    <div class="profile-section-tabs">
      <button class="psec-tab active" data-tab="torneios">Torneios</button>
      <button class="psec-tab" data-tab="partidas" id="tab-partidas">
        Partidas
        <span class="tab-badge" id="badge-partidas" style="display:none;">0</span>
      </button>
    </div>

    <!-- Painel: Torneios -->
    <div class="psec-panel active" id="psec-torneios">
      <div style="color:var(--text-muted);font-size:.88rem;padding:24px 0;">Carregando...</div>
    </div>

    <!-- Painel: Partidas (registro de resultados) -->
    <div class="psec-panel" id="psec-partidas">
      <div style="color:var(--text-muted);font-size:.88rem;padding:24px 0;">Carregando...</div>
    </div>

    <div class="profile-actions" style="grid-column:unset;margin-top:4px;">
      <a href="./pareamento.html" class="btn-secondary">Ver Pareamentos →</a>
      <button class="btn-logout" onclick="handleLogout()">Sair da conta</button>
    </div>`;

  showState("profile");

  if (window._gridAbortController) window._gridAbortController.abort();
  window._gridAbortController = new AbortController();

  /* ── Tabs de seção ── */
  grid.querySelectorAll(".psec-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      grid.querySelectorAll(".psec-tab").forEach(t => t.classList.remove("active"));
      grid.querySelectorAll(".psec-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`psec-${tab.dataset.tab}`).classList.add("active");
    });
  });

  /* ── Delegação de eventos do grid ── */
  grid.addEventListener("click", async (e) => {

    /* ── Confirmar presença ── */
    if (e.target.id === "btn-checkin") {
      const btn = e.target;
      const sessionId = btn.dataset.weekId;
      btn.disabled = true; btn.textContent = "Confirmando...";
      const { error } = await supabase.from("tournament_checkins")
        .insert({ tournament_session_id: sessionId, player_id: player.id });
      if (error) {
        btn.disabled = false; btn.textContent = "Confirmar presença";
        alert(error.code === "23505" ? "Você já está confirmado neste torneio." : (error.message || "Erro ao confirmar presença."));
      } else {
        const scrollY = window.scrollY;
        await renderProfileView(player, currentUser);
        window.scrollTo({ top: scrollY, behavior: "instant" });
      }
    }

    /* ── Cancelar presença ── */
    if (e.target.id === "btn-cancel-checkin") {
      const btn = e.target;
      const sessionId = btn.dataset.weekId;
      if (!confirm("Deseja cancelar sua presença neste torneio?")) return;
      btn.disabled = true; btn.textContent = "Cancelando...";
      const { error } = await supabase.from("tournament_checkins")
        .delete().eq("tournament_session_id", sessionId).eq("player_id", player.id);
      if (error) {
        btn.disabled = false; btn.textContent = "Cancelar presença";
        alert(error.message || "Erro ao cancelar presença.");
      } else {
        const scrollY = window.scrollY;
        await renderProfileView(player, currentUser);
        window.scrollTo({ top: scrollY, behavior: "instant" });
      }
    }

    /* ── Expandir/recolher lista de inscritos ── */
    if (e.target.classList.contains("btn-ver-inscritos")) {
      const btn = e.target;
      const sessionId = btn.dataset.sessionId;
      const listEl = document.getElementById(`inscritos-${sessionId}`);
      if (!listEl) return;
      const hidden = listEl.style.display === "none";
      listEl.style.display = hidden ? "block" : "none";
      btn.textContent = hidden ? `▲ Ocultar participantes` : `▼ Ver participantes (${btn.dataset.count})`;
    }

    /* ── REGISTRAR resultado (partida pendente) ── */
    if (e.target.dataset.action === "report") {
      const btn      = e.target;
      const reportId = btn.dataset.reportId;
      const result   = btn.dataset.result;
      const label    = btn.textContent;
      btn.disabled = true; btn.textContent = "Salvando...";
      const { data, error } = await supabase.rpc("report_match_result", {
        p_pairing_id: reportId,   // aqui passamos o pairing_id
        p_result:     result
      });
      if (error || data?.success === false) {
        btn.disabled = false; btn.textContent = label;
        alert(data?.error || error?.message || "Erro ao registrar resultado.");
      } else {
        await buildPartidasPanel("psec-partidas");
      }
    }

    /* ── CONFIRMAR resultado do adversário ── */
    if (e.target.dataset.action === "confirm") {
      const btn      = e.target;
      const reportId = btn.dataset.reportId;
      btn.disabled = true; btn.textContent = "Confirmando...";
      const { data, error } = await supabase.rpc("confirm_match_result", { p_report_id: reportId });
      if (error || data?.success === false) {
        btn.disabled = false; btn.textContent = "Confirmar";
        alert(data?.error || error?.message || "Erro ao confirmar.");
      } else {
        // Atualizar rating do player localmente e re-renderizar header
        const { data: updatedPlayer } = await supabase.from("players").select("*").eq("id", player.id).maybeSingle();
        if (updatedPlayer) {
          player.rating_rapid       = updatedPlayer.rating_rapid;
          player.games_played_rapid = updatedPlayer.games_played_rapid;
        }
        await buildPartidasPanel("psec-partidas");
        // Atualizar stat-cards na tela sem re-renderizar tudo
        const statCards = grid.querySelectorAll(".stat-card .stat-value");
        if (statCards[0]) statCards[0].textContent = player.rating_rapid ?? 1400;
        if (statCards[1]) statCards[1].textContent = player.games_played_rapid ?? 0;
        await loadOwnRatingChart(player.id);
      }
    }

    /* ── CONTESTAR resultado do adversário ── */
    if (e.target.dataset.action === "dispute") {
      const btn      = e.target;
      const reportId = btn.dataset.reportId;
      const motivo   = prompt("Descreva brevemente o motivo da contestação (opcional):");
      if (motivo === null) return; // cancelou
      btn.disabled = true; btn.textContent = "Contestando...";
      const { data, error } = await supabase.rpc("dispute_match_result", {
        p_report_id: reportId,
        p_reason:    motivo || null
      });
      if (error || data?.success === false) {
        btn.disabled = false; btn.textContent = "Contestar";
        alert(data?.error || error?.message || "Erro ao contestar.");
      } else {
        await buildPartidasPanel("psec-partidas");
      }
    }

  }, { signal: window._gridAbortController.signal });

  await loadOwnRatingChart(player.id);

  /* ── Carregar painéis em paralelo ── */
  buildTorneiosPanel("psec-torneios", player).catch(console.error);
  buildPartidasPanel("psec-partidas").catch(console.error);

  document.querySelectorAll(".tc-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tc-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderOwnChart(tab.dataset.tc);
    });
  });
}

/* ═══════════════════════════════════════════
   PAINEL PARTIDAS — registro pós-torneio
   ═══════════════════════════════════════════ */

async function buildPartidasPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.innerHTML = `<div style="color:var(--text-muted);font-size:.88rem;padding:24px 0;">Carregando...</div>`;

  const { data, error } = await supabase.rpc("get_my_match_reports");

  /* ── Fallback: RPC não existe (migration não deployada) ou outro erro ── */
  // 400 = RPC existe mas crashou internamente (tabela match_reports não existe)
  // 42883 = função não existe
  // Ambos os casos → usar fallback direto nos pairings
  if (error || !data?.success) {
    const fallbackResult = await buildPartidasFromPairings(panel);
    if (fallbackResult) return;
    panel.innerHTML = `
      <div class="report-empty">
        <div style="font-size:1.8rem;margin-bottom:10px;">⏳</div>
        <p>Registro de resultados indisponível no momento.</p>
        <p style="font-size:.8rem;color:var(--text-muted);margin-top:6px;">
          Tente novamente em instantes.
        </p>
      </div>`;
    return;
  }

  const pending    = data.pending    ?? [];
  const toConfirm  = data.to_confirm ?? [];
  const waiting    = data.waiting    ?? [];
  const disputed   = data.disputed   ?? [];
  const history    = data.history    ?? [];

  // Badge na tab com total de ações necessárias
  const actionCount = pending.length + toConfirm.length;
  const badge = document.getElementById("badge-partidas");
  if (badge) {
    badge.textContent = actionCount;
    badge.style.display = actionCount > 0 ? "inline-flex" : "none";
  }

  const totalPendente = pending.length + toConfirm.length + waiting.length + disputed.length;

  if (totalPendente === 0 && history.length === 0) {
    panel.innerHTML = `
      <div class="report-empty">
        <div style="font-size:2rem;margin-bottom:12px;">♟️</div>
        <p>Nenhuma partida registrada ainda.</p>
        <p style="font-size:.82rem;color:var(--text-muted);margin-top:6px;">
          Os resultados aparecem aqui após você registrar suas partidas.
        </p>
      </div>`;
    return;
  }

  let html = "";

  /* ── Seção 1: Precisa confirmar (adversário já reportou) ── */
  if (toConfirm.length > 0) {
    html += `
      <div class="report-section">
        <div class="report-section-title report-urgent">
          🔔 Confirmar resultado — ${toConfirm.length} partida${toConfirm.length > 1 ? "s" : ""}
        </div>
        ${toConfirm.map(r => buildConfirmCard(r)).join("")}
      </div>`;
  }

  /* ── Seção 2: Ainda não reportou ── */
  if (pending.length > 0) {
    html += `
      <div class="report-section">
        <div class="report-section-title">
          📝 Registrar resultado — ${pending.length} partida${pending.length > 1 ? "s" : ""}
        </div>
        ${pending.map(r => buildPendingCard(r)).join("")}
      </div>`;
  }

  /* ── Seção 3: Aguardando confirmação do adversário ── */
  if (waiting.length > 0) {
    html += `
      <div class="report-section">
        <div class="report-section-title report-waiting">
          ⏳ Aguardando confirmação — ${waiting.length} partida${waiting.length > 1 ? "s" : ""}
        </div>
        ${waiting.map(r => buildWaitingCard(r)).join("")}
      </div>`;
  }

  /* ── Seção 4: Em disputa ── */
  if (disputed.length > 0) {
    html += `
      <div class="report-section">
        <div class="report-section-title report-disputed">
          ⚠️ Em disputa — aguardando árbitro
        </div>
        ${disputed.map(r => buildDisputedCard(r)).join("")}
      </div>`;
  }

  /* ── Seção 5: Histórico de partidas confirmadas ── */
  if (history.length > 0) {
    html += `
      <div class="report-section">
        <div class="report-section-title" style="color:var(--text-muted);">
          📋 Histórico — ${history.length} partida${history.length > 1 ? "s" : ""}
        </div>
        ${history.map(r => buildHistoryCard(r)).join("")}
      </div>`;
  }

  panel.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   FALLBACK: busca pairings diretamente quando RPC não existe
   (migration ainda não deployada) ou durante in_progress
══════════════════════════════════════════════════════════════ */

async function buildPartidasFromPairings(panel) {
  try {
    // 1) Descobrir player_id pelo auth.uid()
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: playerRow } = await supabase
      .from("players").select("id").eq("user_id", user.id).maybeSingle();
    if (!playerRow) return false;

    const pid = playerRow.id;

    // 2) Buscar todas as sessões em andamento ou encerradas
    const { data: sessions } = await supabase
      .from("tournament_sessions")
      .select("id, match_date, status, tournaments(name)")
      .in("status", ["open", "in_progress", "finished"])
      .order("match_date", { ascending: false });

    if (!sessions?.length) {
      panel.innerHTML = `
        <div class="report-empty">
          <div style="font-size:2rem;margin-bottom:12px;">✅</div>
          <p>Nenhum torneio encerrado aguardando resultados.</p>
        </div>`;
      return true;
    }

    const sessionIds = sessions.map(s => s.id);
    const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

    // 3) Buscar pairings do jogador nessas sessões
    // IMPORTANTE: usar column:column(fields) e não FK-name hints para evitar erro de nome
    const [whiteRes, blackRes] = await Promise.all([
      supabase.from("pairings")
        .select("id, round_number, player_black, tournament_session_id, player_black:player_black(id, full_name)")
        .eq("player_white", pid)
        .in("tournament_session_id", sessionIds)
        .not("player_black", "is", null),
      supabase.from("pairings")
        .select("id, round_number, player_white, tournament_session_id, player_white:player_white(id, full_name)")
        .eq("player_black", pid)
        .in("tournament_session_id", sessionIds)
        .not("player_white", "is", null),
    ]);

    const whitePairings = (whiteRes.data ?? []).map(p => ({
      pairing_id:      p.id,
      report_id:       p.id,
      round_number:    p.round_number,
      tournament_name: sessionMap[p.tournament_session_id]?.tournaments?.name ?? "Torneio",
      match_date:      sessionMap[p.tournament_session_id]?.match_date,
      is_white:        true,
      opponent_name:   (Array.isArray(p.player_black) ? p.player_black[0] : p.player_black)?.full_name ?? "Adversário",
    }));

    const blackPairings = (blackRes.data ?? []).map(p => ({
      pairing_id:      p.id,
      report_id:       p.id,
      round_number:    p.round_number,
      tournament_name: sessionMap[p.tournament_session_id]?.tournaments?.name ?? "Torneio",
      match_date:      sessionMap[p.tournament_session_id]?.match_date,
      is_white:        false,
      opponent_name:   (Array.isArray(p.player_white) ? p.player_white[0] : p.player_white)?.full_name ?? "Adversário",
    }));

    // 4) Verificar quais pairings já têm resultado registrado
    const allPairings = [...whitePairings, ...blackPairings];
    if (!allPairings.length) {
      panel.innerHTML = `
        <div class="report-empty">
          <div style="font-size:2rem;margin-bottom:12px;">♟</div>
          <p>Nenhuma partida encontrada para registrar.</p>
          <p style="font-size:.82rem;color:var(--text-muted);margin-top:6px;">
            Os resultados aparecem após o encerramento de cada torneio.
          </p>
        </div>`;
      return true;
    }

    const pairingIds = allPairings.map(p => p.pairing_id);

    // Checar matches já registrados — busca por player_white/player_black direto
    // (match.id ≠ pairing.id, são UUIDs independentes)
    const { data: doneMatches } = await supabase
      .from("matches")
      .select("player_white, player_black, round_number")
      .eq("player_white", pid)
      .in("round_number", [...new Set(allPairings.map(p => p.round_number))]);

    const { data: doneMatchesBlack } = await supabase
      .from("matches")
      .select("player_white, player_black, round_number")
      .eq("player_black", pid)
      .in("round_number", [...new Set(allPairings.map(p => p.round_number))]);

    // Chave: round_number é suficiente por sessão (um jogador só joga 1x por rodada)
    const doneRounds = new Set([
      ...(doneMatches ?? []).map(m => m.round_number),
      ...(doneMatchesBlack ?? []).map(m => m.round_number),
    ]);

    // Checar match_reports existentes (pode existir se migration foi deployada)
    let reportedPairings = new Set();
    try {
      const { data: reports } = await supabase
        .from("match_reports")
        .select("pairing_id, status")
        .in("pairing_id", pairingIds)
        .in("status", ["reported", "confirmed", "auto_confirmed", "admin_resolved"]);
      (reports ?? []).forEach(r => reportedPairings.add(r.pairing_id));
    } catch (_) { /* tabela não existe ainda — ok */ }

    const donePairingIds = new Set(reportedPairings);

    const pending = allPairings.filter(p =>
      !donePairingIds.has(p.pairing_id) && !doneRounds.has(p.round_number)
    );

    // Badge
    const badge = document.getElementById("badge-partidas");
    if (badge) {
      badge.textContent = pending.length;
      badge.style.display = pending.length > 0 ? "inline-flex" : "none";
    }

    if (!pending.length) {
      panel.innerHTML = `
        <div class="report-empty">
          <div style="font-size:2rem;margin-bottom:12px;">✅</div>
          <p>Todas as partidas já foram registradas.</p>
        </div>`;
      return true;
    }

    panel.innerHTML = `
      <div class="report-section">
        <div class="report-section-title">
          📝 Registrar resultado — ${pending.length} partida${pending.length > 1 ? "s" : ""}
        </div>
        ${pending.map(r => buildPendingCard(r)).join("")}
      </div>`;

    return true;
  } catch (e) {
    console.warn("Fallback pairings query failed:", e);
    return false;
  }
}

/* ── Helpers de card ── */

function resultLabel(result, isWhite) {
  if (result === "draw")  return "Empate";
  if (result === "white") return isWhite ? "Vitória" : "Derrota";
  if (result === "black") return isWhite ? "Derrota" : "Vitória";
  return "—";
}

function resultColor(result, isWhite) {
  if (result === "draw")  return "var(--text-muted)";
  if (result === "white") return isWhite ? "var(--green)" : "#f87171";
  if (result === "black") return isWhite ? "#f87171" : "var(--green)";
  return "var(--text-muted)";
}

function autoConfirmCountdown(isoDate) {
  if (!isoDate) return "";
  const diff = new Date(isoDate) - new Date();
  if (diff <= 0) return "expira em breve";
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `auto-confirma em ${Math.floor(h / 24)}d`;
  return `auto-confirma em ${h}h`;
}

function matchHeader(r) {
  const side = r.is_white ? "Brancas" : "Pretas";
  return `
    <div class="report-card-meta">
      <span class="report-tournament">${r.tournament_name ?? "Torneio"} · R${r.round_number}</span>
      <span class="report-date">${formatDate(r.match_date)}</span>
    </div>
    <div class="report-matchup">
      <span class="report-opponent">${r.opponent_name}</span>
      <span class="report-side">(você jogou com ${side})</span>
    </div>`;
}

/* Card: partida sem resultado — jogador precisa reportar */
function buildPendingCard(r) {
  return `
    <div class="report-card">
      ${matchHeader(r)}
      <div class="report-actions">
        <span style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px;display:block;">
          Qual foi o resultado?
        </span>
        <div class="report-btns">
          <button class="btn-report btn-win"
            data-action="report"
            data-report-id="${r.pairing_id}"
            data-result="${r.is_white ? "white" : "black"}">
            Ganhei
          </button>
          <button class="btn-report btn-draw"
            data-action="report"
            data-report-id="${r.pairing_id}"
            data-result="draw">
            Empate
          </button>
          <button class="btn-report btn-loss"
            data-action="report"
            data-report-id="${r.pairing_id}"
            data-result="${r.is_white ? "black" : "white"}">
            Perdi
          </button>
        </div>
      </div>
    </div>`;
}

/* Card: adversário reportou — jogador precisa confirmar ou contestar */
function buildConfirmCard(r) {
  const playerResult = resultLabel(r.reported_result, r.is_white);  // do ponto de vista do jogador
  const color        = resultColor(r.reported_result, r.is_white);
  const countdown    = autoConfirmCountdown(r.auto_confirm_at);
  const isDraw       = r.reported_result === "draw";
  const isWin        = (r.reported_result === "white" && r.is_white) || (r.reported_result === "black" && !r.is_white);

  const resultIcon  = isDraw ? "🤝" : isWin ? "🏆" : "❌";
  const resultBig   = isDraw ? "EMPATE" : isWin ? "VOCÊ VENCEU" : "VOCÊ PERDEU";
  const subtext     = isDraw
    ? `${r.reported_by_name ?? "Seu adversário"} registrou empate nesta partida`
    : isWin
      ? `${r.reported_by_name ?? "Seu adversário"} confirmou sua vitória nesta partida`
      : `${r.reported_by_name ?? "Seu adversário"} registrou a vitória dele nesta partida`;

  return `
    <div class="report-card report-card-urgent">
      ${matchHeader(r)}
      <div style="
        margin: 12px 0 8px;
        padding: 14px;
        background: ${color}18;
        border: 1px solid ${color}44;
        border-radius: var(--radius-sm);
        text-align: center;
      ">
        <div style="font-size:1.6rem;margin-bottom:4px;">${resultIcon}</div>
        <div style="font-size:1.1rem;font-weight:800;color:${color};letter-spacing:.5px;">
          ${resultBig}
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
          ${subtext}
        </div>
      </div>
      <div style="font-size:.74rem;color:var(--text-muted);margin-bottom:10px;text-align:center;">
        ${countdown ? `⏱ ${countdown} sem resposta` : ""}
      </div>
      <div class="report-btns">
        <button class="btn-report btn-confirm"
          data-action="confirm"
          data-report-id="${r.report_id}">
          ✓ Confirmar resultado
        </button>
        <button class="btn-report btn-dispute"
          data-action="dispute"
          data-report-id="${r.report_id}">
          ✗ Contestar
        </button>
      </div>
    </div>`; }

/* Card: você reportou, aguardando adversário */
function buildWaitingCard(r) {
  const label = resultLabel(r.reported_result, r.is_white);
  const color = resultColor(r.reported_result, r.is_white);
  const countdown = autoConfirmCountdown(r.auto_confirm_at);
  return `
    <div class="report-card report-card-waiting">
      ${matchHeader(r)}
      <div class="report-result-reported">
        <span style="font-size:.8rem;color:var(--text-muted);">Você reportou:</span>
        <strong style="color:${color};font-size:1rem;margin-left:6px;">${label}</strong>
      </div>
      <div style="font-size:.74rem;color:var(--text-muted);margin-top:6px;">
        Aguardando confirmação de ${r.opponent_name} · ${countdown}
      </div>
    </div>`;
}

/* Card: em disputa com árbitro */
function buildDisputedCard(r) {
  const label = resultLabel(r.reported_result, r.is_white);
  const color = resultColor(r.reported_result, r.is_white);
  return `
    <div class="report-card report-card-disputed">
      ${matchHeader(r)}
      <div class="report-result-reported">
        <span style="font-size:.8rem;color:var(--text-muted);">Resultado contestado:</span>
        <strong style="color:${color};font-size:1rem;margin-left:6px;">${label}</strong>
      </div>
      <div style="font-size:.74rem;color:#f59e0b;margin-top:6px;">
        Um árbitro irá revisar e definir o resultado final.
      </div>
    </div>`;
}

/* Card: partida confirmada — histórico */
function buildHistoryCard(r) {
  const result = r.final_result ?? r.reported_result;
  const label  = resultLabel(result, r.is_white);
  const color  = resultColor(result, r.is_white);
  const isDraw = result === "draw";
  const isWin  = (result === "white" && r.is_white) || (result === "black" && !r.is_white);
  const icon   = isDraw ? "🤝" : isWin ? "🏆" : "❌";
  const statusMap = {
    confirmed:      "Confirmado pelo adversário",
    auto_confirmed: "Confirmado automaticamente",
    admin_resolved: "Resolvido pelo árbitro",
  };
  const statusLabel = statusMap[r.status] ?? "Confirmado";

  return `
    <div class="report-card" style="opacity:.85;border-left:3px solid ${color}66;">
      ${matchHeader(r)}
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
        <span style="font-size:1.3rem;">${icon}</span>
        <div>
          <div style="font-weight:700;color:${color};font-size:.95rem;">${label}</div>
          <div style="font-size:.72rem;color:var(--text-muted);">${statusLabel}</div>
        </div>
      </div>
    </div>`;
}


let allOwnHistory = [];

async function loadOwnRatingChart(playerId) {
  const { data: history } = await supabase
    .from("rating_history")
    .select("rating_before, rating_after, delta, time_control, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });
  allOwnHistory = history ?? [];
  renderOwnChart("rapid");
}

function renderOwnChart(tc) {
  const canvas  = document.getElementById("rating-chart-own");
  const emptyEl = document.getElementById("chart-own-empty");
  if (!canvas) return;
  const filtered = allOwnHistory.filter(h => h.time_control === tc);
  if (!filtered.length) {
    canvas.style.display = "none"; emptyEl.style.display = "block";
    if (ownChart) { ownChart.destroy(); ownChart = null; }
    return;
  }
  canvas.style.display = "block"; emptyEl.style.display = "none";
  const labels = []; const data = [];
  filtered.forEach((h, i) => {
    if (i === 0) { labels.push("Início"); data.push(h.rating_before); }
    labels.push(`#${i + 1}`); data.push(h.rating_after);
  });
  if (ownChart) ownChart.destroy();
  ownChart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 2, pointRadius: data.length > 30 ? 2 : 4, pointBackgroundColor: "#22c55e", tension: 0.3, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} pts` } } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 8, font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   PAINEL TORNEIOS — quadrimestral + aberto
   ═══════════════════════════════════════════ */

async function buildTorneiosPanel(panelId, player) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const { data: sessions } = await supabase
    .from("tournament_sessions")
    .select(`id, tournament_id, session_number, match_date, match_time, max_players, status, tournaments ( name, edition, type )`)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  const quad   = (sessions ?? []).filter(s => s.tournaments?.type === "quadrimestral");
  const diario = (sessions ?? []).filter(s => s.tournaments?.type === "diario");
  const all    = [...quad, ...diario];

  if (!all.length) {
    panel.innerHTML = `
      <div style="text-align:center;padding:48px 20px;background:var(--bg-card);border:1px dashed var(--border);border-radius:var(--radius-md);">
        <div style="font-size:2rem;margin-bottom:12px;">♟️</div>
        <p style="color:var(--text-muted);font-size:.9rem;">Nenhum torneio aberto para inscrição no momento.</p>
      </div>`;
    return;
  }

  const cards = await Promise.all(all.map(s => buildSessionCard(s, player)));
  panel.innerHTML = cards.join("");
}

/* ═══════════════════════════════════════════
   BUILD SESSION CARD
   ═══════════════════════════════════════════ */
async function buildSessionCard(session, player) {
  // 1. ADICIONADO O 'title' AQUI NO SELECT
  const { data: checkins } = await supabase
    .from("tournament_checkins")
    .select(`id, player_id, checked_in_at, players ( full_name, rating_rapid, games_played_rapid, title )`)
    .eq("tournament_session_id", session.id)
    .order("checked_in_at", { ascending: true });

  const checkinList = checkins ?? [];
  const isCheckedIn = checkinList.some(c => c.player_id === player.id);
  const isDiario    = session.tournaments?.type === "diario";

  const accentColor = isDiario ? "var(--yellow)" : "var(--green)";
  const accentText  = isDiario ? "#1a1208"       : "#052e16";
  const typeIcon    = isDiario ? "🎯" : "🏆";
  const typeLabel   = isDiario ? "Torneio Aberto" : "Quadrimestral";

  const tournamentName = session.tournaments?.name || "Torneio";
  const edition        = session.tournaments?.edition ? ` · Edição ${session.tournaments.edition}` : "";
  const sessionLabel   = isDiario
    ? `${typeIcon} ${typeLabel} — ${tournamentName}${edition}`
    : `${typeIcon} ${typeLabel} — Dia ${session.session_number} · ${tournamentName}${edition}`;

  const dateStr        = formatDate(session.match_date);
  const timeStr        = session.match_time?.slice(0, 5) || "18:15";
  const spotsLeft      = session.max_players - checkinList.length;
  const pct            = Math.min(100, Math.round((checkinList.length / session.max_players) * 100));

  const matchDateTime  = new Date(`${session.match_date}T${session.match_time || "18:15:00"}`);
  const deadline       = new Date(matchDateTime.getTime() - 3 * 60 * 60 * 1000);
  const deadlinePassed = new Date() > deadline;
  const deadlineStr    = deadline.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let actionHtml;
  if (isCheckedIn) {
    actionHtml = deadlinePassed
      ? `<span class="checkin-status checkin-confirmed">✓ Presença confirmada</span>`
      : `<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
           <span class="checkin-status checkin-confirmed">✓ Confirmado</span>
           <button id="btn-cancel-checkin" data-week-id="${session.id}"
             style="background:transparent;color:#e88;border:1px solid rgba(200,80,80,.4);
                    font-family:var(--font-body);font-size:.85rem;font-weight:600;
                    padding:8px 16px;border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;">
             Cancelar presença
           </button>
         </div>`;
  } else if (deadlinePassed) {
    actionHtml = `<span style="font-size:.82rem;color:var(--text-muted);">Inscrição encerrada</span>`;
  } else if (spotsLeft <= 0) {
    actionHtml = `<span style="font-size:.82rem;color:#e88;">Vagas esgotadas</span>`;
  } else {
    actionHtml = `<button id="btn-checkin" class="btn-primary" data-week-id="${session.id}"
      style="white-space:nowrap;padding:10px 20px;background:${accentColor};color:${accentText};border-color:${accentColor};">
      Confirmar presença
    </button>`;
  }

  const listHtml = checkinList.length
    ? checkinList.map((c, i) => {
        const b = renderTitleBadge(c.players?.title);
        return `<div class="checkin-player" style="animation-delay:${i * 40}ms">
          <span class="cp-pos">${i + 1}</span>
          <span class="cp-name">${b}${c.players?.full_name || "?"}</span>
          <span class="cp-rating">${c.players?.rating_rapid || "-"}</span>
        </div>`;
      }).join("")
    : `<div style="padding:14px;color:var(--text-muted);font-size:.85rem;">Nenhum jogador confirmado ainda.</div>`;

  return `
    <div class="checkin-card" style="border-left:3px solid ${accentColor};margin-bottom:16px;">
      <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:${accentColor};margin-bottom:12px;">
        ${sessionLabel}
      </div>
      <div class="checkin-event">
        <div class="checkin-event-info">
          <p>📅 ${dateStr} às ${timeStr}</p>
          <p class="slots">
            <strong>${checkinList.length}</strong> / ${session.max_players} confirmados ·
            ${spotsLeft > 0 ? `${spotsLeft} vagas restantes` : "Lotado"}
          </p>
          ${!deadlinePassed ? `<p style="font-size:.76rem;color:var(--text-muted);margin-top:2px;">Prazo: até ${deadlineStr}</p>` : ""}
        </div>
        <div>${actionHtml}</div>
      </div>
      <div style="margin-top:14px;" title="${checkinList.length} de ${session.max_players} vagas (${pct}%)">
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${accentColor};border-radius:3px;transition:width .6s ease;"></div>
        </div>
      </div>
      ${checkinList.length > 0 ? `
      <div style="margin-top:10px;">
        <button class="btn-ver-inscritos"
          data-session-id="${session.id}"
          data-count="${checkinList.length}"
          style="background:none;border:none;color:var(--text-muted);font-family:var(--font-body);
                 font-size:.78rem;font-weight:600;cursor:pointer;padding:4px 0;
                 text-decoration:underline;text-underline-offset:3px;transition:color .18s;">
          ▼ Ver participantes (${checkinList.length})
        </button>
        <div id="inscritos-${session.id}" class="checkin-list" style="display:none;margin-top:10px;">
          <div class="checkin-list-header">Confirmados</div>
          ${listHtml}
        </div>
      </div>` : ""}
    </div>`;
}

/* ═══════════════════════════════════════════
   AUTH — Tab switching
   ═══════════════════════════════════════════ */

document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("form-login").style.display  = target === "login"  ? "block" : "none";
    document.getElementById("form-signup").style.display = target === "signup" ? "block" : "none";
    const resetBox = document.getElementById("reset-box");
    if (resetBox) resetBox.style.display = "none";
    document.querySelectorAll(".form-error, .form-success").forEach(el => el.classList.remove("visible"));
  });
});

/* ═══════════════════════════════════════════
   AUTH — Login
   Não chama init() diretamente — onAuthStateChange faz isso
   ═══════════════════════════════════════════ */

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl  = document.getElementById("login-error");
  errorEl.classList.remove("visible");
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) { showError(errorEl, "Preencha todos os campos."); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Entrando...";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) showError(errorEl, "Email ou senha inválidos.");
});

/* ═══════════════════════════════════════════
   AUTH — Esqueceu a senha
   ═══════════════════════════════════════════ */

document.getElementById("btn-forgot")?.addEventListener("click", () => {
  const box = document.getElementById("reset-box");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
});

document.getElementById("btn-send-reset")?.addEventListener("click", async () => {
  const email = document.getElementById("reset-email").value.trim();
  const msgEl = document.getElementById("reset-message");
  if (!email) { msgEl.style.color = "#e88"; msgEl.textContent = "Digite seu email."; return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/pages/meu-perfil.html"
  });
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = "Erro ao enviar. Verifique o email."; }
  else       { msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Link enviado! Verifique seu email."; }
});

/* ═══════════════════════════════════════════
   AUTH — Nova senha (recovery mode)
   IDs corretos: new-pwd / new-pwd-confirm / new-pwd-message
   ═══════════════════════════════════════════ */

document.getElementById("btn-save-password")?.addEventListener("click", async () => {
  const pwd     = document.getElementById("new-pwd").value;
  const confirm = document.getElementById("new-pwd-confirm").value;
  const msgEl   = document.getElementById("new-pwd-message");
  const btn     = document.getElementById("btn-save-password");
  if (!pwd || pwd.length < 6) { msgEl.style.color = "#e88"; msgEl.textContent = "A senha deve ter pelo menos 6 caracteres."; return; }
  if (pwd !== confirm)        { msgEl.style.color = "#e88"; msgEl.textContent = "As senhas não coincidem."; return; }
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await supabase.auth.updateUser({ password: pwd });
  btn.disabled = false; btn.textContent = "Salvar nova senha";
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = error.message || "Erro ao salvar senha."; }
  else {
    msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Senha redefinida com sucesso!";
    setTimeout(() => { isRecoveryMode = false; init(); }, 1500);
  }
});

/* ═══════════════════════════════════════════
   AUTH — Signup
   ═══════════════════════════════════════════ */

document.getElementById("form-signup")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById("signup-error");
  const successEl = document.getElementById("signup-success");
  errorEl.classList.remove("visible"); successEl.classList.remove("visible");
  const name     = document.getElementById("signup-name").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm  = document.getElementById("signup-password-confirm").value;
  if (!name || !email || !password || !confirm) { showError(errorEl, "Preencha todos os campos."); return; }
  if (password !== confirm) { showError(errorEl, "As senhas não coincidem."); return; }
  if (password.length < 6)  { showError(errorEl, "A senha deve ter pelo menos 6 caracteres."); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Criando conta...";
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/pages/meu-perfil.html?type=signup" }
  });
  btn.disabled = false; btn.textContent = "Criar conta";
  if (error) { showError(errorEl, translateError(error.message)); }
  else {
    document.getElementById("verify-email-display").textContent = email;
    showState("verify");
  }
});

/* ═══════════════════════════════════════════
   VERIFICAÇÃO DE EMAIL
   ═══════════════════════════════════════════ */

window.resendVerification = async function () {
  const btn   = document.getElementById("btn-resend");
  const msgEl = document.getElementById("verify-message");
  btn.disabled = true; btn.textContent = "Enviando...";
  const email = currentUser?.email || document.getElementById("verify-email-display")?.textContent;
  const { error } = await supabase.auth.resend({
    type: "signup", email,
    options: { emailRedirectTo: window.location.origin + "/pages/meu-perfil.html?type=signup" }
  });
  btn.disabled = false; btn.textContent = "Reenviar email";
  msgEl.style.display = "block";
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = "Erro ao reenviar. Tente em alguns minutos."; }
  else       { msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Email reenviado!"; }
};

/* ═══════════════════════════════════════════
   VINCULAR CONTA
   ═══════════════════════════════════════════ */

document.getElementById("btn-link-confirm")?.addEventListener("click", async () => {
  const errorEl = document.getElementById("link-error");
  errorEl.classList.remove("visible");
  if (!matchedPlayer) { showError(errorEl, "Nenhum jogador para vincular."); return; }
  const btn = document.getElementById("btn-link-confirm");
  btn.disabled = true; btn.textContent = "Vinculando...";
  const { data: rpcResult, error } = await supabase.rpc("link_player_to_user", { p_player_id: matchedPlayer.id });
  const rpcFailed = error || rpcResult?.success === false;
  if (rpcFailed) {
    showError(errorEl, error?.message || rpcResult?.error || "Erro ao vincular conta.");
    btn.disabled = false; btn.textContent = "Sim, vincular minha conta";
    return;
  }
  matchedPlayer = null;
  const { data: { user: freshUser } } = await supabase.auth.getUser();
  if (freshUser) { currentUser = freshUser; await checkPlayerProfile(freshUser); }
  else goToAuth();
});

document.getElementById("btn-link-deny")?.addEventListener("click", () => {
  matchedPlayer = null; showRegisterForm(currentUser);
});

/* ═══════════════════════════════════════════
   REGISTER
   ═══════════════════════════════════════════ */

document.getElementById("form-register")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById("register-error");
  errorEl.classList.remove("visible");
  const fullName  = document.getElementById("reg-name").value.trim();
  const birthYear = parseInt(document.getElementById("reg-birth").value);
  const gender    = document.getElementById("reg-gender").value;
  const phone     = document.getElementById("reg-phone").value.trim();
  const ra        = document.getElementById("reg-ra").value.trim() || null;
  const level     = document.getElementById("reg-level").value;
  if (!fullName)  { showError(errorEl, "Preencha seu nome completo."); return; }
  if (!birthYear || birthYear < 1930 || birthYear > 2015) {
    showError(errorEl, "Preencha um ano de nascimento válido (1930–2015)."); return;
  }
  if (!gender)    { showError(errorEl, "Selecione seu gênero."); return; }
  if (!phone)     { showError(errorEl, "Preencha seu telefone."); return; }
  if (!level)     { showError(errorEl, "Selecione seu nível de jogo."); return; }
  if (!currentUser?.email_confirmed_at) {
    showError(errorEl, "Confirme seu email antes de criar o perfil."); return;
  }
  const startingRating = RATING_BY_LEVEL[level] ?? 1400;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Cadastrando...";
  const { error } = await supabase.from("players").insert({
    full_name:          fullName,
    email:              currentUser.email.toLowerCase().trim(),
    user_id:            currentUser.id,
    birth_year:         birthYear,
    gender, phone, ra, level,
    rating_rapid:       startingRating,
    games_played_rapid: 0
  });
  if (error) {
    let msg = error.message || "Erro ao cadastrar.";
    if (msg.includes("unique") || msg.includes("duplicate")) msg = "Esse email já está vinculado a outro jogador.";
    showError(errorEl, msg);
    btn.disabled = false; btn.textContent = "Finalizar cadastro";
    return;
  }
  await checkPlayerProfile(currentUser);
});

/* ═══════════════════════════════════════════
   LOGOUT
   ═══════════════════════════════════════════ */

window.handleLogout = async function () {
  if (ownChart) { ownChart.destroy(); ownChart = null; }
  if (window._gridAbortController) { window._gridAbortController.abort(); window._gridAbortController = null; }
  await supabase.auth.signOut();
  currentUser = null; matchedPlayer = null; myPlayer = null;
  goToAuth();
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function showError(el, msg)   { el.textContent = msg; el.classList.add("visible"); }
function showSuccess(el, msg) { el.textContent = msg; el.classList.add("visible"); }

function translateError(message) {
  if (message.includes("already registered"))   return "Este email já possui uma conta.";
  if (message.includes("valid email"))           return "Insira um email válido.";
  if (message.includes("least 6") || message.includes("at least"))
    return "A senha deve ter pelo menos 6 caracteres.";
  if (message.includes("rate limit") || message.includes("too many") || message.includes("email rate"))
    return "Muitas tentativas. Aguarde 5 minutos e tente novamente.";
  return message;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date   = new Date(dateStr + "T12:00:00");
  const days   = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

/* ═══════════════════════════════════════════
   START
   ═══════════════════════════════════════════ */

if (!isEmailConfirmMode) init();