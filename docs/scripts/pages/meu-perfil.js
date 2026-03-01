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
  if (formSignup) formSignup.style.display = "none";
  const signupForm = document.getElementById("form-signup");
  if (signupForm) signupForm.reset();
  document.querySelectorAll(".form-error, .form-success").forEach(el => el.classList.remove("visible"));
  const resetBox = document.getElementById("reset-box");
  if (resetBox) resetBox.style.display = "none";
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
  if (event === "SIGNED_IN" && session && !isRecoveryMode && isEmailConfirmMode) {
    isEmailConfirmMode = false;
    if (!_initRunning) await init();
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

  let weekHtml = "";
  try {
    weekHtml = await buildCheckinSection(player);
  } catch (err) {
    console.error("Erro ao carregar torneio:", err);
    weekHtml = `
      <div class="checkin-card">
        <div class="card-title">Próximo Torneio</div>
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.9rem;">
          Erro ao carregar informações de torneio.
        </div>
      </div>`;
  }

  if (ownChart) { ownChart.destroy(); ownChart = null; }

  grid.innerHTML = `
    <div class="profile-header-card">
      <div class="p-avatar">${initials}</div>
      <div class="p-info">
        <h2>${badge}${player.full_name}</h2>
        <div class="p-email">${user.email}</div>
        <div class="p-rank">${rank}º de ${totalPlayers ?? "?"} jogadores no ranking</div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-value">${player.rating_rapid ?? 1400}</div>
      <div class="stat-label">Rating Rápidas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${player.games_played_rapid ?? 0}</div>
      <div class="stat-label">Partidas Jogadas</div>
    </div>

    <div class="chart-card">
      <div class="chart-header">
        <div class="card-title" style="margin-bottom:0;">Evolução do Rating</div>
        <div class="chart-tc-tabs">
          <button class="tc-tab active" data-tc="rapid">Rapid</button>
          <button class="tc-tab" data-tc="blitz">Blitz</button>
          <button class="tc-tab" data-tc="standard">Standard</button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="rating-chart-own"></canvas></div>
      <div id="chart-own-empty" class="chart-empty" style="display:none;">
        Nenhuma partida registrada nesta modalidade ainda.
      </div>
    </div>

    ${weekHtml}

    <div class="profile-actions">
      <a href="./pareamento.html" class="btn-secondary">Ver Pareamentos →</a>
      <button class="btn-logout" onclick="handleLogout()">Sair da conta</button>
    </div>`;

  showState("profile");

  if (window._gridAbortController) window._gridAbortController.abort();
  window._gridAbortController = new AbortController();

  grid.addEventListener("click", async (e) => {
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
        await renderProfileView(player, currentUser);
      }
    }

    if (e.target.id === "btn-cancel-checkin") {
      const btn       = e.target;
      const sessionId = btn.dataset.weekId;
      btn.disabled = true; btn.textContent = "Cancelando...";
      const { error } = await supabase.from("tournament_checkins")
        .delete().eq("tournament_session_id", sessionId).eq("player_id", player.id);
      if (error) {
        btn.disabled = false; btn.textContent = "Cancelar presença";
        alert(error.message || "Erro ao cancelar presença.");
      } else {
        await renderProfileView(player, currentUser);
      }
    }
  }, { signal: window._gridAbortController.signal });

  await loadOwnRatingChart(player.id);

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
   BUILD CHECK-IN SECTION — múltiplas sessões
   ═══════════════════════════════════════════ */

async function buildCheckinSection(player) {
  const { data: sessions } = await supabase
    .from("tournament_sessions")
    .select(`
      id, tournament_id, session_number, match_date, match_time,
      max_players, status,
      tournaments ( name, edition )
    `)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  if (!sessions || sessions.length === 0) {
    return `
      <div class="checkin-card">
        <div class="card-title">Próximo Torneio</div>
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.9rem;">
          Nenhum torneio aberto para inscrição no momento.
        </div>
      </div>`;
  }

  const cards = await Promise.all(sessions.map(s => buildSessionCard(s, player)));
  return cards.join("");
}

