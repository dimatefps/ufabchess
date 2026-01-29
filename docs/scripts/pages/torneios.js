import {
  getFinishedTournaments,
  getStandingsByTournament,
  getOngoingTournament,
  getOngoingStandings
} from "../services/tournaments.service.js";

document.addEventListener("DOMContentLoaded", async () => {
  const ongoingContainer = document.getElementById("ongoing-tournament");
  const finishedContainer = document.getElementById("tournaments-list");

  try {
    if (ongoingContainer) {
      await loadOngoingTournament(ongoingContainer);
    }

    if (finishedContainer) {
      await loadFinishedTournaments(finishedContainer);
    }
  } catch (err) {
    console.error("Erro geral:", err);
  }
});



/* =========================
   TORNEIO EM ANDAMENTO
========================= */

async function loadOngoingTournament(container) {
  const tournament = await getOngoingTournament();

  if (!tournament) {
    container.innerHTML = "<p>Nenhum torneio em andamento.</p>";
    return;
  }

  container.innerHTML = `
    <section class="tournament tournament-ongoing">
      <h3>${tournament.name}</h3>
      ${tournament.edition ? `<p>Edição ${tournament.edition}</p>` : ""}
      <p><strong>Status:</strong> Em andamento</p>
      <div class="standings">Carregando classificação...</div>
    </section>
  `;

  const standingsContainer = container.querySelector(".standings");

  async function loadStandings() {
    try {
      const standings = await getOngoingStandings(tournament.id);
      standingsContainer.innerHTML =
        renderStandingsTable(standings, "ongoing");
    } catch (err) {
      console.error(err);
      standingsContainer.innerHTML =
        "<p>Erro ao carregar classificação.</p>";
    }
  }

  await loadStandings();
  setInterval(loadStandings, 15000);
}

/* =========================
   TORNEIOS FINALIZADOS
========================= */

async function loadFinishedTournaments(container) {
  const tournaments = await getFinishedTournaments();

  if (!tournaments.length) {
    container.innerHTML = "<p>Nenhum torneio encontrado.</p>";
    return;
  }

  for (const tournament of tournaments) {
    const section = document.createElement("section");
    section.className = "tournament";

    section.innerHTML = `
      <h3>${tournament.name}</h3>
      ${tournament.edition ? `<p>Edição ${tournament.edition}</p>` : ""}
      <div class="standings">Carregando classificação...</div>
    `;

    container.appendChild(section);

    const standingsContainer = section.querySelector(".standings");

    const standings = await getStandingsByTournament(tournament.id);
    standingsContainer.innerHTML =
      renderStandingsTable(standings, "finished");
  }
}

/* =========================
   TABELA
========================= */

function renderStandingsTable(standings, type) {
  if (!standings || standings.length === 0) {
    return "<p>Sem dados de classificação.</p>";
  }

  const rows = standings.map((s, index) => {
    const rating =
      type === "ongoing"
        ? s.players?.rating_rapid
        : s.rating_at_end;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${s.players?.full_name ?? "-"}</td>
        <td>${s.points ?? 0}</td>
        <td>${s.games_played ?? 0}</td>
        <td>${rating ?? "-"}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>Pontos</th>
          <th>Partidas</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
