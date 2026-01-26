import { supabase } from "./supabase.js";

const tournamentSelect = document.getElementById("tournament-select");
const playerWhiteSelect = document.getElementById("player-white");
const playerBlackSelect = document.getElementById("player-black");

async function loadTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, edition")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar torneios", error);
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

const form = document.getElementById("match-form");
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (submitButton.disabled) return;

  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";

  try {
    await submitMatch();
  } catch (err) {
    alert(err.message || "Erro inesperado");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Registrar resultado";
  }
});



async function submitMatch() {
  const tournamentId = document.getElementById("tournament-select").value;
  const roundNumber = Number(document.getElementById("round-number").value);
  const whitePlayer = document.getElementById("player-white").value;
  const blackPlayer = document.getElementById("player-black").value;
  const resultValue = document.getElementById("match-result").value;

  if (!tournamentId || !roundNumber || !whitePlayer || !blackPlayer) {
    alert("Preencha todos os campos");
    return;
  }

  if (whitePlayer === blackPlayer) {
    alert("Jogadores não podem ser iguais");
    return;
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
      alert("Resultado inválido");
      return;
  }

  const { error } = await supabase.rpc("register_match", {
    p_tournament_id: tournamentId,
    p_round: roundNumber,
    p_white: whitePlayer,
    p_black: blackPlayer,
    p_result_white: resultWhite,
    p_result_black: resultBlack,
    p_is_walkover: isWalkover
  });

  if (error) {
  console.error(error);
  throw new Error("Erro ao registrar partida");
  }


  alert("Resultado registrado com sucesso");
  document.getElementById("match-form").reset();
}
