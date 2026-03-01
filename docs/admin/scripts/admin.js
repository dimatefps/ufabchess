import { supabase } from "../../scripts/services/supabase.js";

/* ══════════════════════════════════════════════
   AUTH — verificar árbitro
   ══════════════════════════════════════════════ */
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  window.location.href = "../pages/admin-login.html";
}

const { data: referee, error: refereeError } = await supabase
  .from("referees")
  .select("full_name, role")
  .eq("id", user.id)
  .single();

if (refereeError || !referee) {
  alert("Acesso negado");
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
}

const refereeId   = user.id;
const refereeRole = referee.role;

document.getElementById("referee-name").textContent = referee.full_name;
document.getElementById("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
});

/* ══════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════ */
let currentSession    = null;   // objeto tournament_sessions
let currentRound      = 1;
let allPairings       = [];     // todos os pairings da sessão atual
let registeredMatches = {};     // { "whiteId_blackId": matchObj }

/* ══════════════════════════════════════════════
   INIT — carregar sessões abertas
   ══════════════════════════════════════════════ */
async function init() {
  const { data: sessions, error } = await supabase
    .from("tournament_sessions")
    .select(`
      id, session_number, match_date, match_time, status, tournament_id,
      tournaments ( id, name, edition, time_control )
    `)
    .in("status", ["open", "in_progress"])
    .order("match_date", { ascending: true });

  const select = document.getElementById("session-select");

  if (error || !sessions?.length) {
    select.innerHTML = `<option value="">Nenhum torneio do dia aberto</option>`;
    document.getElementById("cards-empty").style.display = "block";
    document.getElementById("cards-empty").querySelector("p").textContent =
      "Nenhum torneio do dia em andamento.";
    return;
  }

  select.innerHTML = `<option value="">Selecione o torneio do dia</option>`;
  sessions.forEach(s => {
    const t   = s.tournaments;
    const name = t?.edition ? `${t.name} • Ed. ${t.edition}` : (t?.name ?? "Torneio");
    const date = formatDate(s.match_date);
    const opt  = document.createElement("option");
    opt.value       = s.id;
    opt.textContent = `Torneio ${s.session_number} — ${name} (${date})`;
    opt._session    = s;
    select.appendChild(opt);
  });

  // Se só houver uma, selecionar automaticamente
  if (sessions.length === 1) {
    select.value = sessions[0].id;
    await onSessionChange(sessions[0]);
  }

  select.addEventListener("change", async () => {
    const opt = select.options[select.selectedIndex];
    if (!opt._session) return;
    await onSessionChange(opt._session);
  });

  // Armazenar referência para o event listener
  select._sessions = sessions;
  select.addEventListener("change", async () => {
    const sid = select.value;
    const s   = sessions.find(x => x.id === sid);
    if (s) await onSessionChange(s);
  });
}

/* ══════════════════════════════════════════════
   ON SESSION CHANGE
   ══════════════════════════════════════════════ */
async function onSessionChange(session) {
  currentSession = session;
  currentRound   = 1;

  document.getElementById("match-cards").innerHTML =
    `<div class="loading-msg">Carregando pareamentos...</div>`;
  document.getElementById("round-tabs").style.display = "none";
  document.getElementById("cards-empty").style.display = "none";

  // 1) Buscar pairings desta sessão (com dados dos jogadores)
  const { data: pairings, error: pErr } = await supabase
    .from("pairings")
    .select(`
      id, round_number, table_number,
      pw:player_white ( id, full_name, rating_rapid ),
      pb:player_black ( id, full_name, rating_rapid )
    `)
    .eq("tournament_session_id", session.id)
    .order("round_number")
    .order("table_number");

  if (pErr || !pairings?.length) {
    document.getElementById("match-cards").innerHTML = "";
    document.getElementById("cards-empty").style.display = "block";
    document.getElementById("cards-empty").querySelector("p").textContent =
      "Pareamento ainda não gerado para este torneio.";
    return;
  }

  allPairings = pairings;

  // 2) Buscar partidas já registradas para este tournament_id + rodadas presentes
  await refreshRegisteredMatches(session.tournament_id);

  // 3) Montar tabs de rodada
  const rounds = [...new Set(pairings.map(p => p.round_number))].sort((a, b) => a - b);
  buildRoundTabs(rounds);

  // 4) Renderizar cards da primeira rodada
  renderCards(currentRound);
}

/* ══════════════════════════════════════════════
   BUSCAR PARTIDAS JÁ REGISTRADAS
   ══════════════════════════════════════════════ */
