import {
  getOngoingQuadrimestral,
  getFinishedQuadrimestrais,
  getOngoingStandings,
  getSessionsByTournament,
  getStandingsByTournament,
  getOngoingDiario,
  getFinishedDiarios,
  getDiarioStandings,
} from "../services/tournaments.service.js";

/* ══════════════════════════════════════
   TITLE BADGE
   ══════════════════════════════════════ */
function getTitleBadge(rating, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed < 10) return "";
  if (rating >= 2000) return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (rating >= 1800) return `<span class="title-badge mf" title="Mestre Federal">MF</span>`;
  if (rating >= 1600) return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

function playerLink(player) {
  const name = player?.full_name ?? "-";
  if (!player?.id) return name;
  return `<a href="./jogador.html?id=${player.id}"
    style="color:inherit;text-decoration:none;font-weight:inherit;transition:color .18s ease;"
    onmouseover="this.style.color='var(--green)'"
    onmouseout="this.style.color=''"
  >${name}</a>`;
}

/* ══════════════════════════════════════
   TABS
   ══════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // Tab switching
  document.querySelectorAll(".type-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".type-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  // Carregar ambas as abas em paralelo
  try {
    await Promise.all([
      loadQuadrimestral(),
      loadDiario(),
    ]);
  } catch (err) {
    console.error("Erro geral:", err);
  }
});

/* ══════════════════════════════════════
   ABA QUADRIMESTRAL
   ══════════════════════════════════════ */
async function loadQuadrimestral() {
  const ongoingEl  = document.getElementById("ongoing-quadrimestral");
  const finishedEl = document.getElementById("finished-quadrimestral");

  // Em andamento
  const tournament = await getOngoingQuadrimestral();

  if (!tournament) {
    ongoingEl.innerHTML = `
      <div class="tournament" style="text-align:center;padding:40px 28px;">
        <p style="color:var(--text-muted);font-size:.95rem;">Nenhum torneio quadrimestral em andamento.</p>
      </div>`;
  } else {
    await renderOngoingQuadrimestral(ongoingEl, tournament);
  }

  // Finalizados
  const finished = await getFinishedQuadrimestrais();
  if (!finished?.length) {
    finishedEl.innerHTML = `
      <div class="tournament" style="text-align:center;padding:32px 28px;">
        <p style="color:var(--text-muted);">Nenhuma edição finalizada ainda.</p>
      </div>`;
  } else {
    await renderFinishedList(finishedEl, finished, "quadrimestral");
  }
}

async function renderOngoingQuadrimestral(container, tournament) {
  // Buscar dias (sessões) para mostrar progresso
  const sessions = await getSessionsByTournament(tournament.id);
  const diasHtml = sessions.map(s => {
    const cls = s.status === "finished" ? "done"
              : s.status === "in_progress" ? "active" : "";
    return `<span class="dia-pill ${cls}">Dia ${s.session_number}</span>`;
  }).join("");

  container.innerHTML = `
    <div class="tournament tournament-ongoing">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div>
          <div class="type-badge quadrimestral">🏆 Quadrimestral</div>
          <div class="live-badge" style="margin-top:6px;">Em Andamento</div>
          <h3 style="margin-top:8px;margin-bottom:0;">${tournament.name}</h3>
          ${tournament.edition ? `<p style="margin-bottom:0;">Edição ${tournament.edition}</p>` : ""}
          ${sessions.length ? `<div class="dias-track" style="margin-top:10px;">${diasHtml}</div>` : ""}
        </div>
        <a href="./meu-perfil.html"
          style="display:inline-flex;align-items:center;gap:7px;
                 background:var(--green);color:#052e16;font-family:var(--font-body);
                 font-size:.82rem;font-weight:700;padding:9px 18px;
                 border-radius:var(--radius-sm);text-decoration:none;
                 white-space:nowrap;transition:opacity .18s ease;"
          onmouseover="this.style.opacity='.85'"
          onmouseout="this.style.opacity='1'"
        >♟️ Participar</a>
      </div>
      <div class="standings">
        <div style="color:var(--text-muted);font-size:.88rem;padding:12px 0;">Carregando classificação...</div>
      </div>
    </div>`;

  const standingsEl = container.querySelector(".standings");

  async function loadStandings() {
    try {
      const standings = await getOngoingStandings(tournament.id);
      const isExpanded = standingsEl.querySelector(".btn-ver-menos") !== null;
      standingsEl.innerHTML = renderStandingsTable(standings, "ongoing", !isExpanded);
      if (!isExpanded) setupVerMais(standingsEl, standings, "ongoing");
    } catch (err) {
      console.error(err);
      standingsEl.innerHTML = `<p style="color:var(--text-muted);">Erro ao carregar classificação.</p>`;
    }
  }

  await loadStandings();
  setInterval(loadStandings, 15000);
}

