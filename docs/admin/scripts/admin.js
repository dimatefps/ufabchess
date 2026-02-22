import { supabase } from "./supabase.js";

/* =======================
   AUTH CHECK
======================= */

const {
  data: { user },
  error: userError
} = await supabase.auth.getUser();

if (userError || !user) {
  window.location.href = "../pages/admin-login.html";
}

/* =======================
   REFEREE CHECK
======================= */

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

const refereeRole = referee.role;
const refereeId   = user.id;

/* =======================
   UI REFERENCES
======================= */

const refereeNameEl    = document.getElementById("referee-name");
const tournamentSelect = document.getElementById("tournament-select");
const playerWhite      = document.getElementById("player-white");
const playerBlack      = document.getElementById("player-black");
const roundNumber      = document.getElementById("round-number");
const submitBtn        = document.getElementById("submit-btn");
const statusMsg        = document.getElementById("status-message");
const matchesList      = document.getElementById("matches-list");
const rollbackLink     = document.getElementById("rollback-link");

/* =======================
   SHOW REFEREE NAME
======================= */

if (refereeNameEl) refereeNameEl.textContent = referee.full_name;

// Show rollback link only for admins
if (refereeRole === "admin" && rollbackLink) {
  rollbackLink.style.display = "flex";
}

/* =======================
   LOGOUT
======================= */

document.getElementById("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
});

/* =======================
   RESULT SELECTION STATE
   (replaces the old <select>)
======================= */

let selectedResult = null;
let isSubmitting   = false;

// All clickable result buttons (main + W.O.)
const allResultBtns = document.querySelectorAll(".result-btn, .wo-btn");

allResultBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    // Clear all selections
    allResultBtns.forEach(b => b.classList.remove("selected"));

    // Select this one
    btn.classList.add("selected");
    selectedResult = btn.dataset.result;

    // Enable submit if players are also selected
    updateSubmitState();
  });
});

// Also enable submit when players change
[playerWhite, playerBlack, tournamentSelect, roundNumber].forEach(el => {
  el.addEventListener("change", updateSubmitState);
  el.addEventListener("input", updateSubmitState);
});

function updateSubmitState() {
  const ready =
    tournamentSelect.value &&
    roundNumber.value &&
    playerWhite.value &&
    playerBlack.value &&
    playerWhite.value !== playerBlack.value &&
    selectedResult !== null;

  submitBtn.disabled = !ready;
}

/* =======================
   LOAD TOURNAMENTS
======================= */

async function loadTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition")
    .eq("status", "ongoing")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  if (!data.length) {
    const opt = new Option("Nenhum torneio em andamento", "");
    opt.disabled = true;
    tournamentSelect.add(opt);
    return;
  }

  data.forEach(t => {
    const label = t.edition ? `${t.name} • Edição ${t.edition}` : t.name;
    tournamentSelect.add(new Option(label, t.id));
  });
}

/* =======================
   LOAD PLAYERS
======================= */

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name")
    .order("full_name");

  if (error) { console.error(error); return; }

  data.forEach(p => {
    playerWhite.add(new Option(p.full_name, p.id));
    playerBlack.add(new Option(p.full_name, p.id));
  });
}

loadTournaments();
loadPlayers();

/* =======================
   SUBMIT
======================= */

submitBtn.addEventListener("click", async () => {
  if (isSubmitting) return;
  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Registrando...";
  hideStatus();

  try {
    await submitMatch();
    showStatus("Partida registrada com sucesso! ✓", "success");
    resetForm();
    await loadRecentMatches();
  } catch (err) {
    showStatus(err.message || "Erro inesperado. Tente novamente.", "error");
  } finally {
    isSubmitting = false;
    submitBtn.textContent = "Registrar Partida";
    updateSubmitState();
  }
});

async function submitMatch() {
  let resultWhite, resultBlack, isWalkover = false;

  switch (selectedResult) {
    case "1-0":       resultWhite = 1;   resultBlack = 0;   break;
    case "0.5-0.5":   resultWhite = 0.5; resultBlack = 0.5; break;
    case "0-1":       resultWhite = 0;   resultBlack = 1;   break;
    case "wo-white":  resultWhite = 1;   resultBlack = 0;   isWalkover = true; break;
    case "wo-black":  resultWhite = 0;   resultBlack = 1;   isWalkover = true; break;
    default: throw new Error("Selecione um resultado");
  }

  if (playerWhite.value === playerBlack.value) {
    throw new Error("Os dois jogadores não podem ser o mesmo");
  }

  const { error } = await supabase.rpc("register_match", {
    p_tournament_id: tournamentSelect.value,
    p_round:         Number(roundNumber.value),
    p_white:         playerWhite.value,
    p_black:         playerBlack.value,
    p_result_white:  resultWhite,
    p_result_black:  resultBlack,
    p_referee_id:    refereeId,
    p_is_walkover:   isWalkover
  });

  if (error) {
    if (error.message.includes("unique_match_per_round")) {
      throw new Error("Esse confronto já foi registrado nessa rodada.");
    }
    throw error;
  }
}

function resetForm() {
  // Keep tournament + round, clear players + result
  playerWhite.value = "";
  playerBlack.value = "";
  selectedResult = null;
  allResultBtns.forEach(b => b.classList.remove("selected"));
  updateSubmitState();
}

/* =======================
   STATUS MESSAGES
======================= */

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = type; // "success" or "error"
}

function hideStatus() {
  statusMsg.textContent = "";
  statusMsg.className = "";
}

/* =======================
   RECENT MATCHES
======================= */

async function loadRecentMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id,
      round_number,
      created_at,
      player_white:player_white(full_name),
      player_black:player_black(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }

  matchesList.innerHTML = "";

  if (!data.length) {
    matchesList.innerHTML = `<li style="color:var(--text-muted);font-size:.88rem;padding:12px 0;">Nenhuma partida registrada ainda.</li>`;
    return;
  }

  data.forEach((match, i) => {
    const li = document.createElement("li");
    li.className = "match-item";
    li.style.animationDelay = `${i * 40}ms`;

    li.innerHTML = `
      <span class="match-round">Rd ${match.round_number}</span>
      <span class="match-players">
        ♔ ${match.player_white.full_name}
        <span class="match-vs">vs</span>
        ♚ ${match.player_black.full_name}
      </span>`;

    if (refereeRole === "admin") {
      const btn = document.createElement("button");
      btn.className = "btn-rollback";
      btn.textContent = "Desfazer";
      btn.onclick = () => rollbackMatch(match.id);
      li.appendChild(btn);
    }

    matchesList.appendChild(li);
  });
}

/* =======================
   ROLLBACK
======================= */

async function rollbackMatch(matchId) {
  const reason = prompt("Motivo do rollback (opcional):");
  if (reason === null) return;

  const { error } = await supabase.rpc("rollback_match", {
    p_match_id:   matchId,
    p_referee_id: user.id,
    p_reason:     reason
  });

  if (error) {
    alert(error.message || "Erro ao realizar rollback");
    return;
  }

  showStatus("Rollback realizado com sucesso.", "success");
  await loadRecentMatches();
}

loadRecentMatches();