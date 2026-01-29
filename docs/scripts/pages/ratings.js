import { getCurrentRatings } from "../services/ratings.service.js";

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("ratings-table");

  try {
    const players = await getCurrentRatings();

    if (!players.length) {
      container.innerHTML = "<p>Nenhum jogador encontrado.</p>";
      return;
    }

    container.innerHTML = renderRatingsTable(players);

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Erro ao carregar o rating.</p>";
  }
});

function renderRatingsTable(players) {
  const rows = players.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.full_name}</td>
      <td>${p.rating_rapid}</td>
    </tr>
  `).join("");

  return `
    <table class="ratings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
