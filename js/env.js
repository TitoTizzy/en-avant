/* ==========================================================================
   EN AVANT — CONFIG FRONTEND PUBLIQUE
   Seules les clés PUBLIQUES sont autorisées ici (DAT — règle absolue) :
   l'anon key Supabase est conçue pour être exposée (RLS activée côté base).
   JAMAIS de service_role, Stripe secret ou Anthropic ici.
   ========================================================================== */

window.EA_ENV = {
  SUPABASE_URL: "https://rgtzwnihabkpudhwiuik.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndHp3bmloYWJrcHVkaHdpdWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMTQwNTIsImV4cCI6MjA5Njc5MDA1Mn0.msXNtDCLOw_LjKCslFvdA24wdHKgIT6T1mJOcep_LPw",
};
