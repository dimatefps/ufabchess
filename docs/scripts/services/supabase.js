import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://wnhvujnfkzsbqadjghng.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p2p_rTFA4X18FysJZgXNKQ_y--Wexe4";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Supabase client carregado", supabase);