async function refreshRegisteredMatches(tournamentId) {
  registeredMatches = {};

  const rounds = [...new Set(allPairings.map(p => p.round_number))];
  if (!rounds.length) return;

  const { data: matches } = await supabase
    .from("matches")
    .select("id, round_number, player_white, player_black, result_white, result_black, is_walkover")
    .eq("tournament_id", tournamentId)
    .in("round_number", rounds);

  (matches ?? []).forEach(m => {
    // Chave bidirecional para lookup fácil
    const key = `${m.round_number}__${m.player_white}__${m.player_black}`;
    registeredMatches[key] = m;
  });
}

/* ══════════════════════════════════════════════
   TABS DE RODADA
   ══════════════════════════════════════════════ */
function buildRoundTabs(rounds) {
  const container = document.getElementById("round-tabs");
  container.style.display = "flex";
  container.innerHTML = rounds.map(r => `
    <button class="round-tab ${r === currentRound ? "active" : ""}" data-round="${r}">
      Rodada ${r}
    </button>`).join("");

  container.querySelectorAll(".round-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".round-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentRound = Number(btn.dataset.round);
      renderCards(currentRound);
    });
  });
}

/* ══════════════════════════════════════════════
   RENDERIZAR CARDS
   ══════════════════════════════════════════════ */
function renderCards(round) {
  const grid     = document.getElementById("match-cards");
  const pairings = allPairings.filter(p => p.round_number === round);

  if (!pairings.length) {
    grid.innerHTML = `<div class="loading-msg">Sem pareamentos para a Rodada ${round}.</div>`;
    return;
  }

  grid.innerHTML = pairings.map(p => buildCard(p)).join("");

  // Listeners dos botões de resultado
  grid.querySelectorAll(".result-btn[data-pairing]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pairingId = btn.dataset.pairing;
      const result    = btn.dataset.result;
      const pairing   = allPairings.find(p => p.id === pairingId);
      if (pairing) openModal(pairing, result);
    });
  });

  // Listener do rollback nos cards já registrados
  grid.querySelectorAll(".btn-rollback").forEach(btn => {
    btn.addEventListener("click", async () => {
      const matchId = btn.dataset.match;
      await doRollback(matchId);
    });
  });
}

/* ══════════════════════════════════════════════
   MONTAR CARD
   ══════════════════════════════════════════════ */
function buildCard(pairing) {
  const white = pairing.pw;
  const black = pairing.pb;

  // BYE
  if (!black) {
    return `
      <div class="match-card bye-card">
        <div class="card-table-label">Mesa ${pairing.table_number} · R${pairing.round_number}</div>
        <div class="bye-content">
          <span class="piece-dot white-dot"></span>
          <strong>${white?.full_name ?? "?"}</strong>
          <span class="bye-tag">BYE</span>
        </div>
      </div>`;
  }

  // Verificar se já registrado
  const regKey = `${pairing.round_number}__${white.id}__${black.id}`;
  const regMatch = registeredMatches[regKey];

  if (regMatch) {
    return buildDoneCard(pairing, regMatch);
  }

  return `
    <div class="match-card" id="card-${pairing.id}">
      <div class="card-table-label">Mesa ${pairing.table_number} · R${pairing.round_number}</div>

      <div class="card-matchup">
        <div class="card-player">
          <span class="piece-dot white-dot"></span>
          <div class="player-info">
            <span class="player-name">${white.full_name}</span>
            <span class="player-rating">${white.rating_rapid ?? "-"}</span>
          </div>
        </div>
        <div class="card-vs">VS</div>
        <div class="card-player">
          <span class="piece-dot black-dot"></span>
          <div class="player-info">
            <span class="player-name">${black.full_name}</span>
            <span class="player-rating">${black.rating_rapid ?? "-"}</span>
          </div>
        </div>
      </div>

      <div class="result-buttons">
        <button class="result-btn btn-white-win"  data-pairing="${pairing.id}" data-result="1-0">
          1 – 0
        </button>
        <button class="result-btn btn-draw"        data-pairing="${pairing.id}" data-result="0.5-0.5">
          ½ – ½
        </button>
        <button class="result-btn btn-black-win"  data-pairing="${pairing.id}" data-result="0-1">
          0 – 1
        </button>
        <button class="result-btn btn-wo-white"   data-pairing="${pairing.id}" data-result="wo-white">
          W.O. ⬜
        </button>
        <button class="result-btn btn-wo-black"   data-pairing="${pairing.id}" data-result="wo-black">
          W.O. ⬛
        </button>
      </div>
    </div>`;
}

