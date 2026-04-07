import { getTop6Players } from "../services/top6.service.js";

/* ══════════════════════════════════════
   TITLE BADGE LOGIC
   Requisito: mínimo 10 partidas jogadas
   CMF ≥ 1600 | MF ≥ 1800 | GMF ≥ 2000
   ══════════════════════════════════════ */
function renderTitleBadge(title) {
  if (!title) return "";
  const t = title.toUpperCase();
  if (t === "GMF") return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (t === "MF")  return `<span class="title-badge mf" title="Mestre Federal">MF</span>`;
  if (t === "CMF") return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("top6-container");
  if (!container) return;

  try {
    const players = await getTop6Players();
    container.innerHTML = renderTop6(players);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px;">Erro ao carregar ranking.</p>`;
  }
});

function renderTop6(players) {
  if (!players.length) {
    return `<p style="color:var(--text-muted);text-align:center;padding:20px;">Nenhum jogador encontrado.</p>`;
  }

  const items = players.map((p, index) => {
    const badge = renderTitleBadge(p.title);
    return `
      <li style="animation-delay:${index * 60}ms">
        <span class="player-position">${index + 1}</span>
        <span class="player-name">${badge}${p.full_name}</span>
        <span class="player-rating">${p.rating_rapid}</span>
      </li>`;
  }).join("");

  return `<ol class="top6-list">${items}</ol>`;
}