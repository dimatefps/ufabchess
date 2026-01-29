import {
  getFinishedTournaments,
  getStandingsByTournament
} from "../services/tournaments.service.js";

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("tournaments-list");

  try {
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
        <p>${tournament.edition}</p>
        <div class="standings">Carregando classificação...</div>
      `;

      container.appendChild(section);

      const standingsContainer = section.querySelector(".standings");
      const standings = await getStandingsByTournament(tournament.id);

      standingsContainer.innerHTML = renderStandingsTable(standings);
    }

  } catch (err) {
  console.error("Erro completo:", err);
  container.innerHTML = `
    <pre style="color:red; white-space:pre-wrap;">
${JSON.stringify(err, null, 2)}
    </pre>
  `;
  }

});

function renderStandingsTable(standings) {
  if (!standings.length) {
    return "<p>Sem dados de classificação.</p>";
  }

  const rows = standings.map((s, index) => `
  <tr>
    <td>${index + 1}</td>
    <td>${s.players.full_name}</td>
    <td>${s.points}</td>
    <td>${s.games_played}</td>
    <td>${s.rating_at_end ?? "-"}</td>
  </tr>
`).join("");


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
