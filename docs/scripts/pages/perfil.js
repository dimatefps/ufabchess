import { getSession, getMyProfile, signOut } from "../services/auth.service.js";
import { getOpenWeek, getCheckins, doCheckin, cancelCheckin, isPlayerCheckedIn } from "../services/checkin.service.js";

/* ══════════════════════════════════
   PERFIL PAGE
══════════════════════════════════ */

/* Title badge logic (same as other pages) */
function renderTitleBadge(title) {
  if (!title) return "";
  const t = title.toUpperCase();
  if (t === "GMF") return `<span class="title-badge gmf" title="Grande Mestre Federal">GMF</span>`;
  if (t === "MF")  return `<span class="title-badge mf" title="Mestre Federal">MF</span>`;
  if (t === "CMF") return `<span class="title-badge cmf" title="Candidato a Mestre Federal">CMF</span>`;
  return "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("profile-content");

  // Auth check
  const session = await getSession();
  if (!session) {
    window.location.href = "./entrar.html";
    return;
  }

  try {
    const profile = await getMyProfile();

    if (!profile || !profile.found) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;">
          <p style="color:var(--text-muted);margin-bottom:16px;">Perfil de jogador não encontrado.</p>
          <p style="font-size:.85rem;color:var(--text-secondary);">Se você já jogou em torneios, verifique se o nome no cadastro é idêntico ao do ranking.</p>
          <button id="btn-logout" style="margin-top:20px;">Sair</button>
        </div>`;
      setupLogout();
      return;
    }

    // Load open week + checkins
    const week = await getOpenWeek();
    let checkins = [];
    let isCheckedIn = false;

    if (week) {
      checkins = await getCheckins(week.id);
      isCheckedIn = await isPlayerCheckedIn(week.id);
    }

    container.innerHTML = renderProfile(profile, week, checkins, isCheckedIn);

    // Setup event listeners
    setupLogout();
    setupCheckin(week, profile);

  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <p style="color:var(--text-muted);">Erro ao carregar perfil. Tente novamente.</p>
      </div>`;
  }
});

/* ── Render ── */

function renderProfile(profile, week, checkins, isCheckedIn) {
  const initials = profile.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
   const badge   = renderTitleBadge(p.title);

  const weekHtml = week ? renderCheckinSection(week, checkins, isCheckedIn) : `
    <div class="checkin-card">
      <div class="card-title">Próximo Torneio</div>
      <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.9rem;">
        Nenhum torneio aberto para check-in no momento.
      </div>
    </div>`;

  return `
    <div class="profile-grid">

      <!-- Header -->
      <div class="profile-header">
        <div class="profile-avatar">${initials}</div>
        <div class="profile-info">
          <h2>${badge}${profile.full_name}</h2>
          <div class="profile-email">${profile.email || ""}</div>
          <div class="profile-rank">${profile.rank}º de ${profile.total_players} jogadores no ranking</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="stat-card">
        <div class="stat-value">${profile.rating_rapid}</div>
        <div class="stat-label">Rating Rápidas</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${profile.games_played_rapid}</div>
        <div class="stat-label">Partidas Jogadas</div>
      </div>

      <!-- Check-in -->
      ${weekHtml}
    </div>

    <div class="profile-actions">
      <a href="./pareamento.html" class="btn-secondary">Ver Pareamentos →</a>
      <button id="btn-logout">Sair da conta</button>
    </div>`;
}

