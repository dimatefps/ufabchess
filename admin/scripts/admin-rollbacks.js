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
   REFEREE CHECK (ADMIN)
======================= */

const { data: referee, error } = await supabase
  .from("referees")
  .select("full_name, role")
  .eq("id", user.id)
  .single();

if (error || !referee || referee.role !== "admin") {
  alert("Acesso restrito a administradores");
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
}

/* =======================
   SHOW NAME
======================= */

document.getElementById("referee-name").textContent =
  `Administrador: ${referee.full_name}`;

/* =======================
   LOAD ROLLBACKS
======================= */

const tableBody = document.getElementById("rollback-table");

async function loadRollbacks() {
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
    alert(error.message);
    return;
  }

  if (!rollbacks || rollbacks.length === 0) {
    tableBody.innerHTML = "<tr><td colspan='4'>Nenhum rollback encontrado</td></tr>";
    return;
  }

  const playerIds = new Set();
  const refereeIds = new Set();

  rollbacks.forEach(rb => {
    if (rb.player_white) playerIds.add(rb.player_white);
    if (rb.player_black) playerIds.add(rb.player_black);
    if (rb.referee_id) refereeIds.add(rb.referee_id);
  });

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name")
    .in("id", [...playerIds]);

  const { data: referees } = await supabase
    .from("referees")
    .select("id, full_name")
    .in("id", [...refereeIds]);

  const playerMap = Object.fromEntries(
    (players ?? []).map(p => [p.id, p.full_name])
  );

  const refereeMap = Object.fromEntries(
    (referees ?? []).map(r => [r.id, r.full_name])
  );

  tableBody.innerHTML = "";

  rollbacks.forEach(rb => {
    const tr = document.createElement("tr");

    const whiteName = playerMap[rb.player_white] ?? "?";
    const blackName = playerMap[rb.player_black] ?? "?";
    const refereeName = refereeMap[rb.referee_id] ?? "—";

    tr.innerHTML = `
      <td>${new Date(rb.created_at).toLocaleString()}</td>
      <td>Rodada ${rb.round_number ?? "?"} — ${whiteName} x ${blackName}</td>
      <td>${refereeName}</td>
      <td>${rb.reason ?? ""}</td>
    `;

    tableBody.appendChild(tr);
  });
}

loadRollbacks();

/* =======================
   LOGOUT
======================= */

document.getElementById("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "../pages/admin-login.html";
});
