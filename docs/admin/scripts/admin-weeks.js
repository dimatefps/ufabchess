/* ══════════════════════════════════════════════════════
   ADMIN — Gerenciamento de Semanas de Torneio
══════════════════════════════════════════════════════ */

import { supabase } from "../../scripts/services/supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
  const weekTournamentSelect = document.getElementById("week-tournament-select");
  const weeksList            = document.getElementById("weeks-list");

  if (!weekTournamentSelect || !weeksList) return;

  // Carregar torneios em andamento no select
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, edition")
    .eq("status", "ongoing")
    .order("created_at", { ascending: false });

  if (tournaments) {
    tournaments.forEach(t => {
      const option       = document.createElement("option");
      option.value       = t.id;
      option.textContent = t.edition ? `${t.name} • Edição ${t.edition}` : t.name;
      weekTournamentSelect.appendChild(option);
    });
  }

  // ── Criar nova semana ───────────────────────────────────────
  document.getElementById("btn-create-week")?.addEventListener("click", async () => {
    const tournamentId = weekTournamentSelect.value;
    const weekNumber   = Number(document.getElementById("week-number").value);
    const matchDate    = document.getElementById("week-date").value;
    const maxPlayers   = Number(document.getElementById("week-max-players").value) || 18;

    if (!tournamentId || !weekNumber || !matchDate) {
      alert("Preencha todos os campos");
      return;
    }

    const { data, error } = await supabase.rpc("create_tournament_week", {
      p_tournament_id: tournamentId,
      p_week_number:   weekNumber,
      p_match_date:    matchDate,
      p_max_players:   maxPlayers
    });

    if (error) { alert(error.message || "Erro ao criar semana"); return; }

    alert("Semana criada com sucesso!");
    loadWeeks();
  });

  // ── Listar semanas abertas ──────────────────────────────────
  async function loadWeeks() {
    const { data: weeks, error } = await supabase
      .from("tournament_weeks")
      .select(`
        id, week_number, match_date, max_players, status,
        tournaments (name, edition)
      `)
      .in("status", ["open", "in_progress"])
      .order("match_date", { ascending: false });

    if (error) { console.error(error); return; }

    weeksList.innerHTML = "";

    if (!weeks || weeks.length === 0) {
      weeksList.innerHTML = "<li>Nenhuma semana aberta.</li>";
      return;
    }

    for (const week of weeks) {
      const { count } = await supabase
        .from("tournament_checkins")
        .select("id", { count: "exact", head: true })
        .eq("tournament_week_id", week.id);

      const li = document.createElement("li");
      li.innerHTML = `
        <span>
          Semana ${week.week_number} — ${week.tournaments?.name || "?"}
          (${week.match_date}) · ${count || 0}/${week.max_players} jogadores ·
          <strong style="color:${week.status === "open" ? "var(--color-primary)" : "#f0c03a"}">
            ${week.status}
          </strong>
        </span>`;

      // ── Botão Gerar Pareamento ────────────────────────────
      if (week.status === "open") {
        const btnPair       = document.createElement("button");
        btnPair.textContent = "Gerar Pareamento";
        btnPair.style.cssText = "background:#f0c03a;color:#1a1a1a;";

        btnPair.onclick = async () => {
          if (!confirm(
            `Gerar pareamento para Semana ${week.week_number}?\n` +
            `Isso fechará o check-in e enviará emails para todos os jogadores.`
          )) return;

          btnPair.disabled    = true;
          btnPair.textContent = "Gerando...";

          // 1) Gerar pareamento no banco
          const { data, error } = await supabase.rpc("generate_pairings", {
            p_tournament_week_id: week.id
          });

          if (error || !data?.success) {
            alert(error?.message || data?.error || "Erro ao gerar pareamento.");
            btnPair.disabled    = false;
            btnPair.textContent = "Gerar Pareamento";
            return;
          }

          // 2) Enviar emails via Edge Function
          btnPair.textContent = "Enviando emails...";

          // Buscar JWT da sessão atual para autenticar na Edge Function
          const { data: { session } } = await supabase.auth.getSession();
          const { data: emailData, error: emailError } = await supabase.functions.invoke(
            "notify-pairings",
            {
              body: { tournament_week_id: week.id },
              headers: { Authorization: `Bearer ${session?.access_token}` }
            }
          );

          if (emailError) {
            // Pareamento gerado com sucesso mesmo se email falhar — avisar mas não bloquear
            console.error("Erro ao enviar emails:", emailError);
            alert(
              `✅ Pareamento gerado!\n\n` +
              `⚠️ Houve um problema ao enviar os emails.\n` +
              `Verifique o console para mais detalhes.`
            );
          } else {
            const sent   = emailData?.sent   ?? 0;
            const failed = emailData?.results?.filter(r => r.status !== "enviado").length ?? 0;

            let msg = `✅ Pareamento gerado com sucesso!\n📧 ${sent} emails enviados.`;
            if (failed > 0) msg += `\n⚠️ ${failed} email(s) falharam — verifique o console.`;

            console.log("Resultado dos emails:", emailData?.results);
            alert(msg);
          }

          loadWeeks();
        };

        li.appendChild(btnPair);
      }

      // ── Botão Encerrar semana ─────────────────────────────
      const btnClose       = document.createElement("button");
      btnClose.textContent = "Encerrar";
      btnClose.style.cssText = "background:#ef4444;color:white;";

      btnClose.onclick = async () => {
        if (!confirm("Encerrar esta semana?")) return;

        const { error } = await supabase
          .from("tournament_weeks")
          .update({ status: "finished" })
          .eq("id", week.id);

        if (error) { alert(error.message); return; }

        loadWeeks();
      };

      li.appendChild(btnClose);
      weeksList.appendChild(li);
    }
  }

  loadWeeks();
});