function buildDoneCard(pairing, match) {
  const white = pairing.pw;
  const black = pairing.pb;

  const rw = Number(match.result_white);
  const rb = Number(match.result_black);

  let resultLabel, resultClass;
  if (match.is_walkover) {
    resultLabel = rw === 1 ? "W.O. — Brancas vencem" : "W.O. — Negras vencem";
    resultClass = "result-wo";
  } else if (rw === 1)   { resultLabel = "1 – 0 · Brancas vencem"; resultClass = "result-white"; }
  else if (rb === 1)     { resultLabel = "0 – 1 · Negras vencem";  resultClass = "result-black"; }
  else                   { resultLabel = "½ – ½ · Empate";          resultClass = "result-draw"; }

  const canRollback = refereeRole === "admin";

  return `
    <div class="match-card done-card" id="card-${pairing.id}">
      <div class="card-table-label">Mesa ${pairing.table_number} · R${pairing.round_number}</div>

      <div class="card-matchup">
        <div class="card-player">
          <span class="piece-dot white-dot"></span>
          <div class="player-info">
            <span class="player-name">${white?.full_name ?? "?"}</span>
            <span class="player-rating">${white?.rating_rapid ?? "-"}</span>
          </div>
        </div>
        <div class="card-vs">VS</div>
        <div class="card-player">
          <span class="piece-dot black-dot"></span>
          <div class="player-info">
            <span class="player-name">${black?.full_name ?? "?"}</span>
            <span class="player-rating">${black?.rating_rapid ?? "-"}</span>
          </div>
        </div>
      </div>

      <div class="done-result ${resultClass}">
        ✓ ${resultLabel}
      </div>

      ${canRollback ? `
        <button class="btn-rollback" data-match="${match.id}">
          ↩ Desfazer
        </button>` : ""}
    </div>`;
}

/* ══════════════════════════════════════════════
   MODAL DE CONFIRMAÇÃO
   ══════════════════════════════════════════════ */
let _pendingPairing = null;
let _pendingResult  = null;

function openModal(pairing, result) {
  _pendingPairing = pairing;
  _pendingResult  = result;

  const white = pairing.pw;
  const black = pairing.pb;

  const labels = {
    "1-0":      "1 – 0 · Brancas vencem",
    "0.5-0.5":  "½ – ½ · Empate",
    "0-1":      "0 – 1 · Negras vencem",
    "wo-white": "W.O. — Brancas vencem",
    "wo-black": "W.O. — Negras vencem",
  };

  document.getElementById("modal-title").textContent =
    `Mesa ${pairing.table_number} · Rodada ${pairing.round_number}`;
  document.getElementById("modal-matchup").innerHTML =
    `<strong>${white?.full_name ?? "?"}</strong>
     <span style="color:var(--text-muted);margin:0 8px;">vs</span>
     <strong>${black?.full_name ?? "?"}</strong>`;
  document.getElementById("modal-result-badge").textContent = labels[result] ?? result;

  document.getElementById("result-modal").style.display = "flex";
}

document.getElementById("modal-cancel").addEventListener("click", () => {
  document.getElementById("result-modal").style.display = "none";
  _pendingPairing = null;
  _pendingResult  = null;
});

document.getElementById("modal-confirm").addEventListener("click", async () => {
  if (!_pendingPairing || !_pendingResult) return;

  const btn = document.getElementById("modal-confirm");
  btn.disabled    = true;
  btn.textContent = "Registrando...";

  try {
    await registerResult(_pendingPairing, _pendingResult);
    document.getElementById("result-modal").style.display = "none";
  } catch (err) {
    alert(err.message || "Erro ao registrar resultado.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Confirmar";
    _pendingPairing = null;
    _pendingResult  = null;
  }
});

// Fechar modal clicando fora
document.getElementById("result-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = "none";
    _pendingPairing = null;
    _pendingResult  = null;
  }
});

/* ══════════════════════════════════════════════
   REGISTRAR RESULTADO
   ══════════════════════════════════════════════ */
