import { supabase } from "../admin/scripts/supabase.js";

const form = document.getElementById("login-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert("Login inválido");
    return;
  }

  window.location.href = "../admin/admin.html";
});
