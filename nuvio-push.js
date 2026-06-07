/**
 * Kaptain's Mega Collection — Nuvio direct-push engine
 * ----------------------------------------------------
 * Talks to the Supabase-backed Nuvio Public API entirely from the visitor's
 * browser. No credentials are ever sent to or stored on Kaptain's site — this
 * is a static page with no backend. Email/password go straight to Nuvio.
 *
 * Endpoints/flow mirror the open-source numb3rs.stream wizard
 * (luckynumb3rs/stremio-perfect-setup, wizard/core/adapters/nuvio.js).
 *
 * Exposes: window.NuvioPush
 */
(function () {
  const SUPABASE_BASE = 'https://dpyhjjcoabcglfmgecug.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRweWhqamNvYWJjZ2xmbWdlY3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODYyNDcsImV4cCI6MjA4NjM2MjI0N30.U-3QSNDdpsnvRk_7ZL419AFTOtggHJJcmkodxeXjbkg';
  const DEFAULT_PROFILE_COLOR = '#1E88E5';

  function anonHeaders() {
    return { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
  }
  function authHeaders(token) {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    };
  }

  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function toProfileIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i >= 1 ? i : null;
  }

  function normalizeProfile(profile) {
    const profileIndex = toProfileIndex(profile && (profile.profile_index != null ? profile.profile_index : profile.id));
    if (!profileIndex) return null;
    return {
      profile_index: profileIndex,
      name: String((profile && profile.name) || '').trim() || `Profile ${profileIndex}`,
      avatar_color_hex: String((profile && (profile.avatar_color_hex || profile.avatarColorHex)) || '').trim() || DEFAULT_PROFILE_COLOR,
      avatar_id: (profile && (profile.avatar_id != null ? profile.avatar_id : profile.avatarId)) || null,
      avatar_url: (profile && (profile.avatar_url != null ? profile.avatar_url : profile.avatarUrl)) || null,
      uses_primary_addons: profileIndex === 1 ? false : !!(profile && (profile.uses_primary_addons != null ? profile.uses_primary_addons : profile.usesPrimaryAddons)),
      uses_primary_plugins: profileIndex === 1 ? false : !!(profile && (profile.uses_primary_plugins != null ? profile.uses_primary_plugins : profile.usesPrimaryPlugins)),
    };
  }

  function normalizeProfiles(profiles) {
    const list = Array.isArray(profiles) ? profiles : [];
    const deduped = new Map();
    for (const p of list) {
      const n = normalizeProfile(p);
      if (!n || deduped.has(n.profile_index)) continue;
      deduped.set(n.profile_index, n);
    }
    return Array.from(deduped.values()).sort((a, b) => a.profile_index - b.profile_index);
  }

  function profilePayload(profile) {
    const n = normalizeProfile(profile);
    if (!n) return null;
    return {
      profile_index: n.profile_index,
      name: n.name,
      avatar_color_hex: n.avatar_color_hex,
      uses_primary_addons: n.uses_primary_addons,
      uses_primary_plugins: n.uses_primary_plugins,
      avatar_id: n.avatar_url ? null : (n.avatar_id || null),
      avatar_url: n.avatar_url || null,
    };
  }

  async function readBody(res) {
    if (res.status === 204) return null;
    const text = await res.text().catch(() => '');
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  async function readAuthError(res) {
    let detail = '', code = '';
    try {
      const body = await res.clone().json();
      detail = (body && (body.msg || body.message || body.error_description || (body.error && body.error.message) || body.error)) || '';
      code = (body && (body.error_code || body.code)) || '';
    } catch (e) {
      detail = await res.text().catch(() => '');
    }
    code = code || res.headers.get('x-sb-error-code') || res.headers.get('sb-error-code') || '';
    return { detail: String(detail || '').trim(), code: String(code || '').trim() };
  }

  function friendlyAuthError(action, status, detail, code) {
    const blob = `${code} ${detail}`;
    if (/api key|missing_api_key|invalid_api_key|unauthorized/i.test(blob)) {
      return `Nuvio ${action} is temporarily unavailable (the connection key needs updating). Please try the download option instead, or try again later.`;
    }
    if (/already registered|already exists|duplicate/i.test(detail)) {
      return 'An account with that email already exists on Nuvio. Switch to "Sign in" instead, or use a different email.';
    }
    if (/invalid login credentials|invalid credentials|wrong password|incorrect password/i.test(detail)) {
      return 'Incorrect email or password for your Nuvio account. Please double-check and try again.';
    }
    if (/validate email address|invalid format/i.test(detail)) {
      return `Nuvio rejected that email address: ${detail}`;
    }
    if (detail) return `Nuvio ${action} failed: ${detail}`;
    return `Nuvio ${action} failed (HTTP ${status}). Please try again.`;
  }

  async function rpc(path, token, body) {
    const res = await fetch(`${SUPABASE_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Nuvio ${path} failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
    }
    return readBody(res);
  }

  const NuvioPush = {
    async signup(email, password) {
      let res;
      try {
        res = await fetch(`${SUPABASE_BASE}/auth/v1/signup`, {
          method: 'POST', headers: anonHeaders(), body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new Error(`Could not reach Nuvio: ${(err && err.message) || err}. Check your connection and try again.`);
      }
      if (!res.ok) {
        const { detail, code } = await readAuthError(res);
        throw new Error(friendlyAuthError('account creation', res.status, detail, code));
      }
      const body = await readBody(res);
      const payload = isPlainObject(body) ? body : {};
      if (payload.error) {
        const msg = payload.error.message || String(payload.error);
        if (/already registered|already exists|duplicate/i.test(msg)) {
          throw new Error('An account with that email already exists on Nuvio. Switch to "Sign in" instead, or use a different email.');
        }
        throw new Error(`Nuvio signup failed: ${msg}`);
      }
      // Some successful signups don't return a session — fall back to login.
      if (!payload.access_token) return this.login(email, password);
      return { token: payload.access_token, userId: payload.user && payload.user.id };
    },

    async login(email, password) {
      let res;
      try {
        res = await fetch(`${SUPABASE_BASE}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: anonHeaders(), body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new Error(`Could not reach Nuvio: ${(err && err.message) || err}. Check your connection and try again.`);
      }
      if (!res.ok) {
        const { detail, code } = await readAuthError(res);
        throw new Error(friendlyAuthError('sign-in', res.status, detail, code));
      }
      const body = await readBody(res);
      const payload = isPlainObject(body) ? body : {};
      if (!payload.access_token) {
        throw new Error('Nuvio sign-in succeeded but did not return a session. Please try again.');
      }
      return { token: payload.access_token, userId: payload.user && payload.user.id };
    },

    async getProfiles(token) {
      const data = await rpc('/rest/v1/rpc/sync_pull_profiles', token, {});
      return normalizeProfiles(Array.isArray(data) ? data : (data && data.profiles) || []);
    },

    async saveProfiles(token, profiles) {
      const payload = normalizeProfiles(profiles).map(profilePayload).filter(Boolean);
      await rpc('/rest/v1/rpc/sync_push_profiles', token, { p_profiles: payload });
      return normalizeProfiles(payload);
    },

    // Creates a brand-new profile at the lowest unused index — never clobbers
    // an existing one. Returns the created profile.
    async createProfile(token, name) {
      const profiles = await this.getProfiles(token);
      const used = new Set(profiles.map((p) => p.profile_index));
      let idx = 1;
      while (used.has(idx)) idx += 1;
      const profile = normalizeProfile({
        profile_index: idx,
        name: name,
        avatar_color_hex: DEFAULT_PROFILE_COLOR,
      });
      await this.saveProfiles(token, profiles.concat([profile]));
      return profile;
    },

    // Full REPLACE of the given profile's collections.
    async pushCollections(token, profileId, collections) {
      return rpc('/rest/v1/rpc/sync_push_collections', token, {
        p_profile_id: profileId,
        p_collections_json: Array.isArray(collections) ? collections : [],
      });
    },
  };

  window.NuvioPush = NuvioPush;
})();
