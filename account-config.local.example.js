/**
 * Copy to account-config.local.js (gitignored) and fill in for local testing.
 * Loaded after account-config.js when present — see index.html comment.
 */
window.KAPTAIN_ACCOUNT = Object.assign({}, window.KAPTAIN_ACCOUNT || {}, {
  enabled: true,
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',
});
