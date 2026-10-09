/* Anyara Hills — connection settings.
 *
 * Fill these in from your Supabase project:
 *   Supabase dashboard → Project Settings → Data API
 *     URL           → SUPABASE_URL
 *     anon / public → SUPABASE_ANON_KEY
 *
 * The anon key is designed to be public — it identifies the project, it does not
 * grant access. Row Level Security in supabase/schema.sql is what actually gates
 * the data: reading pricing requires a signed-in user, writing requires an admin.
 *
 * NEVER put the service_role key in this file. It bypasses every policy, and this
 * file is served to the browser and committed to the repo.
 */
window.ANYARA_CONFIG = {
  SUPABASE_URL: 'https://onnzgykuumuvfsnestrc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_rMcFcYdulYse22lyLxHzIQ_k_t4Pe2l'
};
