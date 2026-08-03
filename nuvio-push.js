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
  const SUPABASE_BASE = 'https://api.nuvio.tv';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI';
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

  // Canonical form of a manifest URL for de-dupe (ignore trailing slash,
  // a trailing /manifest.json, and case).
  function normalizeManifestUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '').replace(/\/manifest\.json$/i, '').toLowerCase();
  }

  // Field names inside the settings blob. The debrid/TMDB-enable/MDBList-enable
  // names are confirmed from the live blob. The API-KEY field names below are
  // best-guess pending the one-time discovery read (configure them once in the
  // real Nuvio app, then correct these). They live here so there's one place to
  // fix after discovery.
  const SETTINGS_KEYS = {
    tmdbApiKey: 'tmdb_api_key',       // TODO(discovery): confirm under features.tmdb_settings
    mdblistApiKey: 'mdblist_api_key', // TODO(discovery): confirm under features.mdblist_settings
  };

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

    // Profile indexes that already hold data on the server (addons and/or a
    // collection) — even if they're missing from the profiles metadata list.
    // Nuvio's profiles list can come back empty while the underlying profile
    // data still exists; reusing such an index makes Nuvio reset that profile's
    // addons/settings, clobbering an existing setup. Best-effort, never throws.
    async occupiedProfileIds(token) {
      const ids = new Set();
      try {
        const addons = await this.listAddons(token);
        addons.forEach((a) => { const n = toProfileIndex(a.profile_id); if (n) ids.add(n); });
      } catch (e) { /* ignore — fall back to profiles-only */ }
      return ids;
    },

    // Creates a brand-new profile at the lowest index that is free in BOTH the
    // profiles list and the underlying data tables — so it never reuses (and
    // resets) a profile that already has addons/collections. Returns the profile.
    async createProfile(token, name, avatarUrl) {
      const profiles = await this.getProfiles(token);
      const used = new Set(profiles.map((p) => p.profile_index));
      const occupied = await this.occupiedProfileIds(token);
      let idx = 1;
      while (used.has(idx) || occupied.has(idx)) idx += 1;
      const profile = normalizeProfile({
        profile_index: idx,
        name: name,
        avatar_color_hex: DEFAULT_PROFILE_COLOR,
        avatar_url: (avatarUrl && String(avatarUrl).trim()) || null,
      });
      await this.saveProfiles(token, profiles.concat([profile]));
      return profile;
    },

    // Reads the given profile's existing collections so the caller can merge
    // into them rather than overwriting. Supabase returns this RPC as a row set:
    // [{ profile_id, collections_json: [...], updated_at }]. We also defensively
    // handle a bare array, a single wrapper object, and JSON-string payloads.
    async pullCollections(token, profileId) {
      let value = await rpc('/rest/v1/rpc/sync_pull_collections', token, { p_profile_id: profileId });
      const unwrap = (v) => {
        if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return []; } }
        return v;
      };
      value = unwrap(value);
      // Row-set form: array whose first element carries collections_json.
      if (Array.isArray(value) && value.length && isPlainObject(value[0]) &&
          ('collections_json' in value[0] || 'collections' in value[0])) {
        value = value[0].collections_json || value[0].collections || [];
      } else if (isPlainObject(value)) {
        value = value.collections_json || value.collections || [];
      }
      value = unwrap(value);
      return Array.isArray(value) ? value : [];
    },

    // Full REPLACE of the given profile's collections.
    async pushCollections(token, profileId, collections) {
      return rpc('/rest/v1/rpc/sync_push_collections', token, {
        p_profile_id: profileId,
        p_collections_json: Array.isArray(collections) ? collections : [],
      });
    },

    // ---- Addons (PostgREST table /rest/v1/addons) ----

    // The account's owner user id, used as the addons' user_id.
    async getOwnerId(token) {
      const data = await rpc('/rest/v1/rpc/get_sync_owner', token, {});
      if (typeof data === 'string') return data;
      return (data && (data.owner || data.id || data.user_id)) || null;
    },

    async listAddons(token) {
      const res = await fetch(`${SUPABASE_BASE}/rest/v1/addons?select=*&order=sort_order.asc`, {
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error(`Nuvio could not read your addons (HTTP ${res.status}).`);
      const body = await readBody(res);
      return Array.isArray(body) ? body : [];
    },

    async addAddon(token, addon) {
      const res = await fetch(`${SUPABASE_BASE}/rest/v1/addons`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Prefer': 'return=representation' },
        body: JSON.stringify(addon),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Nuvio addon install failed (HTTP ${res.status}). ${txt.slice(0, 160)}`);
      }
      const body = await readBody(res);
      return Array.isArray(body) ? body[0] : body;
    },

    // Deletes one addon row by its own id. Same authenticated PostgREST
    // resource addAddon/listAddons already use — just the DELETE verb with an
    // id filter instead of POST/GET.
    async removeAddon(token, addonId) {
      const res = await fetch(`${SUPABASE_BASE}/rest/v1/addons?id=eq.${encodeURIComponent(addonId)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Nuvio addon removal failed (HTTP ${res.status}). ${txt.slice(0, 160)}`);
      }
    },

    // Removes every addon on a profile whose name matches exactly (used to
    // clear a stale AIO Metadata instance before installing a fresh one on
    // profile overwrite, so the profile doesn't end up with two of them).
    async removeAddonsByName(token, profileId, name) {
      const existing = await this.listAddons(token);
      const matches = existing.filter((a) => a.profile_id === profileId && a.name === name);
      for (const a of matches) {
        await this.removeAddon(token, a.id);
      }
      return matches.length;
    },

    // Installs the given addons on a profile, skipping any whose manifest URL is
    // already present. addons: [{ name, url }]. Returns count newly added.
    async installAddons(token, profileId, addons) {
      const list = Array.isArray(addons) ? addons : [];
      if (!list.length) return 0;
      const ownerId = await this.getOwnerId(token);
      const existing = await this.listAddons(token);
      const mine = existing.filter((a) => a.profile_id === profileId);
      const have = new Set(mine.map((a) => normalizeManifestUrl(a.url)));
      let maxSort = mine.reduce((m, a) => Math.max(m, Number(a.sort_order) || 0), -1);
      let added = 0;
      for (const a of list) {
        const url = String((a && a.url) || '').trim();
        if (!url || have.has(normalizeManifestUrl(url))) continue;
        maxSort += 1;
        await this.addAddon(token, {
          user_id: ownerId,
          profile_id: profileId,
          url,
          name: String((a && a.name) || url),
          enabled: true,
          sort_order: maxSort,
        });
        have.add(normalizeManifestUrl(url));
        added += 1;
      }
      return added;
    },

    // ---- Per-profile settings blob (where debrid/Torbox keys live) ----

    // Returns the settings_json object for a profile/platform, or null if unset.
    async pullSettingsBlob(token, profileId, platform) {
      const raw = await rpc('/rest/v1/rpc/sync_pull_profile_settings_blob', token, {
        p_profile_id: profileId, p_platform: platform,
      });
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row) return null;
      let blob = isPlainObject(row) ? (row.settings_json || row.settings || row) : row;
      if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch (e) { blob = null; } }
      return isPlainObject(blob) ? blob : null;
    },

    async pushSettingsBlob(token, profileId, platform, settingsJson) {
      return rpc('/rest/v1/rpc/sync_push_profile_settings_blob', token, {
        p_profile_id: profileId, p_platform: platform, p_settings_json: settingsJson,
      });
    },

    // Applies any combination of profile integration settings into the blob in
    // ONE verified write (read → merge → push → read-back → retry). Only the
    // provided fields are touched; everything else in the blob survives. A freshly
    // created profile is seeded asynchronously server-side and can clobber an
    // early write, so we read back and retry until it sticks.
    // opts: { torboxKey, tmdbEnabled, tmdbKey, mdblistKey, trakt }
    async applyProfileSettings(token, profileId, platform, opts) {
      const o = opts || {};
      // Settings are stored per device type ("tv", "mobile", …). Accept one or
      // many so the same keys can apply across the user's devices.
      const plats = Array.isArray(platform) ? platform.filter(Boolean) : [platform || 'tv'];
      const S = (v) => ({ type: 'string', value: String(v == null ? '' : v).trim() });
      const B = (v) => ({ type: 'boolean', value: !!v });
      const has = (v) => v != null && String(v).trim() !== '';
      const appliers = [];

      if (has(o.torboxKey)) {
        const key = String(o.torboxKey).trim();
        appliers.push({
          apply: (f) => {
            const d = isPlainObject(f.debrid_settings) ? f.debrid_settings : {};
            d.debrid_enabled = B(true);
            d.torbox_api_key = S(key);
            d.cloud_library_enabled = B(true);
            d.preferred_resolver_provider_id = S('torbox');
            f.debrid_settings = d;
          },
          verify: (f) => f.debrid_settings && f.debrid_settings.torbox_api_key && f.debrid_settings.torbox_api_key.value === key,
        });
      }
      if (has(o.tmdbKey)) {
        const key = String(o.tmdbKey).trim();
        appliers.push({
          apply: (f) => {
            const t = isPlainObject(f.tmdb_settings) ? f.tmdb_settings : {};
            t.tmdb_enabled = B(true);
            t[SETTINGS_KEYS.tmdbApiKey] = S(key);
            f.tmdb_settings = t;
          },
          verify: (f) => f.tmdb_settings && f.tmdb_settings[SETTINGS_KEYS.tmdbApiKey] && f.tmdb_settings[SETTINGS_KEYS.tmdbApiKey].value === key,
        });
      } else if (o.tmdbEnabled) {
        appliers.push({
          apply: (f) => { const t = isPlainObject(f.tmdb_settings) ? f.tmdb_settings : {}; t.tmdb_enabled = B(true); f.tmdb_settings = t; },
          verify: (f) => f.tmdb_settings && f.tmdb_settings.tmdb_enabled && f.tmdb_settings.tmdb_enabled.value === true,
        });
      }
      if (has(o.mdblistKey)) {
        const key = String(o.mdblistKey).trim();
        appliers.push({
          apply: (f) => {
            const m = isPlainObject(f.mdblist_settings) ? f.mdblist_settings : {};
            m.mdblist_enabled = B(true);
            m[SETTINGS_KEYS.mdblistApiKey] = S(key);
            f.mdblist_settings = m;
          },
          verify: (f) => f.mdblist_settings && f.mdblist_settings[SETTINGS_KEYS.mdblistApiKey] && f.mdblist_settings[SETTINGS_KEYS.mdblistApiKey].value === key,
        });
      }
      if (has(o.trakt)) {
        // Trakt is stored as `trakt_settings_payload` — a plain JSON STRING of
        // OAuth tokens (confirmed via discovery). We can't mint those from a
        // static page, so the UI doesn't surface Trakt; this branch only fires if
        // a caller already has a payload string to write.
        const payload = String(o.trakt);
        appliers.push({
          apply: (f) => { f.trakt_settings_payload = payload; },
          verify: (f) => f.trakt_settings_payload === payload,
        });
      }
      if (o.autoplayTrailers) {
        // `meta_screen_settings_payload` is a JSON STRING (confirmed via Nuvio's
        // open-source mobile app) holding the meta-screen prefs; the autoplay
        // toggle lives at `hero_trailer_playback`. Merge so we never clobber the
        // other fields in that blob (section order, tab layout, etc).
        appliers.push({
          apply: (f) => {
            let meta = {};
            try { meta = JSON.parse(f.meta_screen_settings_payload || '{}') || {}; } catch (e) { meta = {}; }
            meta.hero_trailer_playback = true;
            f.meta_screen_settings_payload = JSON.stringify(meta);
          },
          verify: (f) => {
            try { return JSON.parse(f.meta_screen_settings_payload || '{}').hero_trailer_playback === true; }
            catch (e) { return false; }
          },
        });
      }
      if (!appliers.length) return; // nothing to write

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const plat of plats) {
        const writeOnce = async () => {
          const blob = (await this.pullSettingsBlob(token, profileId, plat)) || { version: 1, features: {} };
          if (!isPlainObject(blob.features)) blob.features = {};
          appliers.forEach((a) => a.apply(blob.features));
          await this.pushSettingsBlob(token, profileId, plat, blob);
        };
        const persisted = async () => {
          const after = await this.pullSettingsBlob(token, profileId, plat);
          const f = (after && after.features) || {};
          return appliers.every((a) => { try { return a.verify(f); } catch (e) { return false; } });
        };
        let ok = false;
        for (let attempt = 0; attempt < 4 && !ok; attempt += 1) {
          try { await writeOnce(); if (await persisted()) { ok = true; break; } } catch (e) { /* retry */ }
          await sleep(700 * (attempt + 1));
        }
        if (!ok) {
          await writeOnce();
          if (!(await persisted())) {
            throw new Error('Your settings were sent but Nuvio did not save them all. Please try again in a moment.');
          }
        }
      }
    },

    // Back-compat thin wrapper — turns on Torbox as the debrid resolver.
    async setupTorbox(token, profileId, apiKey, platform) {
      return this.applyProfileSettings(token, profileId, platform, { torboxKey: apiKey });
    },

    // Sets a profile's avatar from a public image URL (no file upload). Updates
    // the existing profile metadata in place.
    async setProfileAvatar(token, profileId, url) {
      const u = String(url || '').trim();
      if (!u) return;
      const profiles = await this.getProfiles(token);
      let found = false;
      const updated = profiles.map((p) => {
        if (p.profile_index === profileId) { found = true; return { ...p, avatar_url: u, avatar_id: null }; }
        return p;
      });
      if (!found) return;
      await this.saveProfiles(token, updated);
    },
  };

  window.NuvioPush = NuvioPush;
})();
