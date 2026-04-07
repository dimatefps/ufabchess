import { supabase } from "../../scripts/services/supabase.js";

/* ══════════════════════════════════════════════
   AUTH — verificar árbitro
   ══════════════════════════════════════════════ */
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  window.location.href = "../pages/admin-login.html";
  throw new Error("unauthenticated"); // ← FIX 1: para execução do módulo
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
  throw new Error("unauthorized"); // ← FIX 1: para execução do módulo
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
let currentSession    = null;
let currentRound      = 1;
let allPairings       = [];
let registeredMatches = {};

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
    const t    = s.tournaments;
    const name = t?.edition ? `${t.name} • Ed. ${t.edition}` : (t?.name ?? "Torneio");
    const date = formatDate(s.match_date);
    const opt  = document.createElement("option");
    opt.value       = s.id;
    opt.textContent = `${name} — ${date}`;
    opt._session    = s;
    select.appendChild(opt);
  });

  // Selecionar automaticamente se só houver uma
  if (sessions.length === 1) {
    select.value = sessions[0].id;
    await onSessionChange(sessions[0]);
  }

  select.addEventListener("change", async () => {
    const opt = select.options[select.selectedIndex];
    if (opt._session) await onSessionChange(opt._session);
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

  const rounds = [...new Set(pairings.map(p => p.round_number))].sort((a, b) => a - b);
  buildRoundTabs(rounds);

  // ← FIX 2: passa session.id além de tournament_id para filtrar por sessão
  await refreshRegisteredMatches(session.id, session.tournament_id);
  renderCards(currentRound);
  await loadRecentMatches();
}

/* ══════════════════════════════════════════════
   REFRESH REGISTERED MATCHES
   FIX 2: filtra por session_id para não mostrar
   resultados de sessões anteriores do mesmo torneio
   ══════════════════════════════════════════════ */
async function refreshRegisteredMatches(sessionId, tournamentId) {
  // Busca pairings desta sessão específica para saber quais chaves são válidas
  const { data: sessionPairings } = await supabase
    .from("pairings")
    .select("player_white, player_black, round_number")
    .eq("tournament_session_id", sessionId);

  const sessionKeys = new Set(
    (sessionPairings ?? []).map(p => `${p.round_number}__${p.player_white}__${p.player_black}`)
  );

  // Busca matches do torneio
  const { data, error } = await supabase
    .from("matches")
    .select(`id, round_number, result_white, result_black, is_walkover, player_white, player_black`)
    .eq("tournament_id", tournamentId);

  registeredMatches = {};
  (data ?? []).forEach(m => {
    const key = `${m.round_number}__${m.player_white}__${m.player_black}`;
    // Só inclui se o pairing pertence à sessão atual
    if (sessionKeys.has(key)) {
      registeredMatches[key] = m;
    }
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

  grid.querySelectorAll(".result-btn[data-pairing]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pairingId = btn.dataset.pairing;
      const result    = btn.dataset.result;
      const pairing   = allPairings.find(p => p.id === pairingId);
      if (pairing) openModal(pairing, result);
    });
  });

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

  const regKey   = `${pairing.round_number}__${white.id}__${black.id}`;
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
        <button class="result-btn btn-white-win"  data-pairing="${pairing.id}" data-result="1-0">1 – 0</button>
        <button class="result-btn btn-draw"        data-pairing="${pairing.id}" data-result="0.5-0.5">½ – ½</button>
        <button class="result-btn btn-black-win"  data-pairing="${pairing.id}" data-result="0-1">0 – 1</button>
        <button class="result-btn btn-wo-white"   data-pairing="${pairing.id}" data-result="wo-white">W.O. ⬜</button>
        <button class="result-btn btn-wo-black"   data-pairing="${pairing.id}" data-result="wo-black">W.O. ⬛</button>
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
        ${resultLabel}
        ${canRollback ? `<button class="btn-rollback" data-match="${match.id}">↩ Desfazer</button>` : ""}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════
   MODAL DE CONFIRMAÇÃO
   ══════════════════════════════════════════════ */
function openModal(pairing, result) {
  // Alterado de "confirm-modal" para "result-modal"
  const modal = document.getElementById("result-modal");
  if (!modal) return;

  const white = pairing.pw;
  const black = pairing.pb;

  // Alterado para injetar o texto no "modal-matchup"
  document.getElementById("modal-matchup").textContent = 
    `${white?.full_name ?? "?"} vs ${black?.full_name ?? "?"}`;

  const resultLabels = {
    "1-0":      "1 – 0 · Brancas vencem",
    "0-1":      "0 – 1 · Negras vencem",
    "0.5-0.5":  "½ – ½ · Empate",
    "wo-white": "W.O. — Brancas vencem",
    "wo-black": "W.O. — Negras vencem",
  };
  
  // Alterado de "modal-result" para "modal-result-badge"
  document.getElementById("modal-result-badge").textContent = resultLabels[result] ?? result;

  modal.style.display = "flex";
  modal._pairing = pairing;
  modal._result  = result;
}

// Alterado para "modal-cancel"
document.getElementById("modal-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("result-modal");
  if (modal) modal.style.display = "none";
});