/* ══════════════════════════════════════
   ABA TORNEIO ABERTO (DIÁRIO)
   ══════════════════════════════════════ */
async function loadDiario() {
  const ongoingEl  = document.getElementById("ongoing-diario");
  const finishedEl = document.getElementById("finished-diario");

  // Em andamento
  const tournament = await getOngoingDiario();

  if (!tournament) {
    ongoingEl.innerHTML = `
      <div class="tournament" style="text-align:center;padding:40px 28px;">
        <p style="color:var(--text-muted);font-size:.95rem;">Nenhum torneio aberto em andamento hoje.</p>
      </div>`;
  } else {
    await renderOngoingDiario(ongoingEl, tournament);
  }

  // Histórico
  const finished = await getFinishedDiarios();
  if (!finished?.length) {
    finishedEl.innerHTML = `
      <div class="tournament" style="text-align:center;padding:32px 28px;">
        <p style="color:var(--text-muted);">Nenhum torneio aberto finalizado ainda.</p>
      </div>`;
  } else {
    await renderFinishedList(finishedEl, finished, "diario");
  }
}

async function renderOngoingDiario(container, tournament) {
  container.innerHTML = `
    <div class="tournament tournament-ongoing" style="border-color:var(--yellow);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div>
          <div class="type-badge diario">🎯 Torneio Aberto</div>
          <div class="live-badge" style="margin-top:6px;">Em Andamento</div>
          <h3 style="margin-top:8px;margin-bottom:0;">${tournament.name}</h3>
          ${tournament.edition ? `<p style="margin-bottom:0;">Edição ${tournament.edition}</p>` : ""}
        </div>
        <a href="./meu-perfil.html"
          style="display:inline-flex;align-items:center;gap:7px;
                 background:var(--yellow);color:#1a1208;font-family:var(--font-body);
                 font-size:.82rem;font-weight:700;padding:9px 18px;
                 border-radius:var(--radius-sm);text-decoration:none;
                 white-space:nowrap;transition:opacity .18s ease;"
          onmouseover="this.style.opacity='.85'"
          onmouseout="this.style.opacity='1'"
        >♟️ Participar</a>
      </div>
      <div class="standings">
        <div style="color:var(--text-muted);font-size:.88rem;padding:12px 0;">Carregando classificação...</div>
      </div>
    </div>`;

  const standingsEl = container.querySelector(".standings");

  async function loadStandings() {
    try {
      const standings = await getDiarioStandings(tournament.id);
      const isExpanded = standingsEl.querySelector(".btn-ver-menos") !== null;
      standingsEl.innerHTML = renderStandingsTable(standings, "ongoing", !isExpanded);
      if (!isExpanded) setupVerMais(standingsEl, standings, "ongoing");
    } catch (err) {
      console.error(err);
      standingsEl.innerHTML = `<p style="color:var(--text-muted);">Erro ao carregar.</p>`;
    }
  }

  await loadStandings();
  setInterval(loadStandings, 15000);
}

/* ══════════════════════════════════════
   LISTA DE FINALIZADOS (ACCORDION)
   Funciona para quadrimestral e diário
   ══════════════════════════════════════ */
