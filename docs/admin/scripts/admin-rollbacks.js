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
  const { data, error } = await supabase
    .from("match_rollbacks")
    .select(`
      created_at,
      reason,
      referee:referee_id(full_name),
      match:match_id(
        round_number,
        player_white:player_white(full_name),
        player_black:player_black(full_name)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    alert(error.message);
    return;
  }

  tableBody.innerHTML = "";

  data.forEach(rb => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${new Date(rb.created_at).toLocaleString()}</td>
      <td>
        Rodada ${rb.match.round_number} —
        ${rb.match.player_white.full_name}
        x
        ${rb.match.player_black.full_name}
      </td>
      <td>${rb.referee.full_name}</td>
      <td>${rb.reason}</td>
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