// Alterado para fechar ao clicar fora (no "result-modal")
document.getElementById("result-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

// Listener do botão confirmar (ID modal-confirm está correto no HTML)
document.getElementById("modal-confirm")?.addEventListener("click", async () => {
  const modal = document.getElementById("result-modal");
  if (!modal) return;

  const pairing = modal._pairing;
  const result  = modal._result;

  const resultMap = {
    "1-0":     { rw: 1,   rb: 0,   wo: false },
    "0-1":     { rw: 0,   rb: 1,   wo: false },
    "0.5-0.5": { rw: 0.5, rb: 0.5, wo: false },
    "wo-white":{ rw: 1,   rb: 0,   wo: true  },
    "wo-black":{ rw: 0,   rb: 1,   wo: true  },
  };

  const { rw, rb, wo } = resultMap[result] ?? { rw: 0.5, rb: 0.5, wo: false };

  const btn = document.getElementById("modal-confirm");
  btn.disabled    = true;
  btn.textContent = "Registrando...";

  const { error } = await supabase.rpc("register_match", {
    p_tournament_id: currentSession.tournament_id,
    p_round:         pairing.round_number,
    p_white:         pairing.pw.id,
    p_black:         pairing.pb.id,
    p_result_white:  rw,
    p_result_black:  rb,
    p_referee_id:    refereeId,
    p_is_walkover:   wo
  });

  btn.disabled    = false;
  btn.textContent = "Confirmar";
  modal.style.display = "none";

  if (error) {
    alert(`Erro ao registrar: ${error.message}`);
    return;
  }

  // Atualizar estado local e re-renderizar
  await refreshRegisteredMatches(currentSession.id, currentSession.tournament_id);
  renderCards(currentRound);
  await loadRecentMatches();
});

/* ══════════════════════════════════════════════
   ROLLBACK
   ══════════════════════════════════════════════ */
async function doRollback(matchId) {
  if (!confirm("Desfazer esta partida? Os ratings serão revertidos.")) return;

  const reason = prompt("Motivo do rollback (opcional):") ?? "";

  const { error } = await supabase.rpc("rollback_match", {
    p_match_id:   matchId,
    p_referee_id: refereeId,
    p_reason:     reason || null
  });

  if (error) {
    alert(`Erro ao desfazer: ${error.message}`);
    return;
  }

  await refreshRegisteredMatches(currentSession.id, currentSession.tournament_id);
  renderCards(currentRound);
  await loadRecentMatches();
}

/* ══════════════════════════════════════════════
   PARTIDAS RECENTES
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
  if (m.is_walkover)  { score = "W.O."; cls = "score-wo"; }
  else if (rw === 1)  { score = "1 – 0"; cls = "score-white"; }
  else if (rb === 1)  { score = "0 – 1"; cls = "score-black"; }
  else                { score = "½ – ½"; cls = "score-draw"; }

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