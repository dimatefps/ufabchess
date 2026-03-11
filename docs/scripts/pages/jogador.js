import { supabase } from "../services/supabase.js";

/* ══════════════════════════════════════════════
   JOGADOR.JS — Perfil público de um jogador
   Três abas: Progresso · Quadrimestral · Abertos
   ══════════════════════════════════════════════ */

function renderTitleBadge(title) {
  if (!title) return "";
  const t = title.toUpperCase();
  if (t === "GMF") return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (t === "MF")  return `<span class="title-badge mf" title="Mestre Federal">MF</span>`;
  if (t === "CMF") return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

let chartInstance = null;
let allHistory    = [];

/* ══════════════════════════════════
   INIT
   ══════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("player-content");
  const params    = new URLSearchParams(window.location.search);
  const playerId  = params.get("id");

  if (!playerId) { container.innerHTML = notFound("ID do jogador não informado."); return; }

  try {
    const { data: player, error } = await supabase
      .from("players").select("*").eq("id", playerId).maybeSingle();

    if (error || !player) { container.innerHTML = notFound("Jogador não encontrado."); return; }

    document.getElementById("page-title").textContent = player.full_name;
    document.title = `UFABCHESS — ${player.full_name}`;

    /* Rank global */
    const { count: totalPlayers } = await supabase
      .from("players").select("id", { count: "exact", head: true });
    const { count: playersAbove } = await supabase
      .from("players").select("id", { count: "exact", head: true })
      .gt("rating_rapid", player.rating_rapid ?? 0);
    const rank = (playersAbove ?? 0) + 1;

    /* Buscar tudo em paralelo */
    const [historyRes, mWhiteRes, mBlackRes, standingsRes] = await Promise.all([
      supabase
        .from("rating_history")
        .select("rating_before, rating_after, delta, time_control, created_at, match_id")
        .eq("player_id", playerId)
        .order("created_at", { ascending: true }),

      supabase
        .from("matches")
        .select("id, round_number, result_white, result_black, created_at, player_black:players!matches_player_black_fkey(id, full_name)")
        .eq("player_white", playerId)
        .order("created_at", { ascending: false }).limit(20),

      supabase
        .from("matches")
        .select("id, round_number, result_white, result_black, created_at, player_white:players!matches_player_white_fkey(id, full_name)")
        .eq("player_black", playerId)
        .order("created_at", { ascending: false }).limit(20),

      supabase
        .from("tournament_standings")
        .select("points, games_played, rating_at_end, tournaments(id, name, edition, type, status)")
        .eq("player_id", playerId),
    ]);

    allHistory = historyRes.data ?? [];

    const allMatches = [
      ...(mWhiteRes.data ?? []).map(m => ({
        id: m.id, opponent: m.player_black?.full_name ?? "?", opponentId: m.player_black?.id,
        myResult: Number(m.result_white), oppResult: Number(m.result_black), created_at: m.created_at
      })),
      ...(mBlackRes.data ?? []).map(m => ({
        id: m.id, opponent: m.player_white?.full_name ?? "?", opponentId: m.player_white?.id,
        myResult: Number(m.result_black), oppResult: Number(m.result_white), created_at: m.created_at
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const allStandings    = standingsRes.data ?? [];
    const standingsQuad   = allStandings.filter(s => s.tournaments?.type === "quadrimestral");
    const standingsDiario = allStandings.filter(s => s.tournaments?.type === "diario");

    /* Renderizar estrutura */
    container.innerHTML = renderSkeleton(player, rank, totalPlayers ?? 0);

    /* Tabs de seção */
    document.querySelectorAll(".profile-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".profile-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".profile-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
      });
    });

    /* Tabs de time-control */
    document.querySelectorAll(".tc-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tc-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderChart(tab.dataset.tc);
      });
    });

    /* Preencher cada painel */
    fillProgressoPanel(allHistory, allMatches);
    fillTournamentPanel("panel-quadrimestral", standingsQuad, "quadrimestral");
    fillTournamentPanel("panel-diario",        standingsDiario, "diario");

    renderChart("rapid");

  } catch (err) {
    console.error(err);
    container.innerHTML = notFound("Erro ao carregar perfil. Tente novamente.");
  }
});

/* ══════════════════════════════════
   SKELETON — header + stats + tabs
   ══════════════════════════════════ */
