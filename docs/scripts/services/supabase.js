import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://wnhvujnfkzsbqadjghng.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduaHZ1am5ma3pzYnFhZGpnaG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzgwMTksImV4cCI6MjA4NTAxNDAxOX0.9xAWVisUcT0pLKSOv-KIp9ahujjJ0_Vdv9WyD73H030";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Supabase client carregado", supabase);
