import { getPairings } from "../services/pairings.service.js";
import { getOpenWeeks } from "../services/checkin.service.js";
import { getUser } from "../services/auth.service.js";
import { supabase } from "../services/supabase.js";

/* ══════════════════════════════════
   PAREAMENTO PAGE — múltiplas semanas
══════════════════════════════════ */

function getTitleBadge(rating, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed < 10) return "";
  if (rating >= 2000) return `<span class="title-badge gmf" title="GMF">GMF</span>`;
  if (rating >= 1800) return `<span class="title-badge mf"  title="MF">MF</span>`;
  if (rating >= 1600) return `<span class="title-badge cmf" title="CMF">CMF</span>`;
  return "";
}

let currentPlayerId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const weekInfo      = document.getElementById("pairing-week-info");
  const tabsContainer = document.getElementById("round-tabs");
  const content       = document.getElementById("pairings-content");

  // Identificar jogador logado para destacar seu nome
  const user = await getUser();
  if (user) {
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (player) currentPlayerId = player.id;
  }

  try {
    const weeks = await getOpenWeeks();

    if (!weeks.length) {
      weekInfo.innerHTML = "";
      tabsContainer.style.display = "none";
      content.innerHTML = `<div class="no-pairings">Nenhum torneio em andamento com pareamento disponível.</div>`;
      return;
    }

    // ── Se houver mais de uma semana, mostrar seletor de semanas ──
    if (weeks.length > 1) {
      weekInfo.innerHTML = `
        <div class="round-tabs" id="week-tabs" style="margin-bottom:8px;">
          ${weeks.map((w, i) => {
            const tn = w.tournaments?.name || "Torneio";
            return `<button class="round-tab ${i === 0 ? "active" : ""}" data-week-idx="${i}">
              ${tn} · Sem. ${w.week_number}
            </button>`;
          }).join("")}
        </div>`;

      // Listener para trocar de semana
      weekInfo.querySelectorAll("[data-week-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
          weekInfo.querySelectorAll("[data-week-idx]").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const idx = Number(btn.dataset.weekIdx);
          loadWeek(weeks[idx], tabsContainer, content);
        });
      });
    }

    // Carregar primeira semana por padrão
    await loadWeek(weeks[0], tabsContainer, content);

  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="no-pairings">Erro ao carregar pareamentos.</div>`;
  }
});

/* ── Carregar pareamentos de uma semana específica ── */
async function loadWeek(week, tabsContainer, content) {
  const tournamentName = week.tournaments?.name || "Torneio";
  const edition        = week.tournaments?.edition ? ` • Edição ${week.tournaments.edition}` : "";
  const dateStr        = formatDate(week.match_date);

  // Atualizar info da semana (só se não houver seletor de múltiplas semanas)
  const weekInfoEl = document.getElementById("pairing-week-info");
  const hasTabs    = weekInfoEl.querySelector("#week-tabs");

  if (!hasTabs) {
    weekInfoEl.innerHTML = `
      <div class="card" style="padding:16px 20px;">
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green);">
          Semana ${week.week_number}
        </span>
        <h3 style="font-size:1rem;margin-top:4px;">${tournamentName}${edition}</h3>
        <p style="font-size:.84rem;color:var(--text-secondary);margin-top:2px;">📅 ${dateStr} às ${week.match_time?.slice(0, 5) || "18:15"}</p>
      </div>`;
  }

  tabsContainer.style.display = "none";
  tabsContainer.innerHTML     = "";
  content.innerHTML           = `<div class="no-pairings">Carregando...</div>`;

  const pairings = await getPairings(week.id);

  if (!pairings || pairings.length === 0) {
    content.innerHTML = `
      <div class="no-pairings">
        <p>Pareamento ainda não foi gerado para esta semana.</p>
        <p style="font-size:.82rem;color:var(--text-muted);margin-top:8px;">O pareamento é publicado antes do início do torneio.</p>
      </div>`;
    return;
  }

  // Agrupar por rodada
  const rounds = {};
  pairings.forEach(p => {
    if (!rounds[p.round_number]) rounds[p.round_number] = [];
    rounds[p.round_number].push(p);
  });

  const roundNumbers = Object.keys(rounds).sort((a, b) => a - b);

  // Tabs de rodada
  tabsContainer.style.display = "flex";
  tabsContainer.innerHTML = roundNumbers.map((r, i) => `
    <button class="round-tab ${i === 0 ? "active" : ""}" data-round="${r}">
      Rodada ${r}
    </button>
  `).join("");

  renderRound(content, rounds[roundNumbers[0]], Number(roundNumbers[0]));

  tabsContainer.querySelectorAll(".round-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      tabsContainer.querySelectorAll(".round-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderRound(content, rounds[tab.dataset.round], Number(tab.dataset.round));
    });
  });
}

/* ── Renderizar rodada ── */
function renderRound(container, pairs, roundNumber) {
  if (!pairs || !pairs.length) {
    container.innerHTML = `<div class="no-pairings">Sem pareamentos para a rodada ${roundNumber}.</div>`;
    return;
  }

  pairs.sort((a, b) => a.table_number - b.table_number);

  const html = pairs.map((p, i) => {
    const white = p.player_white;
    const black = p.player_black;

    if (!black) {
      return `
        <div class="pairing-card bye-card" style="animation-delay:${i * 50}ms">
          <div class="pairing-table-label">BYE</div>
          <div style="padding:14px 18px;display:flex;align-items:center;gap:10px;font-size:.88rem;color:var(--text-secondary);">
            <strong>${white?.full_name || "?"}</strong> — folga nesta rodada
          </div>
        </div>`;
    }

    const isWhiteMe  = white?.id === currentPlayerId;
    const isBlackMe  = black?.id === currentPlayerId;
    const whiteBadge = getTitleBadge(white?.rating_rapid, white?.games_played_rapid);
    const blackBadge = getTitleBadge(black?.rating_rapid, black?.games_played_rapid);

    return `
      <div class="pairing-card" style="animation-delay:${i * 50}ms">
        <div class="pairing-table-label">Mesa ${p.table_number}</div>
        <div class="pairing-matchup">
          <div class="pairing-player white ${isWhiteMe ? "is-me" : ""}">
            <div class="color-indicator white-piece"></div>
            <div class="pairing-player-info">
              <div class="pairing-player-name">${whiteBadge}${white?.full_name || "?"}</div>
              <div class="pairing-player-rating">${white?.rating_rapid || "-"}</div>
            </div>
          </div>
          <div class="vs-divider">VS</div>
          <div class="pairing-player black ${isBlackMe ? "is-me" : ""}">
            <div class="color-indicator black-piece"></div>
            <div class="pairing-player-info">
              <div class="pairing-player-name">${blackBadge}${black?.full_name || "?"}</div>
              <div class="pairing-player-rating">${black?.rating_rapid || "-"}</div>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `<div class="pairings-grid">${html}</div>`;
}

function formatDate(dateStr) {
  const date   = new Date(dateStr + "T12:00:00");
  const days   = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}