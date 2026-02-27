import { supabase } from "../services/supabase.js";

/* ══════════════════════════════════════════════════════
   MEU PERFIL — Sistema completo de login, cadastro,
   vinculação e perfil de jogador
   ══════════════════════════════════════════════════════ */

/* ── Rating por nível ── */
const RATING_BY_LEVEL = {
  iniciante:     1200,
  intermediario: 1400,
  avancado:      1800
};

/* ── Title badge (mesmo padrão das outras páginas) ── */
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

const STATES = ["loading", "auth", "verify", "link", "register", "profile"];

function showState(name) {
  STATES.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle("active", s === name);
  });
}

/* ═══════════════════════════════════════════
   GLOBALS
   ═══════════════════════════════════════════ */

let currentUser   = null;  // auth user do Supabase
let matchedPlayer = null;  // player encontrado pelo email (do Forms)
let myPlayer      = null;  // player vinculado ao user logado

/* ═══════════════════════════════════════════
   INIT — Ponto de entrada principal
   ═══════════════════════════════════════════ */

async function init() {
  showState("loading");

  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      currentUser = null;
      showState("auth");
      return;
    }

    currentUser = user;

    // ── SEGURANÇA: email precisa estar confirmado ──
    if (!user.email_confirmed_at) {
      document.getElementById("verify-email-display").textContent = user.email;
      showState("verify");
      return;
    }

    // Email confirmado → verificar perfil de jogador
    await checkPlayerProfile(user);

  } catch (err) {
    console.error("Erro no init:", err);
    showState("auth");
  }
}

/* ═══════════════════════════════════════════
   CHECK PLAYER PROFILE
   Busca o jogador vinculado, ou tenta match
   por email, ou abre cadastro novo.
   ═══════════════════════════════════════════ */

async function checkPlayerProfile(user) {
  // 1) Buscar player JÁ vinculado via user_id
  const { data: linked } = await supabase
    .from("players")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (linked) {
    myPlayer = linked;
    await renderProfileView(linked, user);
    return;
  }

  // 2) Buscar player pelo EMAIL (match com dados do Forms)
  //    SOMENTE players sem user_id (ainda não reivindicados)
  const userEmail = user.email.toLowerCase().trim();

  const { data: emailMatch } = await supabase
    .from("players")
    .select("*")
    .ilike("email", userEmail)
    .is("user_id", null)
    .maybeSingle();

  if (emailMatch) {
    matchedPlayer = emailMatch;
    renderLinkPrompt(emailMatch);
    return;
  }

  // 3) Sem match nenhum → cadastro de jogador novo
  showRegisterForm(user);
}

/* ═══════════════════════════════════════════
   RENDER: LINK PROMPT
   Quando o email bate com jogador do Forms
   ═══════════════════════════════════════════ */

function renderLinkPrompt(player) {
  const el = document.getElementById("link-player-info");
  const badge = getTitleBadge(player.rating_rapid, player.games_played_rapid);

  el.innerHTML = `
    <div>
      <span class="link-player-name">${badge} ${player.full_name}</span>
    </div>
    <div>
      <span class="link-player-rating">${player.rating_rapid ?? 1400}</span>
      <span class="link-player-games"> · ${player.games_played_rapid ?? 0} partidas</span>
    </div>`;

  showState("link");
}

/* ═══════════════════════════════════════════
   RENDER: REGISTER FORM (jogador novo)
   ═══════════════════════════════════════════ */

function showRegisterForm(user) {
  const emailInput = document.getElementById("reg-email");
  if (emailInput) emailInput.value = user.email;

  // Pré-preencher nome do signup
  const nameInput = document.getElementById("reg-name");
  const meta = user.user_metadata;
  if (meta?.full_name && nameInput && !nameInput.value) {
    nameInput.value = meta.full_name;
  }

  showState("register");
}

/* ═══════════════════════════════════════════
   RENDER: PROFILE VIEW (com check-in)
   ═══════════════════════════════════════════ */

