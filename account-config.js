/**
 * Kaptain optional Account / Auto-Save config.
 *
 * DEFAULT: disabled — anonymous visitors behave exactly as today.
 * To test locally: set enabled:true (and optionally fill Supabase fields),
 * or create account-config.local.js (gitignored) that overrides this object.
 *
 * Never put service-role keys here. Anon key only, from a SEPARATE
 * Supabase project (not Nuvio's api.nuvio.tv).
 */
window.KAPTAIN_ACCOUNT = Object.assign({
  enabled: false,
  // When enabled without supabaseUrl/anonKey, local encrypted vault still works
  // (passphrase-protected localStorage). Cloud sync needs the fields below.
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Optional: force UI on for layout testing without unlocking vault.
  // Prefer localStorage.setItem('kaptain_account_ui', '1') instead of committing true.
  showUiWhenDisabled: false,
}, window.KAPTAIN_ACCOUNT || {});