async function registerResult(pairing, result) {
  const white = pairing.pw;
  const black = pairing.pb;

  let resultWhite, resultBlack, isWalkover = false;
  switch (result) {
    case "1-0":      resultWhite = 1;   resultBlack = 0;   break;
    case "0.5-0.5":  resultWhite = 0.5; resultBlack = 0.5; break;
    case "0-1":      resultWhite = 0;   resultBlack = 1;   break;
    case "wo-white": resultWhite = 1;   resultBlack = 0;   isWalkover = true; break;
    case "wo-black": resultWhite = 0;   resultBlack = 1;   isWalkover = true; break;
    default: throw new Error("Resultado inválido");
  }

  const { error } = await supabase.rpc("register_match", {
    p_tournament_id:  currentSession.tournament_id,
    p_round:          pairing.round_number,
    p_white:          white.id,
    p_black:          black.id,
    p_result_white:   resultWhite,
    p_result_black:   resultBlack,
    p_referee_id:     refereeId,
    p_is_walkover:    isWalkover
  });

  if (error) {
    if (error.message.includes("unique_match_per_round")) {
      throw new Error("Esse confronto já foi registrado nessa rodada.");
    }
    throw error;
  }

  // Atualizar state e re-renderizar cards
  await refreshRegisteredMatches(currentSession.tournament_id);
  renderCards(currentRound);
  await loadRecentMatches();
}

/* ══════════════════════════════════════════════
   ROLLBACK
   ══════════════════════════════════════════════ */
async function doRollback(matchId) {
  const reason = prompt("Motivo do rollback (opcional):");
  if (reason === null) return;

  const { error } = await supabase.rpc("rollback_match", {
    p_match_id:   matchId,
    p_referee_id: user.id,
    p_reason:     reason
  });

  if (error) {
    alert(error.message || "Erro ao realizar rollback.");
    return;
  }

  await refreshRegisteredMatches(currentSession.tournament_id);
  renderCards(currentRound);
  await loadRecentMatches();
}

/* ══════════════════════════════════════════════
   PARTIDAS RECENTES — mostra 3, expande para ver todas
   ══════════════════════════════════════════════ */
const MATCHES_PREVIEW = 3;

async function loadRecentMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id, round_number, result_white, result_black, is_walkover, created_at,
      player_white:player_white ( full_name ),
      player_black:player_black ( full_name )
    `)
    .order("created_at", { ascending: false })
    .limit(30);

  const list = document.getElementById("matches-list");

  if (error || !data?.length) {
    list.innerHTML = `<li class="match-item" style="color:var(--text-muted);justify-content:center;">
      Nenhuma partida registrada ainda.
    </li>`;
    return;
  }

  renderMatchList(list, data, false);
}

function buildMatchItem(m) {
  const rw = Number(m.result_white);
  const rb = Number(m.result_black);
  let score, cls;
  if (m.is_walkover) { score = "W.O."; cls = "score-wo"; }
  else if (rw === 1) { score = "1 – 0"; cls = "score-white"; }
  else if (rb === 1) { score = "0 – 1"; cls = "score-black"; }
  else               { score = "½ – ½"; cls = "score-draw"; }

  const rollbackBtn = refereeRole === "admin"
    ? `<button class="btn-undo" data-id="${m.id}">↩</button>`
    : "";

  return `
    <li class="match-item">
      <span class="match-round">R${m.round_number}</span>
      <span class="match-players">
        ${m.player_white?.full_name ?? "?"} vs ${m.player_black?.full_name ?? "?"}
      </span>
      <span class="match-score ${cls}">${score}</span>
      ${rollbackBtn}
    </li>`;
}

function renderMatchList(list, data, expanded) {
  const visible = expanded ? data : data.slice(0, MATCHES_PREVIEW);
  const hidden  = data.length - MATCHES_PREVIEW;

  list.innerHTML = visible.map(buildMatchItem).join("");

  // Botão expandir/recolher
  if (data.length > MATCHES_PREVIEW) {
    const toggleLi = document.createElement("li");
    toggleLi.className = "match-toggle";
    toggleLi.innerHTML = expanded
      ? `<button class="btn-toggle-matches">▲ Recolher</button>`
      : `<button class="btn-toggle-matches">▼ Ver mais ${hidden} partida${hidden > 1 ? "s" : ""}</button>`;
    list.appendChild(toggleLi);

    toggleLi.querySelector(".btn-toggle-matches").addEventListener("click", () => {
      renderMatchList(list, data, !expanded);
    });
  }

  // Listeners rollback
  list.querySelectorAll(".btn-undo").forEach(btn => {
    btn.addEventListener("click", async () => {
      await doRollback(btn.dataset.id);
    });
  });
}

/* ══════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════ */
function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const days   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

/* ══════════════════════════════════════════════
   START
   ══════════════════════════════════════════════ */
init();
loadRecentMatches();