async function buildSessionCard(session, player) {
  const { data: checkins } = await supabase
    .from("tournament_checkins")
    .select(`id, player_id, checked_in_at, players ( full_name, rating_rapid, games_played_rapid )`)
    .eq("tournament_session_id", session.id)
    .order("checked_in_at", { ascending: true });

  const checkinList    = checkins ?? [];
  const isCheckedIn    = checkinList.some(c => c.player_id === player.id);
  const tournamentName = session.tournaments?.name || "Torneio";
  const edition        = session.tournaments?.edition ? ` · Edição ${session.tournaments.edition}` : "";
  const dateStr        = formatDate(session.match_date);
  const timeStr        = session.match_time?.slice(0, 5) || "18:15";
  const spotsLeft      = session.max_players - checkinList.length;

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
      style="white-space:nowrap;padding:10px 20px;">
      Confirmar presença
    </button>`;
  }

  const listHtml = checkinList.length
    ? checkinList.map((c, i) => {
        const b = getTitleBadge(c.players?.rating_rapid, c.players?.games_played_rapid);
        return `
          <div class="checkin-player" style="animation-delay:${i * 40}ms">
            <span class="cp-pos">${i + 1}</span>
            <span class="cp-name">${b}${c.players?.full_name || "?"}</span>
            <span class="cp-rating">${c.players?.rating_rapid || "-"}</span>
          </div>`;
      }).join("")
    : `<div style="padding:14px;color:var(--text-muted);font-size:.85rem;">Nenhum jogador confirmado ainda.</div>`;

  return `
    <div class="checkin-card">
      <div class="card-title">Torneio ${session.session_number} — ${tournamentName}${edition}</div>
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
      <div class="checkin-list">
        <div class="checkin-list-header">Confirmados</div>
        ${listHtml}
      </div>
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
   ═══════════════════════════════════════════ */

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.classList.remove("visible");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) { showError(errorEl, "Preencha todos os campos."); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Entrando...";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { showError(errorEl, "Email ou senha inválidos."); btn.disabled = false; btn.textContent = "Entrar"; return; }
  await init();
});

document.getElementById("login-password")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.target.closest("form").requestSubmit();
});

/* ═══════════════════════════════════════════
   RESET DE SENHA
   ═══════════════════════════════════════════ */

document.getElementById("btn-forgot")?.addEventListener("click", () => {
  const resetBox = document.getElementById("reset-box");
  const isVisible = resetBox.style.display !== "none";
  resetBox.style.display = isVisible ? "none" : "block";
  if (!isVisible) {
    const loginEmail = document.getElementById("login-email")?.value;
    if (loginEmail) document.getElementById("reset-email").value = loginEmail;
    document.getElementById("reset-message").textContent = "";
  }
});

document.getElementById("btn-send-reset")?.addEventListener("click", async () => {
  const msgEl = document.getElementById("reset-message");
  const email = document.getElementById("reset-email")?.value.trim();
  const btn   = document.getElementById("btn-send-reset");
  if (!email) { msgEl.style.color = "#e88"; msgEl.textContent = "Digite seu email."; return; }
  btn.disabled = true; btn.textContent = "Enviando..."; msgEl.textContent = "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/pages/meu-perfil.html"
  });
  btn.disabled = false; btn.textContent = "Enviar link de redefinição";
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = "Erro ao enviar. Verifique o email e tente novamente."; }
  else { msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Link enviado! Verifique sua caixa de entrada."; }
});

/* ═══════════════════════════════════════════
   NOVA SENHA
   ═══════════════════════════════════════════ */

document.getElementById("btn-save-password")?.addEventListener("click", async () => {
  const msgEl = document.getElementById("new-pwd-message");
  const pwd   = document.getElementById("new-pwd")?.value;
  const confirm = document.getElementById("new-pwd-confirm")?.value;
  const btn   = document.getElementById("btn-save-password");
  msgEl.textContent = "";
  if (!pwd || pwd.length < 6) { msgEl.style.color = "#e88"; msgEl.textContent = "A senha deve ter pelo menos 6 caracteres."; return; }
  if (pwd !== confirm) { msgEl.style.color = "#e88"; msgEl.textContent = "As senhas não coincidem."; return; }
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await supabase.auth.updateUser({ password: pwd });
  btn.disabled = false; btn.textContent = "Salvar nova senha";
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = error.message || "Erro ao salvar senha."; }
  else {
    msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Senha redefinida!";
    setTimeout(() => { isRecoveryMode = false; init(); }, 1500);
  }
});

