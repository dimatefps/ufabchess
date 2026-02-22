import { supabase } from "./supabase.js";

/* =======================
   AUTH CHECK
======================= */

const {
  data: { user }
} = await supabase.auth.getUser();

if (!user) {
  window.location.href = "../pages/admin-login.html";
}

/* =======================
   REFEREE CHECK (ADMIN ONLY)
======================= */

const { data: referee, error } = await supabase
  .from("referees")
  .select("full_name, role")
  .eq("id", user.id)
  .single();

if (error || !referee || referee.role !== "admin") {
  alert("Acesso restrito a administradores.");
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
}

/* =======================
   SHOW NAME
======================= */

const nameEl = document.getElementById("referee-name");
if (nameEl) nameEl.textContent = referee.full_name;

/* =======================
   LOGOUT
======================= */

document.getElementById("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
});

/* =======================
   LOAD ROLLBACKS
======================= */

const tableBody = document.getElementById("rollback-table");

async function loadRollbacks() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">
        Carregando...
      </td>
    </tr>`;

  const { data: rollbacks, error } = await supabase
    .from("match_rollbacks")
    .select(`
      created_at,
      reason,
      round_number,
      referee_id,
      player_white,
      player_black
    `)
    .order("created_at", { ascending: false });

  if (error) {
    tableBody.innerHTML = `<tr><td colspan="4" style="color:#fca5a5;padding:16px;">Erro ao carregar: ${error.message}</td></tr>`;
    return;
  }

  if (!rollbacks || rollbacks.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum rollback registrado.</td></tr>`;
    return;
  }

  // Batch-fetch names
  const playerIds  = [...new Set(rollbacks.flatMap(rb => [rb.player_white, rb.player_black].filter(Boolean)))];
  const refereeIds = [...new Set(rollbacks.map(rb => rb.referee_id).filter(Boolean))];

  const [{ data: players }, { data: referees }] = await Promise.all([
    supabase.from("players").select("id, full_name").in("id", playerIds),
    supabase.from("referees").select("id, full_name").in("id", refereeIds)
  ]);

  const playerMap  = Object.fromEntries((players  ?? []).map(p => [p.id, p.full_name]));
  const refereeMap = Object.fromEntries((referees ?? []).map(r => [r.id, r.full_name]));

  tableBody.innerHTML = "";

  rollbacks.forEach(rb => {
    const tr = document.createElement("tr");

    const white = playerMap[rb.player_white] ?? "?";
    const black = playerMap[rb.player_black] ?? "?";
    const ref   = refereeMap[rb.referee_id] ?? "—";
    const date  = new Date(rb.created_at).toLocaleString("pt-BR");

    tr.innerHTML = `
      <td style="color:var(--text-muted);white-space:nowrap;font-size:.82rem;">${date}</td>
      <td>
        <span style="font-weight:600;color:var(--text-primary);">Rd ${rb.round_number ?? "?"}</span>
        <span style="color:var(--text-muted);font-size:.85rem;margin-left:6px;">♔ ${white} vs ♚ ${black}</span>
      </td>
      <td style="color:var(--text-secondary);">${ref}</td>
      <td style="color:var(--text-muted);font-style:${rb.reason ? "normal" : "italic"};">${rb.reason || "Sem motivo informado"}</td>
    `;

    tableBody.appendChild(tr);
  });
}

loadRollbacks();