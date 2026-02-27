import {
  getFinishedTournaments,
  getStandingsByTournament,
  getOngoingTournament,
  getOngoingStandings
} from "../services/tournaments.service.js";

/* ══════════════════════════════════════
   TITLE BADGE LOGIC
   Requisito: mínimo 10 partidas jogadas
   CMF ≥ 1600 | MF ≥ 1800 | GMF ≥ 2000
   ══════════════════════════════════════ */
function getTitleBadge(rating, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed < 10) return "";
  if (rating >= 2000) return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (rating >= 1800) return `<span class="title-badge mf"  title="Mestre Federal">MF</span>`;
  if (rating >= 1600) return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

/* ── Nome clicável → perfil público ── */
function playerLink(player) {
  const name = player?.full_name ?? "-";
  if (!player?.id) return name;
  return `<a href="./jogador.html?id=${player.id}"
    style="color:inherit;text-decoration:none;font-weight:inherit;transition:color .18s ease;"
    onmouseover="this.style.color='var(--green)'"
    onmouseout="this.style.color=''"
  >${name}</a>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const ongoingContainer  = document.getElementById("ongoing-tournament");
  const finishedContainer = document.getElementById("tournaments-list");

  try {
    if (ongoingContainer)  await loadOngoingTournament(ongoingContainer);
    if (finishedContainer) await loadFinishedTournaments(finishedContainer);
  } catch (err) {
    console.error("Erro geral:", err);
  }
});

/* ── Torneio em andamento ── */
async function loadOngoingTournament(container) {
  const tournament = await getOngoingTournament();

  if (!tournament) {
    container.innerHTML = `
      <div class="tournament" style="text-align:center;padding:40px 28px;">
        <p style="color:var(--text-muted);font-size:.95rem;">Nenhum torneio em andamento no momento.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="tournament tournament-ongoing">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <div>
          <div class="live-badge">Em Andamento</div>
          <h3 style="margin-top:8px;margin-bottom:0;">${tournament.name}</h3>
          ${tournament.edition ? `<p style="margin-bottom:0;">Edição ${tournament.edition}</p>` : ""}
        </div>
        <a href="./meu-perfil.html"
          style="display:inline-flex;align-items:center;gap:7px;
                 background:var(--green);color:#052e16;font-family:var(--font-body);
                 font-size:.82rem;font-weight:700;padding:9px 18px;
                 border-radius:var(--radius-sm);text-decoration:none;
                 white-space:nowrap;transition:opacity .18s ease;"
          onmouseover="this.style.opacity='.85'"
          onmouseout="this.style.opacity='1'"
        >♟️ Participar do torneio</a>
      </div>
      <div class="standings">
        <div style="color:var(--text-muted);font-size:.88rem;padding:12px 0;">Carregando classificação...</div>
      </div>
    </div>`;

  const standingsEl = container.querySelector(".standings");

  async function loadStandings() {
    try {
      const standings = await getOngoingStandings(tournament.id);
      standingsEl.innerHTML = renderStandingsTable(standings, "ongoing");
    } catch (err) {
      console.error(err);
      standingsEl.innerHTML = `<p style="color:var(--text-muted);">Erro ao carregar classificação.</p>`;
    }
  }

  await loadStandings();
  setInterval(loadStandings, 15000);
}

/* ── Torneios finalizados ── */
async function loadFinishedTournaments(container) {
  const tournaments = await getFinishedTournaments();

  if (!tournaments.length) {
    container.innerHTML = `
      <div class="tournament" style="text-align:center;padding:40px 28px;">
        <p style="color:var(--text-muted);">Nenhum torneio finalizado ainda.</p>
      </div>`;
    return;
  }

  for (const tournament of tournaments) {
    const section = document.createElement("div");
    section.className = "tournament";
    section.innerHTML = `
      <h3>${tournament.name}</h3>
      ${tournament.edition ? `<p>Edição ${tournament.edition}</p>` : ""}
      <div class="standings">
        <div style="color:var(--text-muted);font-size:.88rem;padding:12px 0;">Carregando...</div>
      </div>`;

    container.appendChild(section);

    const standingsEl = section.querySelector(".standings");
    const standings = await getStandingsByTournament(tournament.id);
    standingsEl.innerHTML = renderStandingsTable(standings, "finished");
  }
}

/* ── Tabela de classificação ── */
function renderStandingsTable(standings, type) {
  if (!standings || standings.length === 0) {
    return `<p style="color:var(--text-muted);font-size:.88rem;margin-top:8px;">Sem dados de classificação.</p>`;
  }

  const rows = standings.map((s, index) => {
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
  }).join("");

  return `
    <div class="table-responsive">
      <table class="standings-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jogador</th>
            <th>Pontos</th>
            <th>Partidas</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}