/* ═══════════════════════════════════════════
   AUTH — Signup
   ═══════════════════════════════════════════ */

document.getElementById("form-signup")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("signup-error");
  const successEl = document.getElementById("signup-success");
  errorEl.classList.remove("visible"); successEl.classList.remove("visible");
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-password-confirm").value;
  if (!name || !email || !password || !confirm) { showError(errorEl, "Preencha todos os campos."); return; }
  if (password !== confirm) { showError(errorEl, "As senhas não coincidem."); return; }
  if (password.length < 6) { showError(errorEl, "A senha deve ter pelo menos 6 caracteres."); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Criando conta...";
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/pages/meu-perfil.html?type=signup" }
  });
  btn.disabled = false; btn.textContent = "Criar conta";
  if (error) { showError(errorEl, translateError(error.message)); }
  else { document.getElementById("verify-email-display").textContent = email; showState("verify"); }
});

/* ═══════════════════════════════════════════
   VERIFICAÇÃO DE EMAIL
   ═══════════════════════════════════════════ */

window.resendVerification = async function () {
  const btn = document.getElementById("btn-resend");
  const msgEl = document.getElementById("verify-message");
  btn.disabled = true; btn.textContent = "Enviando...";
  const email = currentUser?.email || document.getElementById("verify-email-display")?.textContent;
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin + "/pages/meu-perfil.html?type=signup" } });
  btn.disabled = false; btn.textContent = "Reenviar email";
  msgEl.style.display = "block";
  if (error) { msgEl.style.color = "#e88"; msgEl.textContent = "Erro ao reenviar. Tente em alguns minutos."; }
  else { msgEl.style.color = "#22c55e"; msgEl.textContent = "✅ Email reenviado!"; }
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
  await checkPlayerProfile(currentUser);
});

document.getElementById("btn-link-deny")?.addEventListener("click", () => {
  matchedPlayer = null; showRegisterForm(currentUser);
});

/* ═══════════════════════════════════════════
   REGISTER
   ═══════════════════════════════════════════ */

document.getElementById("form-register")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("register-error");
  errorEl.classList.remove("visible");
  const fullName  = document.getElementById("reg-name").value.trim();
  const birthYear = parseInt(document.getElementById("reg-birth").value);
  const gender    = document.getElementById("reg-gender").value;
  const phone     = document.getElementById("reg-phone").value.trim();
  const ra        = document.getElementById("reg-ra").value.trim() || null;
  const level     = document.getElementById("reg-level").value;
  if (!fullName)  { showError(errorEl, "Preencha seu nome completo."); return; }
  if (!birthYear || birthYear < 1950 || birthYear > 2015) { showError(errorEl, "Preencha um ano de nascimento válido."); return; }
  if (!gender)    { showError(errorEl, "Selecione seu gênero."); return; }
  if (!phone)     { showError(errorEl, "Preencha seu telefone."); return; }
  if (!level)     { showError(errorEl, "Selecione seu nível de jogo."); return; }
  if (!currentUser?.email_confirmed_at) { showError(errorEl, "Confirme seu email antes de criar o perfil."); return; }
  const startingRating = RATING_BY_LEVEL[level] ?? 1400;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Cadastrando...";
  const { error } = await supabase.from("players").insert({
    full_name: fullName, email: currentUser.email.toLowerCase().trim(),
    user_id: currentUser.id, birth_year: birthYear, gender, phone, ra, level,
    rating_rapid: startingRating, games_played_rapid: 0
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

function showError(el, msg) { el.textContent = msg; el.classList.add("visible"); }
function showSuccess(el, msg) { el.textContent = msg; el.classList.add("visible"); }

function translateError(message) {
  if (message.includes("already registered")) return "Este email já possui uma conta.";
  if (message.includes("valid email"))        return "Insira um email válido.";
  if (message.includes("least 6") || message.includes("at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (message.includes("rate limit") || message.includes("too many") || message.includes("email rate")) return "Muitas tentativas. Aguarde 5 minutos e tente novamente.";
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