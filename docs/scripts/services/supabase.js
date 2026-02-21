import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { ENV } from "./env.js"; // Importa as variáveis do env.js

// Agora sim, criamos a instância usando os valores de ENV
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);

console.log("Supabase client carregado com sucesso!");