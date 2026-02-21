import { supabase } from "../scripts/services/supabase.js";

const form = document.getElementById("set-password-form");
const message = document.getElementById("message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.updateUser({
    password
  });

  if (error) {
    message.textContent = "Erro ao definir senha: " + error.message;
    message.style.color = "red";
    return;
  }

  message.textContent = "Senha criada com sucesso. Você já pode entrar.";
  message.style.color = "green";
});