function renderSkeleton(player, rank, total) {
  const initials = player.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const badge    = renderTitleBadge(player.title);

  return `
    <div class="player-header">
      <div class="player-avatar">${initials}</div>
      <div class="player-info">
        <h2>${badge}${player.full_name}</h2>
        <div class="player-rank">
          Posição <strong style="color:var(--green)">#${rank}</strong> de ${total} jogadores
          ${player.level ? `· <span style="color:var(--text-muted);text-transform:capitalize;">${player.level}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${player.rating_rapid ?? 1200}</div>
        <div class="stat-label">Rating Rapid</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${player.games_played_rapid ?? 0}</div>
        <div class="stat-label">Partidas</div>
      </div>
      <div class="stat-card" id="stat-aproveitamento">
        <div class="stat-value">—</div>
        <div class="stat-label">Aproveit.</div>
      </div>
    </div>

    <!-- Tabs de navegação -->
    <div class="profile-tabs">
      <button class="profile-tab active" data-tab="progresso">📈 Progresso</button>
      <button class="profile-tab" data-tab="quadrimestral">🏆 Quadrimestral</button>
      <button class="profile-tab" data-tab="diario">🎯 Torneios Abertos</button>
    </div>

    <!-- Painel: Progresso Individual -->
    <div class="profile-panel active" id="panel-progresso">
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Evolução do Rating</div>
          <div class="chart-tc-tabs">
            <button class="tc-tab active" data-tc="rapid">Rapid</button>
            <button class="tc-tab" data-tc="blitz">Blitz</button>
            <button class="tc-tab" data-tc="standard">Standard</button>
          </div>
        </div>
        <div class="chart-canvas-wrap"><canvas id="rating-chart"></canvas></div>
        <div id="chart-empty" class="chart-empty" style="display:none;">
          Nenhuma partida registrada nesta modalidade.
        </div>
      </div>
      <div class="matches-card" id="matches-card">
        <div class="card-title" style="margin-bottom:16px;">Partidas Recentes</div>
        <div style="color:var(--text-muted);font-size:.88rem;">Carregando...</div>
      </div>
    </div>

    <!-- Painel: Quadrimestral -->
    <div class="profile-panel" id="panel-quadrimestral">
      <div style="color:var(--text-muted);font-size:.88rem;padding:24px 0;">Carregando...</div>
    </div>

    <!-- Painel: Torneios Abertos -->
    <div class="profile-panel" id="panel-diario">
      <div style="color:var(--text-muted);font-size:.88rem;padding:24px 0;">Carregando...</div>
    </div>`;
}

/* ══════════════════════════════════
   PAINEL PROGRESSO
   ══════════════════════════════════ */
function fillProgressoPanel(history, matches) {
  const rapHistory = history.filter(h => h.time_control === "rapid");
  const wins   = rapHistory.filter(h => h.delta > 0).length;
  const losses = rapHistory.filter(h => h.delta < 0).length;
  const draws  = rapHistory.filter(h => h.delta === 0).length;
  const total  = wins + losses + draws;

  const aprovEl = document.querySelector("#stat-aproveitamento .stat-value");
  if (aprovEl) aprovEl.textContent = total > 0 ? `${Math.round(wins / total * 100)}%` : "—";

  const matchesCard = document.getElementById("matches-card");
  if (!matchesCard) return;

  if (!matches.length) {
    matchesCard.innerHTML = `
      <div class="card-title" style="margin-bottom:16px;">Partidas Recentes</div>
      <div class="chart-empty">Nenhuma partida registrada ainda.</div>`;
    return;
  }

  matchesCard.innerHTML = `
    <div class="card-title" style="margin-bottom:16px;">Partidas Recentes</div>
    ${matches.slice(0, 10).map(renderMatchRow).join("")}`;
}

function renderMatchRow(m) {
  let resultLabel, resultClass;
  if (m.myResult === 1)      { resultLabel = "Vitória"; resultClass = "win"; }
  else if (m.myResult === 0) { resultLabel = "Derrota"; resultClass = "loss"; }
  else                       { resultLabel = "Empate";  resultClass = "draw"; }

  const histEntry = allHistory.find(h => h.match_id === m.id);
  const delta     = histEntry?.delta;
  const deltaHtml = delta !== undefined
    ? `<span class="match-delta ${delta >= 0 ? "pos" : "neg"}">${delta >= 0 ? "+" : ""}${delta}</span>`
    : `<span class="match-delta" style="color:var(--text-muted);">—</span>`;

  const opponentLink = m.opponentId
    ? `<a href="./jogador.html?id=${m.opponentId}" class="match-opponent" style="text-decoration:none;color:var(--text-primary);">${m.opponent}</a>`
    : `<span class="match-opponent">${m.opponent}</span>`;

  return `
    <div class="match-row">
      ${opponentLink}
      <span class="match-result ${resultClass}">${resultLabel}</span>
      ${deltaHtml}
    </div>`;
}

/* ══════════════════════════════════
   PAINEL TORNEIOS
   ══════════════════════════════════ */
function fillTournamentPanel(panelId, standings, type) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  if (!standings.length) {
    panel.innerHTML = `
      <div class="tournament-empty">
        <div class="tournament-empty-icon">${type === "quadrimestral" ? "🏆" : "🎯"}</div>
        <p>${type === "quadrimestral"
          ? "Este jogador ainda não participou de nenhum torneio quadrimestral."
          : "Este jogador ainda não participou de nenhum torneio aberto."}</p>
      </div>`;
    return;
  }

  const totalPoints = standings.reduce((acc, s) => acc + (s.points ?? 0), 0);
  const totalGames  = standings.reduce((acc, s) => acc + (s.games_played ?? 0), 0);

  const summaryHtml = `
    <div class="tournament-summary">
      <div class="summary-item">
        <span class="summary-value">${standings.length}</span>
        <span class="summary-label">Torneios</span>
      </div>
      <div class="summary-item">
        <span class="summary-value">${totalGames}</span>
        <span class="summary-label">Partidas</span>
      </div>
      <div class="summary-item">
        <span class="summary-value">${totalPoints}</span>
        <span class="summary-label">Pts acumulados</span>
      </div>
    </div>`;

  const cardsHtml = standings.map(s => {
    const t    = s.tournaments;
    const name = t?.edition ? `${t.name} · Ed. ${t.edition}` : (t?.name ?? "Torneio");
    const statusBadge = t?.status === "ongoing"
      ? `<span class="tournament-status-badge live">em andamento</span>`
      : `<span class="tournament-status-badge done">finalizado</span>`;

    return `
      <div class="player-tournament-card">
        <div class="ptc-header">
          <div>
            <div class="ptc-name">${name}</div>
            ${statusBadge}
          </div>
          <a href="./torneios.html" class="ptc-link">Ver torneio →</a>
        </div>
        <div class="ptc-stats">
          <div class="ptc-stat">
            <span class="ptc-stat-value">${s.points ?? 0}</span>
            <span class="ptc-stat-label">Pontos</span>
          </div>
          <div class="ptc-stat">
            <span class="ptc-stat-value">${s.games_played ?? 0}</span>
            <span class="ptc-stat-label">Partidas</span>
          </div>
          <div class="ptc-stat">
            <span class="ptc-stat-value" style="font-family:'Courier New',monospace;color:var(--green);">${s.rating_at_end ?? "—"}</span>
            <span class="ptc-stat-label">Rating final</span>
          </div>
        </div>
      </div>`;
  }).join("");

  panel.innerHTML = summaryHtml + cardsHtml;
}

/* ══════════════════════════════════
   GRÁFICO DE RATING
   ══════════════════════════════════ */
function renderChart(timeControl) {
  const canvas  = document.getElementById("rating-chart");
  const emptyEl = document.getElementById("chart-empty");
  if (!canvas) return;

  const filtered = allHistory.filter(h => h.time_control === timeControl);

  if (!filtered.length) {
    canvas.style.display  = "none";
    emptyEl.style.display = "block";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  canvas.style.display  = "block";
  emptyEl.style.display = "none";

  const labels = [], data = [];
  filtered.forEach((h, i) => {
    if (i === 0) { labels.push(formatDateShort(h.created_at) + " (início)"); data.push(h.rating_before); }
    labels.push(formatDateShort(h.created_at));
    data.push(h.rating_after);
  });

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: `Rating ${timeControl}`,
        data,
        borderColor: "#769656",
        backgroundColor: "rgba(118,150,86,0.08)",
        borderWidth: 2,
        pointRadius: data.length > 30 ? 2 : 4,
        pointBackgroundColor: "#769656",
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} pts` } }
      },
      scales: {
        x: { ticks: { color: "#6b6460", maxTicksLimit: 8, font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#6b6460", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}

function notFound(msg) {
  return `<div class="profile-loading">${msg}</div>`;
}