async function renderProfileView(player, user) {
  const grid = document.getElementById("profile-grid");
  const initials = player.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const badge = getTitleBadge(player.rating_rapid, player.games_played_rapid);

  // Buscar rank do jogador
  const { count: totalPlayers } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true });

  const { count: playersAbove } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .gt("rating_rapid", player.rating_rapid ?? 0);

  const rank = (playersAbove ?? 0) + 1;

  // Buscar semana aberta de torneio
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

    <!-- Check-in -->
    ${weekHtml}

    <!-- Actions -->
    <div class="profile-actions">
      <a href="./pareamento.html" class="btn-secondary">Ver Pareamentos →</a>
      <button class="btn-logout" onclick="handleLogout()">Sair da conta</button>
    </div>`;

  showState("profile");
  setupCheckinButtons(player);
}

/* ═══════════════════════════════════════════
   BUILD CHECK-IN SECTION
   ═══════════════════════════════════════════ */

async function buildCheckinSection(player) {
  // Buscar semana aberta
  const { data: week } = await supabase
    .from("tournament_weeks")
    .select(`
      id, tournament_id, week_number, match_date, match_time,
      max_players, status,
      tournaments ( name, edition )
    `)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!week) {
    return `
      <div class="checkin-card">
        <div class="card-title">Próximo Torneio</div>
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.9rem;">
          Nenhum torneio aberto para inscrição no momento.
        </div>
      </div>`;
  }

  // Buscar check-ins da semana
  const { data: checkins } = await supabase
    .from("tournament_checkins")
    .select(`
      id, player_id, checked_in_at,
      players ( full_name, rating_rapid, games_played_rapid )
    `)
    .eq("tournament_week_id", week.id)
    .order("checked_in_at", { ascending: true });

  const checkinList = checkins ?? [];

  // Verificar se EU já fiz check-in
  const isCheckedIn = checkinList.some(c => c.player_id === player.id);

  // Dados do torneio
  const tournamentName = week.tournaments?.name || "Torneio";
  const edition = week.tournaments?.edition ? ` · Edição ${week.tournaments.edition}` : "";
  const dateStr = formatDate(week.match_date);
  const timeStr = week.match_time?.slice(0, 5) || "18:15";
  const spotsLeft = week.max_players - checkinList.length;

  // Deadline: 3h antes do horário
  const matchDateTime = new Date(`${week.match_date}T${week.match_time || "18:15:00"}`);
  const deadline = new Date(matchDateTime.getTime() - 3 * 60 * 60 * 1000);
  const deadlinePassed = new Date() > deadline;
  const deadlineStr = deadline.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Botão de ação
  let actionHtml;
  if (isCheckedIn) {
    actionHtml = deadlinePassed
      ? `<span class="checkin-status checkin-confirmed">Presença confirmada</span>`
      : `<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
           <span class="checkin-status checkin-confirmed">Confirmado</span>
           <button id="btn-cancel-checkin" data-week-id="${week.id}">Cancelar presença</button>
         </div>`;
  } else if (deadlinePassed) {
    actionHtml = `<span style="font-size:.82rem;color:var(--text-muted);">Inscrição encerrada</span>`;
  } else if (spotsLeft <= 0) {
    actionHtml = `<span style="font-size:.82rem;color:#e88;">Vagas esgotadas</span>`;
  } else {
    actionHtml = `<button id="btn-checkin" class="btn-primary" data-week-id="${week.id}">Confirmar presença</button>`;
  }

  // Lista de jogadores confirmados
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
      <div class="card-title">Próximo Torneio</div>
      <div class="checkin-event">
        <div class="checkin-event-info">
          <h3>Semana ${week.week_number} — ${tournamentName}${edition}</h3>
          <p>📅 ${dateStr} às ${timeStr}</p>
          <p class="slots"><strong>${checkinList.length}</strong> / ${week.max_players} confirmados · ${spotsLeft > 0 ? `${spotsLeft} vagas restantes` : "Lotado"}</p>
          ${!deadlinePassed ? `<p style="font-size:.76rem;color:var(--text-muted);margin-top:2px;">Inscrição encerra às ${deadlineStr}</p>` : ""}
        </div>
        ${actionHtml}
      </div>
      <div class="checkin-list">
        <div class="checkin-list-header">Jogadores confirmados</div>
        ${listHtml}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════
   CHECKIN BUTTONS
   ═══════════════════════════════════════════ */

function setupCheckinButtons(player) {
  // Confirmar presença
  const btnCheckin = document.getElementById("btn-checkin");
  if (btnCheckin) {
    btnCheckin.addEventListener("click", async () => {
      const weekId = btnCheckin.dataset.weekId;
      btnCheckin.disabled = true;
      btnCheckin.textContent = "Confirmando...";

      try {
        const { data, error } = await supabase.rpc("checkin_tournament", {
          p_tournament_week_id: weekId
        });
        if (error) throw error;

        if (data?.success) {
          await renderProfileView(player, currentUser);
        } else {
          alert(data?.error || "Erro ao confirmar presença.");
          btnCheckin.disabled = false;
          btnCheckin.textContent = "Confirmar presença";
        }
      } catch (err) {
        alert(err.message || "Erro ao confirmar presença.");
        btnCheckin.disabled = false;
        btnCheckin.textContent = "Confirmar presença";
      }
    });
  }

  // Cancelar presença
  const btnCancel = document.getElementById("btn-cancel-checkin");
  if (btnCancel) {
    btnCancel.addEventListener("click", async () => {
      if (!confirm("Deseja cancelar sua presença nesta semana?")) return;

      const weekId = btnCancel.dataset.weekId;
      btnCancel.disabled = true;
      btnCancel.textContent = "Cancelando...";

      try {
        const { data, error } = await supabase.rpc("cancel_checkin", {
          p_tournament_week_id: weekId
        });
        if (error) throw error;

        if (data?.success) {
          await renderProfileView(player, currentUser);
        } else {
          alert(data?.error || "Erro ao cancelar.");
          btnCancel.disabled = false;
          btnCancel.textContent = "Cancelar presença";
        }
      } catch (err) {
        alert(err.message || "Erro ao cancelar.");
        btnCancel.disabled = false;
        btnCancel.textContent = "Cancelar presença";
      }
    });
  }
}

/* ═══════════════════════════════════════════
   AUTH — Tab switching
   ═══════════════════════════════════════════ */

document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;

    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("form-login").style.display  = target === "login" ? "block" : "none";
    document.getElementById("form-signup").style.display  = target === "signup" ? "block" : "none";

    // Limpar mensagens
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

  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showError(errorEl, "Preencha todos os campos.");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Entrando...";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError(errorEl, "Email ou senha inválidos.");
    btn.disabled = false;
    btn.textContent = "Entrar";
    return;
  }

  // Login OK → recarregar fluxo
  await init();
});

// Enter no campo de senha faz submit
document.getElementById("login-password")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.target.closest("form").requestSubmit();
});

/* ═══════════════════════════════════════════
   AUTH — Signup (com confirmação de senha)
   ═══════════════════════════════════════════ */

document.getElementById("form-signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById("signup-error");
  const successEl = document.getElementById("signup-success");
  errorEl.classList.remove("visible");
  successEl.classList.remove("visible");

  const fullName = document.getElementById("signup-name").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm  = document.getElementById("signup-password-confirm").value;

  // Validações
  if (!fullName || !email || !password || !confirm) {
    showError(errorEl, "Preencha todos os campos.");
    return;
  }
  if (password.length < 6) {
    showError(errorEl, "A senha precisa ter pelo menos 6 caracteres.");
    return;
  }
  if (password !== confirm) {
    showError(errorEl, "As senhas não coincidem.");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Criando conta...";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    showError(errorEl, translateError(error.message));
    btn.disabled = false;
    btn.textContent = "Criar conta";
    return;
  }

  // Email já existe
  if (data?.user?.identities?.length === 0) {
    showError(errorEl, "Esse email já possui uma conta. Tente fazer login.");
    btn.disabled = false;
    btn.textContent = "Criar conta";
    return;
  }

  // Confirmação de email necessária (fluxo seguro)
  if (data?.user && !data?.session) {
    showSuccess(successEl, "Conta criada! Enviamos um link de confirmação para seu email. Confirme e depois faça login.");
    btn.disabled = false;
    btn.textContent = "Criar conta";
    return;
  }

  // Login automático (se confirm email desativado)
  await init();
});

/* ═══════════════════════════════════════════
   RESEND VERIFICATION EMAIL
   ═══════════════════════════════════════════ */

window.resendVerification = async function () {
  if (!currentUser) return;

  const btn   = document.getElementById("btn-resend");
  const msgEl = document.getElementById("verify-message");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  msgEl.classList.remove("visible");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: currentUser.email
  });

  msgEl.style.color = error ? "#e88" : "var(--green)";
  msgEl.textContent = error
    ? "Erro ao reenviar. Tente novamente em alguns minutos."
    : "Email reenviado! Verifique sua caixa de entrada e spam.";
  msgEl.classList.add("visible");
  btn.disabled = false;
  btn.textContent = "Reenviar email";
};

/* ═══════════════════════════════════════════
   LINK — Vincular jogador existente
   (email match com dados do Forms)
   ═══════════════════════════════════════════ */

document.getElementById("btn-link-confirm")?.addEventListener("click", async () => {
  const errorEl = document.getElementById("link-error");
  errorEl.classList.remove("visible");

  if (!currentUser || !matchedPlayer) return;

  if (!currentUser.email_confirmed_at) {
    showError(errorEl, "Seu email precisa estar confirmado.");
    return;
  }

  const btn = document.getElementById("btn-link-confirm");
  btn.disabled = true;
  btn.textContent = "Vinculando...";

  // RPC segura no servidor — valida tudo server-side
  const { error } = await supabase.rpc("link_player_to_user", {
    p_player_id: matchedPlayer.id
  });

  if (error) {
    showError(errorEl, error.message || "Erro ao vincular conta.");
    btn.disabled = false;
    btn.textContent = "Sim, vincular minha conta";
    return;
  }

  // Sucesso → carregar perfil
  matchedPlayer = null;
  await checkPlayerProfile(currentUser);
});

// "Não sou essa pessoa" → cadastro novo
document.getElementById("btn-link-deny")?.addEventListener("click", () => {
  matchedPlayer = null;
  showRegisterForm(currentUser);
});

/* ═══════════════════════════════════════════
   REGISTER — Cadastrar jogador novo
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

  // Validações
  if (!fullName) { showError(errorEl, "Preencha seu nome completo."); return; }
  if (!birthYear || birthYear < 1950 || birthYear > 2015) { showError(errorEl, "Preencha um ano de nascimento válido."); return; }
  if (!gender) { showError(errorEl, "Selecione seu gênero."); return; }
  if (!phone) { showError(errorEl, "Preencha seu telefone."); return; }
  if (!level) { showError(errorEl, "Selecione seu nível de jogo."); return; }

  if (!currentUser?.email_confirmed_at) {
    showError(errorEl, "Confirme seu email antes de criar o perfil.");
    return;
  }

  const startingRating = RATING_BY_LEVEL[level] ?? 1400;

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Cadastrando...";

  const { error } = await supabase
    .from("players")
    .insert({
      full_name:          fullName,
      email:              currentUser.email.toLowerCase().trim(),
      user_id:            currentUser.id,
      birth_year:         birthYear,
      gender:             gender,
      phone:              phone,
      ra:                 ra,
      level:              level,
      rating_rapid:       startingRating,
      games_played_rapid: 0
    });

  if (error) {
    let msg = error.message || "Erro ao cadastrar.";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      msg = "Esse email já está vinculado a outro jogador. Entre em contato com a organização.";
    }
    showError(errorEl, msg);
    btn.disabled = false;
    btn.textContent = "Finalizar cadastro";
    return;
  }

  // Sucesso → carregar perfil
  await checkPlayerProfile(currentUser);
});

/* ═══════════════════════════════════════════
   LOGOUT
   ═══════════════════════════════════════════ */

window.handleLogout = async function () {
  await supabase.auth.signOut();
  currentUser = null;
  matchedPlayer = null;
  myPlayer = null;
  showState("auth");
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add("visible");
}

function showSuccess(el, msg) {
  el.textContent = msg;
  el.classList.add("visible");
}

function translateError(message) {
  if (message.includes("already registered")) return "Este email já possui uma conta.";
  if (message.includes("valid email")) return "Insira um email válido.";
  if (message.includes("least 6") || message.includes("at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (message.includes("rate limit") || message.includes("too many") || message.includes("email rate")) return "Muitas tentativas. Aguarde 5 minutos e tente novamente.";
  return message;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const days   = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

/* ═══════════════════════════════════════════
   START
   ═══════════════════════════════════════════ */

init();