async function renderFinishedList(container, tournaments, type) {
  container.innerHTML = "";

  for (const t of tournaments) {
    const section = document.createElement("div");
    section.className = "tournament";

    const badge = type === "diario"
      ? `<span class="type-badge diario" style="margin-bottom:6px;">🎯 Torneio Aberto</span>`
      : "";

    section.innerHTML = `
      <div class="tournament-accordion-header"
        style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;user-select:none;">
        <div>
          ${badge}
          <h3 style="margin-bottom:2px;">${t.name}</h3>
          ${t.edition
            ? `<p style="margin-bottom:0;color:var(--text-muted);font-size:.85rem;">Edição ${t.edition}</p>`
            : ""}
        </div>
        <span class="accordion-arrow"
          style="font-size:1rem;color:var(--text-muted);transition:transform .25s ease;flex-shrink:0;">▼</span>
      </div>
      <div class="accordion-body" style="display:none;margin-top:14px;">
        <div style="color:var(--text-muted);font-size:.88rem;padding:8px 0;">Carregando...</div>
      </div>`;

    container.appendChild(section);

    let loaded = false;
    const header = section.querySelector(".tournament-accordion-header");
    const body   = section.querySelector(".accordion-body");
    const arrow  = section.querySelector(".accordion-arrow");

    header.addEventListener("click", async () => {
      const isOpen = body.style.display !== "none";
      if (isOpen) {
        body.style.display    = "none";
        arrow.style.transform = "rotate(0deg)";
      } else {
        body.style.display    = "block";
        arrow.style.transform = "rotate(180deg)";
        if (!loaded) {
          loaded = true;
          try {
            const standings = await getStandingsByTournament(t.id);
            body.innerHTML  = renderStandingsTable(standings, "finished", false);
          } catch (err) {
            body.innerHTML = `<p style="color:var(--text-muted);">Erro ao carregar.</p>`;
          }
        }
      }
    });
  }
}

/* ══════════════════════════════════════
   TABELA DE CLASSIFICAÇÃO
   ══════════════════════════════════════ */
const PREVIEW_COUNT = 5;

function renderStandingsTable(standings, type, collapsed) {
  if (!standings?.length) {
    return `<p style="color:var(--text-muted);font-size:.88rem;margin-top:8px;">Sem dados de classificação.</p>`;
  }

  const showAll = !collapsed || standings.length <= PREVIEW_COUNT;
  const visible = showAll ? standings : standings.slice(0, PREVIEW_COUNT);
  const rows    = visible.map((s, i) => buildRow(s, i, type)).join("");

  const hiddenCount = standings.length - PREVIEW_COUNT;
  const moreRow = (!showAll && hiddenCount > 0) ? `
    <tr>
      <td colspan="5" style="text-align:center;padding:10px;color:var(--text-muted);font-size:.82rem;font-style:italic;">
        e mais ${hiddenCount} jogador${hiddenCount > 1 ? "es" : ""}…
      </td>
    </tr>` : "";

  return `
    <div class="table-responsive">
      <table class="standings-table">
        <thead>
          <tr><th>Pos</th><th>Jogador</th><th>Pontos</th><th>Partidas</th><th>Rating</th></tr>
        </thead>
        <tbody class="standings-tbody">${rows}${moreRow}</tbody>
      </table>
    </div>
    ${!showAll ? `
      <div style="text-align:center;margin-top:12px;">
        <button class="btn-ver-mais btn-secondary" style="font-size:.85rem;padding:8px 22px;">
          Ver todos os ${standings.length} jogadores ▾
        </button>
      </div>` : ""}`;
}

function buildRow(s, index, type) {
  let rating = "-";
  const gamesPlayed = s.players?.games_played_rapid ?? 0;

  if (type === "ongoing") {
    const tc = s.tournaments?.time_control;
    if (tc === "rapid")    rating = s.players?.rating_rapid;
    else if (tc === "blitz")    rating = s.players?.rating_blitz;
    else if (tc === "standard") rating = s.players?.rating_standard;
  } else {
    rating = s.rating_at_end;
  }

  const badge     = getTitleBadge(Number(rating), gamesPlayed);
  const rankClass = index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "";

  return `
    <tr>
      <td class="${rankClass}" style="font-weight:700;">${index + 1}</td>
      <td>${badge}${playerLink(s.players)}</td>
      <td>${s.points ?? 0}</td>
      <td>${s.games_played ?? 0}</td>
      <td style="font-family:'Courier New',monospace;font-weight:700;color:var(--green);">${rating ?? "-"}</td>
    </tr>`;
}

/* ══════════════════════════════════════
   VER MAIS / VER MENOS
   ══════════════════════════════════════ */
function setupVerMais(container, standings, type) {
  const btn = container.querySelector(".btn-ver-mais");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const tbody = container.querySelector(".standings-tbody");
    if (!tbody) return;
    tbody.innerHTML = standings.map((s, i) => buildRow(s, i, type)).join("");
    btn.textContent = "Ver menos ▴";
    btn.className   = "btn-ver-menos btn-secondary";
    btn.style.cssText = "font-size:.85rem;padding:8px 22px;";
    btn.onclick = () => {
      container.innerHTML = renderStandingsTable(standings, type, true);
      setupVerMais(container, standings, type);
    };
  });
}