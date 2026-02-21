import { supabase } from "./supabase.js";

export async function getCurrentRatings() {
  const { data, error } = await supabase
    .from("players")
    .select(`
      id,
      full_name,
      rating_rapid,
      games_played_rapid
    `)
    .order("rating_rapid", { ascending: false });

  if (error) throw error;
  return data;
}
