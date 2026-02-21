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
      <td class="col-pos">${i + 1}</td>
      <td class="col-player">${p.full_name}</td>
      <td class="col-rating">${p.rating_rapid}</td>
    </tr>
  `).join("");

  // Retornando a tabela dentro de um wrapper para scroll mobile
  return `
    <div class="ratings-wrapper">
      <table class="ratings-table-main">
        <thead>
          <tr>
            <th class="col-pos">#</th>
            <th class="col-player">Jogador</th>
            <th class="col-rating">Rating</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}