function renderCheckinSection(week, checkins, isCheckedIn) {
  const tournamentName = week.tournaments?.name || "Torneio";
  const edition = week.tournaments?.edition ? ` • Edição ${week.tournaments.edition}` : "";
  const dateStr = formatDate(week.match_date);
  const spotsLeft = week.max_players - checkins.length;

  // Check if checkin deadline passed
  const matchDateTime = new Date(`${week.match_date}T${week.match_time}`);
  const deadline = new Date(matchDateTime.getTime() - 3 * 60 * 60 * 1000);
  const deadlinePassed = new Date() > deadline;
  const deadlineStr = deadline.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let actionHtml;
  if (isCheckedIn) {
    actionHtml = deadlinePassed
      ? `<span class="checkin-status checkin-confirmed">Presença confirmada</span>`
      : `<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
           <span class="checkin-status checkin-confirmed">Confirmado</span>
           <button id="btn-cancel-checkin">Cancelar presença</button>
         </div>`;
  } else if (deadlinePassed) {
    actionHtml = `<span style="font-size:.82rem;color:var(--text-muted);">Check-in encerrado</span>`;
  } else if (spotsLeft <= 0) {
    actionHtml = `<span style="font-size:.82rem;color:#e88;">Vagas esgotadas</span>`;
  } else {
    actionHtml = `<button id="btn-checkin" class="btn-primary">Confirmar presença</button>`;
  }

  const checkinListHtml = checkins.length
    ? checkins.map((c, i) => `
        <div class="checkin-player" style="animation-delay:${i * 40}ms">
          <span class="cp-pos">${i + 1}</span>
          <span class="cp-name">${c.players?.full_name || "?"}</span>
          <span class="cp-rating">${c.players?.rating_rapid || "-"}</span>
        </div>`).join("")
    : `<div style="padding:14px;color:var(--text-muted);font-size:.85rem;">Nenhum jogador confirmado ainda.</div>`;

  return `
    <div class="checkin-card">
      <div class="card-title">Próximo Torneio</div>
      <div class="checkin-event">
        <div class="checkin-event-info">
          <h3>Semana ${week.week_number} — ${tournamentName}${edition}</h3>
          <p>📅 ${dateStr} às ${week.match_time?.slice(0, 5) || "18:15"}</p>
          <p class="slots"><strong>${checkins.length}</strong> / ${week.max_players} confirmados · ${spotsLeft > 0 ? `${spotsLeft} vagas restantes` : "Lotado"}</p>
          ${!deadlinePassed ? `<p style="font-size:.76rem;color:var(--text-muted);margin-top:2px;">Check-in encerra às ${deadlineStr}</p>` : ""}
        </div>
        ${actionHtml}
      </div>

      <div class="checkin-list">
        <div class="checkin-list-header">Jogadores confirmados</div>
        ${checkinListHtml}
      </div>
    </div>`;
}

/* ── Event Handlers ── */

function setupLogout() {
  const btn = document.getElementById("btn-logout");
  if (btn) {
    btn.addEventListener("click", async () => {
      await signOut();
      window.location.href = "./entrar.html";
    });
  }
}

function setupCheckin(week) {
  if (!week) return;

  // Check-in button
  const btnCheckin = document.getElementById("btn-checkin");
  if (btnCheckin) {
    btnCheckin.addEventListener("click", async () => {
      btnCheckin.disabled = true;
      btnCheckin.textContent = "Confirmando...";

      try {
        const result = await doCheckin(week.id);
        if (result?.success) {
          window.location.reload();
        } else {
          alert(result?.error || "Erro ao confirmar presença.");
          btnCheckin.disabled = false;
          btnCheckin.textContent = "Confirmar presença";
        }
      } catch (err) {
        alert(err.message || "Erro ao confirmar presença.");
        btnCheckin.disabled = false;
        btnCheckin.textContent = "Confirmar presença";
      }
    });
  }

  // Cancel button
  const btnCancel = document.getElementById("btn-cancel-checkin");
  if (btnCancel) {
    btnCancel.addEventListener("click", async () => {
      if (!confirm("Deseja cancelar sua presença nesta semana?")) return;

      btnCancel.disabled = true;
      btnCancel.textContent = "Cancelando...";

      try {
        const result = await cancelCheckin(week.id);
        if (result?.success) {
          window.location.reload();
        } else {
          alert(result?.error || "Erro ao cancelar.");
          btnCancel.disabled = false;
          btnCancel.textContent = "Cancelar presença";
        }
      } catch (err) {
        alert(err.message || "Erro ao cancelar.");
        btnCancel.disabled = false;
        btnCancel.textContent = "Cancelar presença";
      }
    });
  }
}

/* ── Helpers ── */

function formatDate(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}
