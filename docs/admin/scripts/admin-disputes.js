import { supabase } from "../../scripts/services/supabase.js";

/* ══════════════════════════════════════════════════════
   ADMIN — Disputas de Resultados
   Carrega todas as partidas com status "disputed" e
   permite ao árbitro definir o resultado final.
   
   Dependência: seção #section-disputes no admin.html
   (ver admin-disputes-snippet.html para o HTML a adicionar)
══════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  loadDisputes();
});

/* ══════════════════════════════════════════════════════
   CARREGAR DISPUTAS
══════════════════════════════════════════════════════ */

async function loadDisputes() {
  const container = document.getElementById("disputes-list");
  const badge     = document.getElementById("disputes-badge");
  if (!container) return;

  container.innerHTML = `
    <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:.88rem;">
      Carregando...
    </div>`;

  const { data, error } = await supabase.rpc("get_disputed_reports");

  if (error || !data?.success) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:#f87171;font-size:.88rem;">
        Erro ao carregar disputas: ${error?.message || "falha na RPC"}
      </div>`;
    return;
  }

  const disputes = data.disputes ?? [];

  // Atualizar badge no título da seção
  if (badge) {
    badge.textContent = disputes.length;
    badge.style.display = disputes.length > 0 ? "inline-flex" : "none";
  }

  if (!disputes.length) {
    container.innerHTML = `
      <div class="disputes-empty">
        <div style="font-size:2rem;margin-bottom:10px;">✅</div>
        <p>Nenhuma disputa pendente.</p>
      </div>`;
    return;
  }

  container.innerHTML = disputes.map(d => buildDisputeCard(d)).join("");

  // Bind nos botões de resolução
  container.querySelectorAll(".btn-resolve").forEach(btn => {
    btn.addEventListener("click", () => {
      const reportId   = btn.dataset.reportId;
      const whiteName  = btn.dataset.white;
      const blackName  = btn.dataset.black;
      openResolveModal(reportId, whiteName, blackName);
    });
  });
}

/* ══════════════════════════════════════════════════════
   CARD DE DISPUTA
══════════════════════════════════════════════════════ */

function buildDisputeCard(d) {
  const dateStr = formatDate(d.session_date);
  const reportedLabel = resultLabel(d.reported_result, true); // perspectiva brancas

  return `
    <div class="dispute-card" data-report-id="${d.report_id}">
      <div class="dispute-header">
        <div>
          <span class="dispute-tournament">${d.tournament_name} · R${d.round_number}</span>
          <span class="dispute-date">${dateStr}</span>
        </div>
        <span class="dispute-tag">Em disputa</span>
      </div>

      <div class="dispute-matchup">
        <div class="dispute-player">
          <span class="dispute-color white-piece">♙</span>
          <span class="dispute-name">${d.white_name}</span>
        </div>
        <span class="dispute-vs">vs</span>
        <div class="dispute-player">
          <span class="dispute-color black-piece">♟</span>
          <span class="dispute-name">${d.black_name}</span>
        </div>
      </div>

      <div class="dispute-info">
        <div class="dispute-row">
          <span class="dispute-label">Resultado reportado por ${d.reported_by_name}:</span>
          <span class="dispute-value">${resultLabelFull(d.reported_result, d.white_name, d.black_name)}</span>
        </div>
        ${d.admin_note ? `
        <div class="dispute-row">
          <span class="dispute-label">Motivo da contestação:</span>
          <span class="dispute-value dispute-reason">"${d.admin_note}"</span>
        </div>` : ""}
        <div class="dispute-row">
          <span class="dispute-label">Reportado em:</span>
          <span class="dispute-value">${formatDateTime(d.reported_at)}</span>
        </div>
      </div>

      <div class="dispute-actions">
        <button class="btn-resolve" 
          data-report-id="${d.report_id}"
          data-white="${d.white_name}"
          data-black="${d.black_name}">
          ⚖️ Resolver disputa
        </button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   MODAL DE RESOLUÇÃO
══════════════════════════════════════════════════════ */

function openResolveModal(reportId, whiteName, blackName) {
  const modal = document.getElementById("dispute-modal");
  if (!modal) return;

  document.getElementById("dmodal-white").textContent = whiteName;
  document.getElementById("dmodal-black").textContent = blackName;
  document.getElementById("dmodal-note").value = "";

  // Limpar seleção anterior
  modal.querySelectorAll(".dmodal-result-btn").forEach(b => b.classList.remove("selected"));

  modal.style.display = "flex";
  modal._reportId  = reportId;
  modal._whiteName = whiteName;
  modal._blackName = blackName;

  // Bind nos botões de resultado
  modal.querySelectorAll(".dmodal-result-btn").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll(".dmodal-result-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      modal._selectedResult = btn.dataset.result;
    };
  });
}

// Fechar modal
document.getElementById("dmodal-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("dispute-modal");
  if (modal) modal.style.display = "none";
});

// Fechar clicando fora
document.getElementById("dispute-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

// Confirmar resolução
document.getElementById("dmodal-confirm")?.addEventListener("click", async () => {
  const modal = document.getElementById("dispute-modal");
  if (!modal) return;

  const reportId = modal._reportId;
  const result   = modal._selectedResult;
  const note     = document.getElementById("dmodal-note").value.trim() || null;

  if (!result) {
    alert("Selecione um resultado antes de confirmar.");
    return;
  }

  const btn = document.getElementById("dmodal-confirm");
  btn.disabled = true; btn.textContent = "Salvando...";

  const { data, error } = await supabase.rpc("admin_resolve_dispute", {
    p_report_id:  reportId,
    p_result:     result,
    p_admin_note: note
  });

  btn.disabled = false; btn.textContent = "Confirmar resultado";

  if (error || data?.success === false) {
    alert(data?.error || error?.message || "Erro ao resolver disputa.");
    return;
  }

  modal.style.display = "none";
  await loadDisputes();

  // Atualizar lista de partidas recentes no admin principal (se existir a função)
  if (typeof loadRecentMatches === "function") loadRecentMatches();
});

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */

function resultLabel(result) {
  if (result === "draw")  return "Empate";
  if (result === "white") return "Vitória das Brancas";
  if (result === "black") return "Vitória das Pretas";
  return "—";
}

function resultLabelFull(result, whiteName, blackName) {
  if (result === "draw")  return `½–½ Empate`;
  if (result === "white") return `1–0 · Vitória de ${whiteName}`;
  if (result === "black") return `0–1 · Vitória de ${blackName}`;
  return "—";
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date   = new Date(dateStr + "T12:00:00");
  const days   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
