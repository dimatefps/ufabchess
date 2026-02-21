import { getTop6Players } from "../services/top6.service.js";

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("top6-container");
  if (!container) return;

  try {
    const players = await getTop6Players();
    container.innerHTML = renderTop6(players);
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Erro ao carregar ranking.</p>";
  }
});

function renderTop6(players) {
  return `
    <ol class="top6-list">
      ${players.map((p, index) => `
        <li>
          <span class="player-position">${index + 1}</span>
          <span class="player-name">${p.full_name}</span>
          <span class="player-rating">${p.rating_rapid}</span>
        </li>
      `).join("")}
    </ol>
  `;
}

