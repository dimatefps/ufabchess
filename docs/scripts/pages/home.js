import { getTop6Players } from "../services/top6.service.js";
import { getOngoingQuadrimestral } from '../services/tournaments.service.js';

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

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTournament();
});

async function loadCurrentTournament() {
  const labelEl = document.getElementById('tournament-time-control');
  const nameEl = document.getElementById('tournament-name');
  const detailsEl = document.getElementById('tournament-details');
  const btnEl = document.getElementById('tournament-action-btn');

  try {
    // Reutiliza a função que busca o torneio com status 'ongoing'
    const tournament = await getOngoingQuadrimestral();

    if (tournament) {
      // Mapeia o ritmo de jogo para exibição amigável
      const ritmo = tournament.time_control === 'rapid' ? 'Rápidas' : 
                    tournament.time_control === 'blitz' ? 'Blitz' : 'Standard';

      labelEl.textContent = `Torneio de Rápidas`;
      nameEl.textContent = `${tournament.name} — Edição ${tournament.edition}`;
      
      // Como agora os jogos são de segunda-feira:
      detailsEl.textContent = `Em andamento! Encontros presenciais toda segunda-feira na UFABC.`;
      
      btnEl.textContent = 'Ver Classificação';
      btnEl.href = 'pages/torneios.html';
    } else {
      // Caso não haja nenhum torneio ativo no momento (ex: férias ou intertemporada)
      labelEl.textContent = 'Intertemporada';
      nameEl.textContent = 'Próximo Torneio Em Breve';
      detailsEl.textContent = 'Fique atento ao grupo do WhatsApp e Instagram para as datas do próximo quadrimestral.';
      btnEl.textContent = 'Ver Edições Anteriores';
      btnEl.href = 'pages/torneios.html';
    }
  } catch (error) {
    console.error('Erro ao carregar torneio na home:', error);
    // Fallback amigável caso a conexão falhe
    labelEl.textContent = 'Torneio Semanal';
    nameEl.textContent = 'Torneio de Rápidas';
    detailsEl.textContent = 'Acontece toda segunda-feira. Venha participar!';
  }
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