import { getCurrentRatings } from "../services/ratings.service.js";

/* ══════════════════════════════════════
   TITLE BADGE LOGIC
   Requisito: mínimo 10 partidas jogadas
   CMF ≥ 1600 | MF ≥ 1800 | GMF ≥ 2000
   ══════════════════════════════════════ */
function getTitleBadge(rating, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed < 10) return "";
  if (rating >= 2000) return `<span class="title-badge gmf" title="Grande Mestre Federal — ${rating} pts">GMF</span>`;
  if (rating >= 1800) return `<span class="title-badge mf"  title="Mestre Federal — ${rating} pts">MF</span>`;
  if (rating >= 1600) return `<span class="title-badge cmf" title="Candidato a Mestre Federal — ${rating} pts">CMF</span>`;
  return "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("ratings-table");
  if (!container) return;

  try {
    const players = await getCurrentRatings();

    if (!players.length) {
      container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-muted);">
          Nenhum jogador encontrado.
        </div>`;
      return;
    }

    container.innerHTML = renderRatingsTable(players);

  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted);">
        Erro ao carregar o rating. Tente novamente mais tarde.
      </div>`;
  }
});

function renderRatingsTable(players) {
  const rankClass = (i) => i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";

  const rows = players.map((p, i) => {
    const badge   = getTitleBadge(p.rating_rapid, p.games_played_rapid);
    const rankCls = rankClass(i);

    /* ── Nome clicável → perfil público ── */
    const nameLink = `<a href="./jogador.html?id=${p.id}"
      style="color:var(--text-primary);text-decoration:none;font-weight:500;
             transition:color .18s ease;"
      onmouseover="this.style.color='var(--green)'"
      onmouseout="this.style.color='var(--text-primary)'"
    >${p.full_name}</a>`;

    return `
      <tr class="fade-up" style="animation-delay:${i * 30}ms" data-name="${p.full_name.toLowerCase()}">
        <td class="col-pos ${rankCls}">${i + 1}</td>
        <td class="col-player">
          ${badge}${nameLink}
        </td>
        <td class="col-rating">${p.rating_rapid}</td>
      </tr>`;
  }).join("");

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
        <tbody id="ratings-tbody">${rows}</tbody>
      </table>
    </div>`;
}

/* ── Filtro de busca (global para o onclick do HTML) ── */
window.filterRatings = function(query) {
  const tbody = document.getElementById("ratings-tbody");
  if (!tbody) return;

  const term = query.trim().toLowerCase();
  const rows = tbody.querySelectorAll("tr");
  let visible = 0;

  rows.forEach(row => {
    const name  = row.dataset.name || "";
    const match = name.includes(term);
    row.style.display = match ? "" : "none";
    if (match) visible++;
  });

  // Mensagem de "nenhum resultado"
  let noResult = tbody.querySelector(".no-result-row");
  if (!visible && term) {
    if (!noResult) {
      noResult = document.createElement("tr");
      noResult.className = "no-result-row";
      noResult.innerHTML = `<td colspan="3" style="text-align:center;padding:28px;color:var(--text-muted);font-size:.88rem;">Nenhum jogador encontrado para "<strong style="color:var(--text-secondary)">${query}</strong>"</td>`;
      tbody.appendChild(noResult);
    } else {
      noResult.querySelector("td").innerHTML = `Nenhum jogador encontrado para "<strong style="color:var(--text-secondary)">${query}</strong>"`;
      noResult.style.display = "";
    }
  } else if (noResult) {
    noResult.style.display = "none";
  }
};
