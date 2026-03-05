import { supabase } from "../services/supabase.js";

/* ══════════════════════════════════════════════════════
   MEU PERFIL — Sistema completo de login, cadastro,
   vinculação e perfil de jogador
   ══════════════════════════════════════════════════════ */

const RATING_BY_LEVEL = {
  iniciante:     1200,
  intermediario: 1400,
  avancado:      1800
};

function getTitleBadge(rating, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed < 10) return "";
  if (rating >= 2000) return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (rating >= 1800) return `<span class="title-badge mf"  title="Mestre Federal">MF</span>`;
  if (rating >= 1600) return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
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
  if (formSignup) { formSignup.style.display = "none"; formSignup.reset(); } // FIX #8: sem duplicar getElementById
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

// FIX #6: Fallback timeout — se o spinner ainda estiver ativo após 8s, vai para login
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

  // FIX #1: usar session.user.email_confirmed_at direto do evento (mais confiável que getUser())
  if (event === "SIGNED_IN" && session?.user?.email_confirmed_at && !isRecoveryMode) {
    isEmailConfirmMode = false;
    if (!_initRunning) await init();
    return;
  }

  // Usuário confirmou email mas sessão ainda não tem email_confirmed_at — mostrar verify
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
  const badge = getTitleBadge(player.rating_rapid, player.games_played_rapid);
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
  const badge    = getTitleBadge(player.rating_rapid, player.games_played_rapid);

  const { count: totalPlayers } = await supabase.from("players").select("id", { count: "exact", head: true });
  const { count: playersAbove } = await supabase.from("players").select("id", { count: "exact", head: true }).gt("rating_rapid", player.rating_rapid ?? 0);
  const rank = (playersAbove ?? 0) + 1;

  if (ownChart) { ownChart.destroy(); ownChart = null; }

  grid.innerHTML = `
    <!-- Header sempre visível -->
    <div class="profile-header-card">
      <div class="p-avatar">${initials}</div>
      <div class="p-info">
        <h2>${badge}${player.full_name}</h2>
        <div class="p-email">${user.email}</div>
        <div class="p-rank">${rank}º de ${totalPlayers ?? "?"} jogadores no ranking</div>
      </div>
    </div>

    <!-- Stats sempre visíveis -->
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

    <!-- Tabs de seção -->
    <div class="profile-section-tabs">
      <button class="psec-tab active" data-tab="torneios">Torneios</button>
    </div>

    <!-- Painel: Torneios (quadrimestral + aberto unificados) -->
    <div class="psec-panel active" id="psec-torneios">
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

  grid.addEventListener("click", async (e) => {
    /* ── Confirmar presença ── */
    if (e.target.id === "btn-checkin") {
      const btn       = e.target;
      const sessionId = btn.dataset.weekId;
      btn.disabled = true; btn.textContent = "Confirmando...";
      const { error } = await supabase.from("tournament_checkins")
        .insert({ tournament_session_id: sessionId, player_id: player.id });
      if (error) {
        btn.disabled = false; btn.textContent = "Confirmar presença";
        alert(error.code === "23505" ? "Você já está confirmado neste torneio." : (error.message || "Erro ao confirmar presença."));
      } else {
        // FIX: salvar e restaurar scroll para não voltar pro topo
        const scrollY = window.scrollY;
        await renderProfileView(player, currentUser);
        window.scrollTo({ top: scrollY, behavior: "instant" });
      }
    }

    /* ── Cancelar presença ── */
    if (e.target.id === "btn-cancel-checkin") {
      const btn       = e.target;
      const sessionId = btn.dataset.weekId;
      if (!confirm("Deseja cancelar sua presença neste torneio?")) return;
      btn.disabled = true; btn.textContent = "Cancelando...";
      const { error } = await supabase.from("tournament_checkins")
        .delete().eq("tournament_session_id", sessionId).eq("player_id", player.id);
      if (error) {
        btn.disabled = false; btn.textContent = "Cancelar presença";
        alert(error.message || "Erro ao cancelar presença.");
      } else {
        // FIX: salvar e restaurar scroll para não voltar pro topo
        const scrollY = window.scrollY;
        await renderProfileView(player, currentUser);
        window.scrollTo({ top: scrollY, behavior: "instant" });
      }
    }

    /* ── Expandir/recolher lista de inscritos ── */
    if (e.target.classList.contains("btn-ver-inscritos")) {
      const btn       = e.target;
      const sessionId = btn.dataset.sessionId;
      const listEl    = document.getElementById(`inscritos-${sessionId}`);
      if (!listEl) return;
      const hidden = listEl.style.display === "none";
      listEl.style.display = hidden ? "block" : "none";
      btn.textContent = hidden
        ? `▲ Ocultar participantes`
        : `▼ Ver participantes (${btn.dataset.count})`;
    }
  }, { signal: window._gridAbortController.signal });

  await loadOwnRatingChart(player.id);

  /* ── Carregar painel de torneios (unificado) ── */
  buildTorneiosPanel("psec-torneios", player).catch(console.error);

  document.querySelectorAll(".tc-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tc-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderOwnChart(tab.dataset.tc);
    });
  });
}

/* ═══════════════════════════════════════════
   GRÁFICO DE RATING
   ═══════════════════════════════════════════ */

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
  const { data: checkins } = await supabase
    .from("tournament_checkins")
    .select(`id, player_id, checked_in_at, players ( full_name, rating_rapid, games_played_rapid )`)
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

  const dateStr       = formatDate(session.match_date);
  const timeStr       = session.match_time?.slice(0, 5) || "18:15";
  const spotsLeft     = session.max_players - checkinList.length;
  const pct           = Math.min(100, Math.round((checkinList.length / session.max_players) * 100));

  const matchDateTime = new Date(`${session.match_date}T${session.match_time || "18:15:00"}`);
  const deadline      = new Date(matchDateTime.getTime() - 3 * 60 * 60 * 1000);
  const deadlinePassed = new Date() > deadline;
  const deadlineStr   = deadline.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
        const b = getTitleBadge(c.players?.rating_rapid, c.players?.games_played_rapid);
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

      <!-- Barra de progresso de ocupação -->
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
   FIX #2: não chama init() diretamente — deixa o onAuthStateChange fazer isso
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
  if (error) {
    showError(errorEl, "Email ou senha inválidos.");
  }
  // FIX #2: NÃO chama init() aqui — o onAuthStateChange SIGNED_IN vai chamá-lo automaticamente
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
   FIX: IDs corrigidos para bater com o HTML (new-pwd / new-pwd-confirm / new-pwd-message)
   ═══════════════════════════════════════════ */

document.getElementById("btn-save-password")?.addEventListener("click", async () => {
  const pwd     = document.getElementById("new-pwd").value;           // FIX: era "new-password"
  const confirm = document.getElementById("new-pwd-confirm").value;   // FIX: era "confirm-password"
  const msgEl   = document.getElementById("new-pwd-message");         // FIX: era "password-message"
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
   FIX #3: re-fetch currentUser antes de checkPlayerProfile
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
  // FIX #3: buscar usuário atualizado em vez de usar o objeto em memória
  const { data: { user: freshUser } } = await supabase.auth.getUser();
  if (freshUser) { currentUser = freshUser; await checkPlayerProfile(freshUser); }
  else goToAuth();
});

document.getElementById("btn-link-deny")?.addEventListener("click", () => {
  matchedPlayer = null; showRegisterForm(currentUser);
});

/* ═══════════════════════════════════════════
   REGISTER
   FIX #5: ano de nascimento ampliado para 1930
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
  if (!birthYear || birthYear < 1930 || birthYear > 2015) { // FIX #5: era 1950
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
    full_name: fullName,
    email:     currentUser.email.toLowerCase().trim(),
    user_id:   currentUser.id,
    birth_year: birthYear,
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
  const date   = new Date(dateStr + "T12:00:00");
  const days   = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

/* ═══════════════════════════════════════════
   START
   ═══════════════════════════════════════════ */

if (!isEmailConfirmMode) init();