/**
 * Kaptain Account Vault — optional encrypted auto-save for API keys +
 * collection edit state. Feature-flagged via window.KAPTAIN_ACCOUNT.
 *
 * Security: secrets are AES-GCM encrypted client-side with a key derived from
 * the user's vault passphrase (PBKDF2). The passphrase never leaves the device.
 * Cloud sync (optional) stores ciphertext only in a SEPARATE Supabase project.
 */
(function () {
  'use strict';

  const PAYLOAD_VERSION = 1;
  const PBKDF2_ITERS = 310000;
  const LOCAL_CIPHER_KEY = 'kaptain_vault_cipher_v1';
  const SESSION_META_KEY = 'kaptain_vault_session_v1';
  const FORCE_UI_KEY = 'kaptain_account_force';

  let cryptoKey = null;          // CryptoKey in memory while unlocked
  let sessionSaltB64 = null;
  let saveTimer = null;
  let authSession = null;        // { access_token, user_id, email } when cloud signed in
  let lastPayload = null;

  function cfg() {
    return window.KAPTAIN_ACCOUNT || { enabled: false };
  }

  /** ?account=1 turns the feature on for this browser; ?account=0 turns it off. */
  function applyUrlAccountFlag() {
    try {
      const q = new URLSearchParams(window.location.search || '');
      if (!q.has('account')) return;
      const v = String(q.get('account') || '').toLowerCase();
      if (v === '1' || v === 'true' || v === 'on' || v === 'yes') {
        localStorage.setItem(FORCE_UI_KEY, '1');
      } else if (v === '0' || v === 'false' || v === 'off' || v === 'no') {
        localStorage.removeItem(FORCE_UI_KEY);
      }
    } catch (e) { /* ignore */ }
  }

  function forceUiOn() {
    try {
      return localStorage.getItem(FORCE_UI_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  /** UI may show when force flag or enabled; cloud needs URL+anon. */
  function isEnabled() {
    return forceUiOn() || !!cfg().enabled;
  }

  function cloudConfigured() {
    const c = cfg();
    return !!(c.supabaseUrl && c.supabaseAnonKey);
  }

  function b64FromBuf(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function bufFromB64(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  async function deriveKey(passphrase, saltBuf) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptPayload(obj, passphrase, existingSaltB64) {
    const salt = existingSaltB64
      ? new Uint8Array(bufFromB64(existingSaltB64))
      : crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return {
      ciphertext: b64FromBuf(cipherBuf),
      salt: b64FromBuf(salt),
      iv: b64FromBuf(iv),
      key,
    };
  }

  async function decryptEnvelope(envelope, passphrase) {
    const salt = new Uint8Array(bufFromB64(envelope.salt));
    const iv = new Uint8Array(bufFromB64(envelope.iv));
    const key = await deriveKey(passphrase, salt);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      bufFromB64(envelope.ciphertext)
    );
    const obj = JSON.parse(new TextDecoder().decode(plainBuf));
    return { payload: obj, key, saltB64: envelope.salt };
  }

  // ---- Cloud (optional Supabase) ----------------------------------------

  function cloudHeaders(token) {
    const c = cfg();
    const h = {
      'Content-Type': 'application/json',
      apikey: c.supabaseAnonKey,
    };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function cloudSignup(email, password) {
    const c = cfg();
    const res = await fetch(c.supabaseUrl + '/auth/v1/signup', {
      method: 'POST',
      headers: cloudHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || data.error || ('Signup failed (' + res.status + ')'));
    if (!data.access_token) {
      return { needsConfirm: true, message: 'Check your email to confirm the account, then sign in.' };
    }
    authSession = { access_token: data.access_token, user_id: data.user && data.user.id, email };
    persistAuthSession();
    return { needsConfirm: false };
  }

  async function cloudLogin(email, password) {
    const c = cfg();
    const res = await fetch(c.supabaseUrl + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: cloudHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || data.error || ('Sign-in failed (' + res.status + ')'));
    authSession = { access_token: data.access_token, user_id: data.user && data.user.id, email };
    persistAuthSession();
    return authSession;
  }

  function persistAuthSession() {
    try {
      if (authSession) sessionStorage.setItem('kaptain_account_auth', JSON.stringify(authSession));
      else sessionStorage.removeItem('kaptain_account_auth');
    } catch (e) { /* ignore */ }
  }

  function restoreAuthSession() {
    try {
      const raw = sessionStorage.getItem('kaptain_account_auth');
      if (raw) authSession = JSON.parse(raw);
    } catch (e) { authSession = null; }
  }

  async function cloudPullEnvelope() {
    if (!authSession || !cloudConfigured()) return null;
    const c = cfg();
    const res = await fetch(
      c.supabaseUrl + '/rest/v1/kaptain_vaults?select=ciphertext,salt,iv&user_id=eq.' + encodeURIComponent(authSession.user_id),
      { headers: cloudHeaders(authSession.access_token) }
    );
    if (!res.ok) throw new Error('Cloud pull failed (' + res.status + ')');
    const rows = await res.json();
    if (!rows || !rows.length) return null;
    return rows[0];
  }

  async function cloudPushEnvelope(envelope) {
    if (!authSession || !cloudConfigured()) return;
    const c = cfg();
    const body = {
      user_id: authSession.user_id,
      ciphertext: envelope.ciphertext,
      salt: envelope.salt,
      iv: envelope.iv,
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(c.supabaseUrl + '/rest/v1/kaptain_vaults', {
      method: 'POST',
      headers: Object.assign({}, cloudHeaders(authSession.access_token), {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Fallback: PATCH if row exists (some projects lack upsert preference)
      const patch = await fetch(
        c.supabaseUrl + '/rest/v1/kaptain_vaults?user_id=eq.' + encodeURIComponent(authSession.user_id),
        {
          method: 'PATCH',
          headers: cloudHeaders(authSession.access_token),
          body: JSON.stringify({
            ciphertext: envelope.ciphertext,
            salt: envelope.salt,
            iv: envelope.iv,
            updated_at: body.updated_at,
          }),
        }
      );
      if (!patch.ok) throw new Error('Cloud save failed (' + res.status + '/' + patch.status + ')');
    }
  }

  function readLocalEnvelope() {
    try {
      const raw = localStorage.getItem(LOCAL_CIPHER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLocalEnvelope(envelope) {
    localStorage.setItem(LOCAL_CIPHER_KEY, JSON.stringify({
      ciphertext: envelope.ciphertext,
      salt: envelope.salt,
      iv: envelope.iv,
      updatedAt: new Date().toISOString(),
    }));
  }

  // ---- Session unlock (passphrase stays in memory only; key in sessionStorage as non-extractable isn't possible — we re-prompt each tab unless unlocked this session) ----

  function rememberUnlock(passphrase) {
    // Keep passphrase only in a closure for re-encrypt saves this session.
    // sessionStorage holds a marker, not the passphrase.
    try {
      sessionStorage.setItem(SESSION_META_KEY, JSON.stringify({ unlocked: true, at: Date.now() }));
    } catch (e) { /* ignore */ }
    rememberUnlock._pass = passphrase;
  }

  function clearUnlock() {
    cryptoKey = null;
    sessionSaltB64 = null;
    lastPayload = null;
    rememberUnlock._pass = null;
    try { sessionStorage.removeItem(SESSION_META_KEY); } catch (e) { /* ignore */ }
  }

  function currentPassphrase() {
    return rememberUnlock._pass || null;
  }

  function isUnlocked() {
    return !!cryptoKey && !!currentPassphrase();
  }

  function status() {
    return {
      enabled: isEnabled(),
      cloudConfigured: cloudConfigured(),
      cloudSignedIn: !!(authSession && authSession.access_token),
      cloudEmail: authSession && authSession.email || null,
      unlocked: isUnlocked(),
      hasLocalVault: !!readLocalEnvelope(),
    };
  }

  // ---- Snapshot / apply via bridge --------------------------------------

  function collectPayload() {
    const bridge = window.KaptainAccountBridge;
    const fromApp = (bridge && typeof bridge.snapshot === 'function') ? bridge.snapshot() : {};
    return {
      v: PAYLOAD_VERSION,
      savedAt: new Date().toISOString(),
      keys: fromApp.keys || {},
      collection: fromApp.collection || {},
      prefs: fromApp.prefs || {},
    };
  }

  async function applyPayload(payload) {
    lastPayload = payload;
    const bridge = window.KaptainAccountBridge;
    if (bridge && typeof bridge.apply === 'function') {
      await bridge.apply(payload);
    }
  }

  async function unlockWithPassphrase(passphrase) {
    let envelope = null;
    if (authSession && cloudConfigured()) {
      try { envelope = await cloudPullEnvelope(); } catch (e) { /* fall through to local */ }
    }
    if (!envelope) envelope = readLocalEnvelope();
    if (!envelope) throw new Error('No saved data found on this device. Turn on Save first.');

    const { payload, key, saltB64 } = await decryptEnvelope(envelope, passphrase);
    cryptoKey = key;
    sessionSaltB64 = saltB64;
    rememberUnlock(passphrase);
    await applyPayload(payload);
    return payload;
  }

  async function createVault(passphrase) {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Use a save password with at least 8 characters.');
    }
    const payload = collectPayload();
    const enc = await encryptPayload(payload, passphrase, null);
    cryptoKey = enc.key;
    sessionSaltB64 = enc.salt;
    rememberUnlock(passphrase);
    lastPayload = payload;
    const envelope = { ciphertext: enc.ciphertext, salt: enc.salt, iv: enc.iv };
    writeLocalEnvelope(envelope);
    if (authSession && cloudConfigured()) {
      try { await cloudPushEnvelope(envelope); } catch (e) {
        console.warn('[KaptainAccount] cloud save failed (local vault ok):', e);
      }
    }
    return payload;
  }

  async function persistNow() {
    if (!isUnlocked()) return false;
    const pass = currentPassphrase();
    if (!pass) return false;
    const payload = collectPayload();
    lastPayload = payload;
    const enc = await encryptPayload(payload, pass, sessionSaltB64);
    cryptoKey = enc.key;
    sessionSaltB64 = enc.salt;
    const envelope = { ciphertext: enc.ciphertext, salt: enc.salt, iv: enc.iv };
    writeLocalEnvelope(envelope);
    if (authSession && cloudConfigured()) {
      try { await cloudPushEnvelope(envelope); } catch (e) {
        console.warn('[KaptainAccount] cloud save failed:', e);
      }
    }
    return true;
  }

  function scheduleSave() {
    if (!isEnabled() || !isUnlocked()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistNow().catch((e) => console.warn('[KaptainAccount] save failed:', e));
    }, 800);
  }

  function signOutCloud() {
    authSession = null;
    persistAuthSession();
  }

  function wipeLocalVault() {
    try { localStorage.removeItem(LOCAL_CIPHER_KEY); } catch (e) { /* ignore */ }
    clearUnlock();
  }

  function lock() {
    clearUnlock();
  }

  function getUnlockedPayload() {
    return lastPayload ? JSON.parse(JSON.stringify(lastPayload)) : null;
  }

  // Boot
  applyUrlAccountFlag();
  restoreAuthSession();

  window.KaptainAccount = {
    isEnabled,
    featureActive: isEnabled,
    status,
    scheduleSave,
    persistNow,
    unlockWithPassphrase,
    createVault,
    lock,
    wipeLocalVault,
    cloudConfigured,
    cloudSignup,
    cloudLogin,
    signOutCloud,
    collectPayload,
    getUnlockedPayload,
  };
})();
