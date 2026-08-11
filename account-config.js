/**
 * Kaptain optional Account / Auto-Save config.
 *
 * Local encrypted autosave (optional). Visitors can skip it and use the site
 * exactly as before. Cloud sync fields stay empty until a separate free
 * Supabase project is wired up later.
 *
 * Never put service-role keys here. Anon key only, from a SEPARATE
 * Supabase project (not Nuvio's api.nuvio.tv).
 */
window.KAPTAIN_ACCOUNT = Object.assign({
  enabled: true,
  // When enabled without supabaseUrl/anonKey, local encrypted vault still works
  // (passphrase-protected localStorage). Cloud sync needs the fields below.
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Optional force: ?account=1 / ?account=0 (see account-vault.js).
  showUiWhenDisabled: false,
}, window.KAPTAIN_ACCOUNT || {});
