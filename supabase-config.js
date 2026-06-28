/* supabase-config.js
   ─────────────────────────────────────────────────────────────
   STEP 1: After creating your Supabase project at supabase.com,
           replace the two placeholder values below with your
           project URL and anon/public key.
           
   Where to find them:
     Supabase Dashboard → Your Project → Settings → API
   ─────────────────────────────────────────────────────────────
*/
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
