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

const refereeRole = referee.role;
  
const refereeId = user.id;



if (refereeError || !referee) {
  alert("Acesso negado");
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
}

/* =======================
   SHOW REFEREE NAME
======================= */

const refereeNameEl = document.getElementById("referee-name");

if (refereeNameEl) {
  refereeNameEl.textContent = `Árbitro: ${referee.full_name}`;
}



document.getElementById("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
});



const tournamentSelect = document.getElementById("tournament-select");
const playerWhiteSelect = document.getElementById("player-white");
const playerBlackSelect = document.getElementById("player-black");
const form = document.getElementById("match-form");
const submitButton = form.querySelector('button[type="submit"]');

let isSubmitting = false;

/* =======================
   LOAD INITIAL DATA
======================= */

async function loadTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition")
    .eq("status", "ongoing")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar torneios", error);
    return;
  }

  if (!data.length) {
    const option = document.createElement("option");
    option.disabled = true;
    option.selected = true;
    option.textContent = "Nenhum torneio em andamento";
    tournamentSelect.appendChild(option);
    return;
  }

  data.forEach(tournament => {
    const option = document.createElement("option");
    option.value = tournament.id;
    option.textContent = tournament.edition
      ? `${tournament.name} • Edição ${tournament.edition}`
      : tournament.name;

    tournamentSelect.appendChild(option);
  });
}


async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name")
    .order("full_name");

  if (error) {
    console.error("Erro ao carregar jogadores", error);
    return;
  }

  data.forEach(player => {
    const optionWhite = document.createElement("option");
    optionWhite.value = player.id;
    optionWhite.textContent = player.full_name;

    const optionBlack = optionWhite.cloneNode(true);

    playerWhiteSelect.appendChild(optionWhite);
    playerBlackSelect.appendChild(optionBlack);
  });
}

loadTournaments();
loadPlayers();

/* =======================
   FORM SUBMIT
======================= */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (isSubmitting) return;
  isSubmitting = true;

  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";

  try {
    await submitMatch();
  } catch (err) {
    alert(err.message || "Erro inesperado");
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Registrar resultado";
  }
});

/* =======================
   SUBMIT MATCH
======================= */

async function submitMatch() {
  const tournamentId = tournamentSelect.value;
  const roundNumber = Number(document.getElementById("round-number").value);
  const whitePlayer = playerWhiteSelect.value;
  const blackPlayer = playerBlackSelect.value;
  const resultValue = document.getElementById("match-result").value;

  if (!tournamentId || !roundNumber || !whitePlayer || !blackPlayer || !resultValue) {
    throw new Error("Preencha todos os campos");
  }

  if (whitePlayer === blackPlayer) {
    throw new Error("Jogadores não podem ser iguais");
  }

  let resultWhite;
  let resultBlack;
  let isWalkover = false;

  switch (resultValue) {
    case "1-0":
      resultWhite = 1;
      resultBlack = 0;
      break;

    case "0.5-0.5":
      resultWhite = 0.5;
      resultBlack = 0.5;
      break;

    case "0-1":
      resultWhite = 0;
      resultBlack = 1;
      break;

    case "wo-white":
      resultWhite = 1;
      resultBlack = 0;
      isWalkover = true;
      break;

    case "wo-black":
      resultWhite = 0;
      resultBlack = 1;
      isWalkover = true;
      break;

    default:
      throw new Error("Resultado inválido");
  }

  const { error } = await supabase.rpc("register_match", {
  p_tournament_id: tournamentId,
  p_round: roundNumber,
  p_white: whitePlayer,
  p_black: blackPlayer,
  p_result_white: resultWhite,
  p_result_black: resultBlack,
  p_referee_id: refereeId,
  p_is_walkover: isWalkover
  });



  if (error) {
    if (error.message.includes("unique_match_per_round")) {
      throw new Error("Esse confronto já foi registrado nessa rodada");
    }
    throw error;
  }

  alert("Partida registrada com sucesso");
  form.reset();
}

const matchesList = document.getElementById("matches-list");

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

  if (error) {
    console.error(error);
    return;
  }

  matchesList.innerHTML = "";

  data.forEach(match => {
    const li = document.createElement("li");

    li.textContent =
      `Rodada ${match.round_number} - ` +
      `${match.player_white.full_name} x ${match.player_black.full_name} `;

    if (refereeRole === "admin") {
      const btn = document.createElement("button");
      btn.textContent = "Desfazer";
      btn.onclick = () => rollbackMatch(match.id);
      li.appendChild(btn);
    }

    matchesList.appendChild(li);
  });
}

async function rollbackMatch(matchId) {
  const reason = prompt("Motivo do rollback (opcional):");

  if (reason === null) return;

  const { error } = await supabase.rpc("rollback_match", {
    p_match_id: matchId,
    p_referee_id: user.id,
    p_reason: reason
  });

  if (error) {
    console.error(error);
    alert(error.message || "Erro ao realizar rollback");
    return;
  }

  alert("Rollback realizado com sucesso");

  await loadRecentMatches();
}



loadRecentMatches();
