/**
 * Kaptain's Mega Collection — Profile Studio (Collection Organizer & Cherry-Picker)
 * ---------------------------------------------------------------------------------
 * Allows Nuvio users to:
 *   1. Sign in with their Nuvio Supabase credentials (or resume existing session).
 *   2. Select a profile from their account.
 *   3. Visually view, re-order, rename, pin, and delete categories and folders.
 *   4. Cherry-pick any folder from Kaptain's 600+ master collection into their profile.
 *   5. Save a local browser backup and push the updated layout directly to Nuvio.
 *
 * Exposes: window.ProfileStudio
 */
(function () {
  'use strict';

  const STORAGE_TOKEN_KEY = 'kaptain_push_token';
  const STORAGE_EMAIL_KEY = 'kaptain_push_email';
  const BACKUP_PREFIX = 'nuvio_profile_backup_';

  // Internal state
  const state = {
    isOpen: false,
    step: 'login', // 'login' | 'profiles' | 'canvas' | 'confirm' | 'success'
    token: '',
    email: '',
    profiles: [],
    profileStats: {}, // { [profile_index]: { categories: number, folders: number } }
    selectedProfile: null,
    originalCollections: [],
    workingCollections: [],
    expandedCategoryIndex: 0,
    vaultSearch: '',
    vaultCategoryFilter: 'all',
    isLoading: false,
    errorMsg: '',
    toastMsg: '',
    toastTimer: null,
    addedFoldersHistory: new Set(),
    removedFoldersHistory: new Set(),
  };

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Stroke-icon set matching the site's own SVG language (viewBox 0 0 24 24,
  // stroke=currentColor, width 2, round caps) instead of emoji, so Profile
  // Studio's controls read as Kaptain UI rather than a generic admin panel.
  const ICONS = {
    chevronUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    chevronsUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>',
    chevronsDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
    bookmarkFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    kebab: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  };

  // Every folder-card cover falls back here when it has no real art, and when
  // its resolved URL 404s — inline SVG so it never depends on a static asset
  // shipping in /assets (the previous file-based placeholder didn't exist).
  const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#141926"/><path d="M55 38h14l6 8h30a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H55a4 4 0 0 1-4-4V42a4 4 0 0 1 4-4z" fill="none" stroke="#3a4358" stroke-width="2.5" stroke-linejoin="round"/></svg>'
  );

  // Enter/Space activates a non-<button> row the same way a click would,
  // for elements marked role="button" tabindex="0" (cat headers, profile
  // cards) — plain divs don't get that for free the way real buttons do.
  function makeKeyboardActivatable(node) {
    node.addEventListener('keydown', (e) => {
      if (e.target !== node) return; // let nested real buttons handle their own Enter/Space
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        node.click();
      }
    });
  }

  function showToast(msg) {
    state.toastMsg = msg;
    clearTimeout(state.toastTimer);
    const toastEl = el('ps-toast');
    if (toastEl) {
      toastEl.textContent = msg;
      toastEl.classList.add('active');
      state.toastTimer = setTimeout(() => {
        toastEl.classList.remove('active');
      }, 3000);
    }
  }

  // Master collection source
  function getMasterDatabase() {
    if (Array.isArray(window.NUVIO_DATABASE) && window.NUVIO_DATABASE.length) {
      return window.NUVIO_DATABASE;
    }
    return [];
  }

  // Get flat list of all folders in master collection for the vault
  function getMasterFolders() {
    const db = getMasterDatabase();
    const list = [];
    db.forEach((cat) => {
      const catTitle = cat.title || cat.name || 'Collection';
      (cat.folders || []).forEach((f) => {
        list.push({
          folder: f,
          categoryTitle: catTitle,
          categoryId: cat.id,
        });
      });
    });
    return list;
  }

  // Calculate diff between original and working collections. Returns counts
  // (used by the header pills/reset-button gate) plus the actual added/
  // removed folder objects (used by Step 4's before/after preview — a bare
  // "+1/-0" count doesn't tell a nervous first-time user WHAT changed).
  function calculateDiff() {
    const origMap = new Map();
    const currMap = new Map();

    (state.originalCollections || []).forEach((c) => {
      const catKey = c.id || c.title || 'cat';
      (c.folders || []).forEach((f) => origMap.set(catKey + '::' + (f.id || f.title), f));
    });

    (state.workingCollections || []).forEach((c) => {
      const catKey = c.id || c.title || 'cat';
      (c.folders || []).forEach((f) => currMap.set(catKey + '::' + (f.id || f.title), f));
    });

    const addedItems = [];
    currMap.forEach((folder, key) => {
      if (!origMap.has(key)) addedItems.push(folder);
    });

    const removedItems = [];
    origMap.forEach((folder, key) => {
      if (!currMap.has(key)) removedItems.push(folder);
    });

    let reordered = false;
    const origOrder = (state.originalCollections || []).map((c) => c.id || c.title).join('|');
    const currOrder = (state.workingCollections || []).map((c) => c.id || c.title).join('|');
    if (origOrder !== currOrder) reordered = true;

    return { added: addedItems.length, removed: removedItems.length, reordered, addedItems, removedItems };
  }

  // Render modal root structure
  function ensureModalElement() {
    let overlay = el('profile-studio-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'profile-studio-overlay';
      overlay.className = 'ps-overlay';
      overlay.innerHTML = `
        <div id="profile-studio-panel" class="ps-panel" role="dialog" aria-modal="true" aria-label="Profile Studio" tabindex="-1">
          <div id="ps-toast" class="ps-toast" role="status" aria-live="polite"></div>
          <div id="ps-content" class="ps-content"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          ProfileStudio.close();
        }
      });

      // One-time (module lifetime, not per-render) listener: clicking
      // anywhere outside an open kebab menu closes it. Escape closes just
      // the open kebab if there is one, otherwise ProfileStudio.close()
      // handles the whole-modal case (wired in open()/close()).
      document.addEventListener('click', (e) => {
        if (e.target.closest('.ps-actions-menu')) return;
        document.querySelectorAll('.ps-actions-dropdown.is-open').forEach((d) => {
          d.classList.remove('is-open');
          const t = d.closest('.ps-actions-menu')?.querySelector('.ps-kebab-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
      });
    }
    return overlay;
  }

  // Main render dispatcher
  function render() {
    const container = el('ps-content');
    if (!container) return;

    if (state.isLoading) {
      container.innerHTML = `
        <div class="ps-loading-view">
          <div class="ps-spinner"></div>
          <p class="ps-loading-text">${escapeHtml(state.loadingMsg || 'Connecting to Nuvio...')}</p>
        </div>
      `;
      return;
    }

    switch (state.step) {
      case 'login':
        renderLogin(container);
        break;
      case 'profiles':
        renderProfiles(container);
        break;
      case 'canvas':
        renderCanvas(container);
        break;
      case 'confirm':
        renderConfirm(container);
        break;
      case 'success':
        renderSuccess(container);
        break;
      default:
        renderLogin(container);
    }
  }

  // -------------------------------------------------------------
  // STEP 1: Login View
  // -------------------------------------------------------------
  function renderLogin(container) {
    const errorHtml = state.errorMsg
      ? `<div class="ps-alert ps-alert-error">${escapeHtml(state.errorMsg)}</div>`
      : '';

    container.innerHTML = `
      <div class="ps-header">
        <div class="ps-badge">🎛️ Profile Studio</div>
        <h2 class="ps-title">Connect Your Nuvio Account</h2>
        <p class="ps-subtitle">Sign in to organize your TV categories, reorder rows, and cherry-pick folders from Kaptain's collection.</p>
        <button type="button" class="ps-close-btn" aria-label="Close" onclick="window.ProfileStudio.close()">&times;</button>
      </div>

      <div class="ps-body ps-login-body">
        ${errorHtml}
        <form id="ps-login-form" class="ps-form" onsubmit="return false;">
          <div class="ps-form-group">
            <label for="ps-input-email" class="ps-label">Nuvio Account Email</label>
            <input type="email" id="ps-input-email" class="ps-input" placeholder="you@example.com" value="${escapeAttr(state.email)}" required autocomplete="email">
          </div>
          <div class="ps-form-group">
            <label for="ps-input-password" class="ps-label">Nuvio Password</label>
            <input type="password" id="ps-input-password" class="ps-input" placeholder="••••••••" required autocomplete="current-password">
          </div>
          <div class="ps-form-actions">
            <button type="submit" id="ps-btn-login" class="ps-btn ps-btn-primary ps-btn-block">
              Connect to Nuvio &rarr;
            </button>
          </div>
        </form>

        <div class="ps-privacy-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Credentials talk directly to Nuvio's secure Supabase API. Passwords are never sent to or stored on Kaptain's website.</span>
        </div>
      </div>
    `;

    const form = el('ps-login-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = el('ps-input-email').value.trim();
        const password = el('ps-input-password').value;
        if (!email || !password) return;

        state.isLoading = true;
        state.loadingMsg = 'Signing in to Nuvio...';
        state.errorMsg = '';
        render();

        try {
          if (!window.NuvioPush) throw new Error('Nuvio push client not available');
          const auth = await window.NuvioPush.login(email, password);
          state.token = auth.token;
          state.email = email;

          try {
            sessionStorage.setItem(STORAGE_TOKEN_KEY, auth.token);
            sessionStorage.setItem(STORAGE_EMAIL_KEY, email);
          } catch (e) {}

          await loadProfiles();
        } catch (err) {
          state.isLoading = false;
          state.errorMsg = (err && err.message) || 'Failed to sign in. Check email and password.';
          render();
        }
      });
    }
  }

  // -------------------------------------------------------------
  // Load Profiles & Stats
  // -------------------------------------------------------------
  async function loadProfiles() {
    state.isLoading = true;
    state.loadingMsg = 'Fetching your TV profiles...';
    render();

    try {
      state.profiles = await window.NuvioPush.getProfiles(state.token);
      if (!state.profiles.length) {
        state.profiles = [{ profile_index: 1, name: 'Default Profile', avatar_color_hex: '#1E88E5' }];
      }

      // Pre-fetch stats for each profile
      for (const p of state.profiles) {
        try {
          const collections = await window.NuvioPush.pullCollections(state.token, p.profile_index);
          const catCount = (collections || []).length;
          const foldCount = (collections || []).reduce((acc, c) => acc + (c.folders ? c.folders.length : 0), 0);
          state.profileStats[p.profile_index] = { categories: catCount, folders: foldCount };
        } catch (e) {
          state.profileStats[p.profile_index] = { categories: 0, folders: 0 };
        }
      }

      state.isLoading = false;
      state.step = 'profiles';
      render();
    } catch (err) {
      state.isLoading = false;
      state.errorMsg = (err && err.message) || 'Failed to load profiles.';
      state.step = 'login';
      render();
    }
  }

  // -------------------------------------------------------------
  // STEP 2: Profile Selection View
  // -------------------------------------------------------------
  function renderProfiles(container) {
    const profileCardsHtml = state.profiles
      .map((p) => {
        const stats = state.profileStats[p.profile_index] || { categories: 0, folders: 0 };
        const avatarStyle = p.avatar_color_hex ? `background-color: ${escapeAttr(p.avatar_color_hex)};` : 'background-color: #1E88E5;';
        const initial = (p.name || 'P').charAt(0).toUpperCase();

        return `
          <div class="ps-profile-card" data-profile-id="${p.profile_index}" tabindex="0" role="button" aria-label="Select profile ${escapeAttr(p.name || `Profile ${p.profile_index}`)}">
            <div class="ps-profile-avatar" style="${avatarStyle}">
              ${p.avatar_url ? `<img src="${escapeAttr(p.avatar_url)}" alt="">` : `<span>${initial}</span>`}
            </div>
            <div class="ps-profile-info">
              <h3 class="ps-profile-name">${escapeHtml(p.name || `Profile ${p.profile_index}`)}</h3>
              <span class="ps-profile-meta">${stats.categories} categories &bull; ${stats.folders} folders</span>
            </div>
            <button type="button" class="ps-btn ps-btn-secondary ps-btn-sm ps-profile-pick-btn">
              Select &rarr;
            </button>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="ps-header">
        <div class="ps-badge">Step 2 &bull; Select Profile</div>
        <h2 class="ps-title">Which profile do you want to organize?</h2>
        <p class="ps-subtitle">Pick the TV profile you'd like to customize or add folders to.</p>
        <button type="button" class="ps-close-btn" aria-label="Close" onclick="window.ProfileStudio.close()">&times;</button>
      </div>

      <div class="ps-body">
        <div class="ps-profiles-grid">
          ${profileCardsHtml}
        </div>

        <div class="ps-footer-actions">
          <button type="button" id="ps-btn-switch-account" class="ps-btn-link">
            &larr; Switch Nuvio Account (${escapeHtml(state.email)})
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('.ps-profile-card').forEach((card) => {
      card.addEventListener('click', () => {
        const profileId = parseInt(card.getAttribute('data-profile-id'), 10);
        selectProfile(profileId);
      });
      makeKeyboardActivatable(card);
    });

    const switchBtn = el('ps-btn-switch-account');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        state.token = '';
        state.email = '';
        try {
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
          sessionStorage.removeItem(STORAGE_EMAIL_KEY);
        } catch (e) {}
        state.step = 'login';
        render();
      });
    }
  }

  // -------------------------------------------------------------
  // Select Profile & Load Collections
  // -------------------------------------------------------------
  async function selectProfile(profileId) {
    const profile = state.profiles.find((p) => p.profile_index === profileId);
    state.selectedProfile = profile || { profile_index: profileId, name: `Profile ${profileId}` };

    state.isLoading = true;
    state.loadingMsg = `Loading layout for ${state.selectedProfile.name}...`;
    render();

    try {
      const rawCols = await window.NuvioPush.pullCollections(state.token, profileId);
      state.originalCollections = deepClone(rawCols || []);
      state.workingCollections = deepClone(rawCols || []);
      state.expandedCategoryIndex = 0;
      state.isLoading = false;
      state.step = 'canvas';
      render();
    } catch (err) {
      state.isLoading = false;
      state.errorMsg = (err && err.message) || 'Failed to pull collections.';
      state.step = 'profiles';
      render();
    }
  }

  // -------------------------------------------------------------
  // STEP 3: Studio Canvas (2-Column Interactive Board)
  // -------------------------------------------------------------
  function renderCanvas(container) {
    const diff = calculateDiff();
    const categories = state.workingCollections || [];
    const masterFolders = getMasterFolders();

    // Filter master folders for vault
    const filteredVault = masterFolders.filter((item) => {
      const f = item.folder;
      const title = (f.title || f.name || '').toLowerCase();
      const cat = (item.categoryTitle || '').toLowerCase();

      // Category tab filter
      if (state.vaultCategoryFilter !== 'all') {
        const filterNorm = state.vaultCategoryFilter.toLowerCase();
        if (!cat.includes(filterNorm)) return false;
      }

      // Search text filter
      if (state.vaultSearch) {
        const q = state.vaultSearch.toLowerCase();
        return title.includes(q) || cat.includes(q);
      }
      return true;
    });

    // Left Column: User's Profile Categories
    const categoriesHtml = categories.length
      ? categories
          .map((cat, catIdx) => {
            const isExpanded = state.expandedCategoryIndex === catIdx;
            const folders = cat.folders || [];
            const isPinned = cat.pinToTop !== false;

            const foldersHtml = folders.length
              ? folders
                  .map((f, fIdx) => {
                    const coverUrl = f.coverImageUrl || f.posterUrl || PLACEHOLDER_IMG;
                    const fTitle = f.title || f.name || 'Untitled';

                    return `
                      <div class="ps-folder-row" data-cat-idx="${catIdx}" data-f-idx="${fIdx}">
                        <div class="ps-folder-thumb">
                          <img src="${escapeAttr(coverUrl)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
                        </div>
                        <div class="ps-folder-info">
                          <div class="ps-folder-title">${escapeHtml(fTitle)}</div>
                          <div class="ps-folder-meta">
                            <span class="ps-badge-sources">${(f.sources || []).length} tabs</span>
                          </div>
                        </div>
                        <div class="ps-folder-reorder">
                          <button type="button" class="ps-btn-icon ps-btn-move-folder-up" title="Move up" aria-label="Move ${escapeAttr(fTitle)} up" ${fIdx === 0 ? 'disabled' : ''} data-cat-idx="${catIdx}" data-f-idx="${fIdx}">${ICONS.chevronUp}</button>
                          <button type="button" class="ps-btn-icon ps-btn-move-folder-down" title="Move down" aria-label="Move ${escapeAttr(fTitle)} down" ${fIdx === folders.length - 1 ? 'disabled' : ''} data-cat-idx="${catIdx}" data-f-idx="${fIdx}">${ICONS.chevronDown}</button>
                          <button type="button" class="ps-btn-icon ps-btn-danger ps-btn-delete-folder" title="Remove folder" aria-label="Remove ${escapeAttr(fTitle)}" data-cat-idx="${catIdx}" data-f-idx="${fIdx}">✕</button>
                          <div class="ps-actions-menu">
                            <button type="button" class="ps-btn-icon ps-kebab-trigger" title="More actions" aria-label="More actions for ${escapeAttr(fTitle)}" aria-haspopup="true" aria-expanded="false">${ICONS.kebab}</button>
                            <div class="ps-actions-dropdown" role="menu">
                              <button type="button" class="ps-actions-item ps-btn-move-folder-top" role="menuitem" data-cat-idx="${catIdx}" data-f-idx="${fIdx}">${ICONS.chevronsUp} Move to top</button>
                              <button type="button" class="ps-actions-item ps-btn-move-folder-bottom" role="menuitem" data-cat-idx="${catIdx}" data-f-idx="${fIdx}">${ICONS.chevronsDown} Move to bottom</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join('')
              : `<div class="ps-empty-category">No folders in this category. Click "+ Add to Profile" on any folder from the Vault on the right.</div>`;

            const catTitle = cat.title || cat.name || 'Category';

            return `
              <div class="ps-cat-card ${isExpanded ? 'is-expanded' : ''}" data-cat-idx="${catIdx}">
                <div class="ps-cat-header" tabindex="0" role="button" aria-expanded="${isExpanded}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${escapeAttr(catTitle)}">
                  <div class="ps-cat-drag-handle">
                    <button type="button" class="ps-btn-icon ps-btn-move-cat-up" title="Move row up" aria-label="Move ${escapeAttr(catTitle)} up" ${catIdx === 0 ? 'disabled' : ''} data-cat-idx="${catIdx}">${ICONS.chevronUp}</button>
                    <button type="button" class="ps-btn-icon ps-btn-move-cat-down" title="Move row down" aria-label="Move ${escapeAttr(catTitle)} down" ${catIdx === categories.length - 1 ? 'disabled' : ''} data-cat-idx="${catIdx}">${ICONS.chevronDown}</button>
                  </div>
                  <div class="ps-cat-title-wrap" data-cat-idx="${catIdx}">
                    <span class="ps-cat-title">${escapeHtml(catTitle)}</span>
                    <span class="ps-cat-count">${folders.length}</span>
                  </div>
                  <div class="ps-cat-actions">
                    <button type="button" class="ps-btn-icon ps-btn-pin-toggle ${isPinned ? 'is-pinned' : ''}" data-cat-idx="${catIdx}" title="${isPinned ? '📌 Pinned to TV top row (click to unpin)' : 'Pin to top row on TV'}">
                      📌
                    </button>
                    <div class="ps-actions-menu">
                      <button type="button" class="ps-btn-icon ps-kebab-trigger" title="More actions" aria-label="More actions for ${escapeAttr(catTitle)}" aria-haspopup="true" aria-expanded="false">${ICONS.kebab}</button>
                      <div class="ps-actions-dropdown" role="menu">
                        <button type="button" class="ps-actions-item ps-btn-move-cat-top" role="menuitem" data-cat-idx="${catIdx}">${ICONS.chevronsUp} Move to top</button>
                        <button type="button" class="ps-actions-item ps-btn-move-cat-bottom" role="menuitem" data-cat-idx="${catIdx}">${ICONS.chevronsDown} Move to bottom</button>
                        <button type="button" class="ps-actions-item ps-actions-item-danger ps-btn-delete-cat" role="menuitem" data-cat-idx="${catIdx}">${ICONS.trash} Delete row</button>
                      </div>
                    </div>
                    <button type="button" class="ps-btn-icon ps-btn-cat-toggle" data-cat-idx="${catIdx}" aria-hidden="true" tabindex="-1">
                      ${isExpanded ? ICONS.chevronDown : ICONS.chevronRight}
                    </button>
                  </div>
                </div>
                ${isExpanded ? `<div class="ps-cat-body">${foldersHtml}</div>` : ''}
              </div>
            `;
          })
          .join('')
      : `<div class="ps-empty-state">No categories found in this profile. Add a new row to get started!</div>`;

    // Right Column: Vault Filter Tabs
    const vaultTabs = [
      { id: 'all', label: 'All Folders' },
      { id: 'spotlight', label: 'Spotlights' },
      { id: 'film collections', label: 'Franchises' },
      { id: 'studios', label: 'Studios' },
      { id: 'networks', label: 'Networks' },
      { id: 'actors', label: 'Actors' },
      { id: 'directors', label: 'Directors' },
      { id: 'genres', label: 'Genres' },
      { id: 'moods', label: 'Moods & Vibes' },
      { id: 'international', label: 'International' },
      { id: 'decade', label: 'By Decade' },
      { id: 'anime', label: 'Anime' },
      { id: 'kids', label: 'Kids & Family' },
      { id: 'documentaries', label: 'Docs' },
      { id: 'reality', label: 'Reality' },
    ];

    const vaultTabsHtml = vaultTabs
      .map(
        (t) => `
        <button type="button" class="ps-vault-tab ${state.vaultCategoryFilter === t.id ? 'active' : ''}" data-vault-tab="${t.id}">
          ${t.label}
        </button>
      `
      )
      .join('');

    // Vault Folder Cards (first 60 for performance, instant search). Cards
    // already sitting in the user's working layout get a persistent "added"
    // checkmark — previously the only feedback was a 3s toast, so scrolling
    // back through 600+ folders gave no memory aid of what was already in.
    const addedKeys = new Set();
    categories.forEach((c) => (c.folders || []).forEach((f) => addedKeys.add(f.id || f.title)));

    const displayVault = filteredVault.slice(0, 60);
    const vaultCardsHtml = displayVault.length
      ? displayVault
          .map((item, vIdx) => {
            const f = item.folder;
            const coverUrl = f.coverImageUrl || f.posterUrl || PLACEHOLDER_IMG;
            const shape = (f.tileShape || 'LANDSCAPE').toUpperCase();
            const isAdded = addedKeys.has(f.id || f.title);

            return `
              <div class="ps-vault-card ${isAdded ? 'is-added' : ''}" data-vault-idx="${vIdx}">
                <div class="ps-vault-cover">
                  <img src="${escapeAttr(coverUrl)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
                  <span class="ps-vault-cat-tag">${escapeHtml(item.categoryTitle)}</span>
                  ${isAdded ? `<span class="ps-vault-added-badge" title="Already in your layout" aria-label="Already in your layout">${ICONS.check}</span>` : ''}
                </div>
                <div class="ps-vault-info">
                  <h4 class="ps-vault-title">${escapeHtml(f.title || f.name || 'Untitled')}</h4>
                  <div class="ps-vault-meta">
                    <span class="ps-badge-shape">${shape}</span>
                    <span class="ps-badge-sources">${(f.sources || []).length} tabs</span>
                  </div>
                </div>
                <button type="button" class="ps-btn ps-btn-primary ps-btn-sm ps-btn-vault-add" data-vault-idx="${vIdx}">
                  ${isAdded ? '+ Add Again' : '+ Add to Profile'}
                </button>
              </div>
            `;
          })
          .join('')
      : `<div class="ps-empty-vault">No folders match your search. Try another query.</div>`;

    // Calculate total stats
    const totalFolders = categories.reduce((acc, c) => acc + (c.folders ? c.folders.length : 0), 0);

    // Render Canvas Layout
    container.innerHTML = `
      <div class="ps-header ps-header-compact">
        <div class="ps-header-left">
          <button type="button" id="ps-btn-back-profiles" class="ps-btn ps-btn-ghost ps-btn-sm">&larr; Switch Profile</button>
          <div class="ps-header-profile-badge">
            <span class="ps-avatar-dot" style="background-color:${escapeAttr(state.selectedProfile.avatar_color_hex || '#6366f1')};"></span>
            <span class="ps-profile-label">Editing:</span>
            <strong class="ps-profile-name-text">${escapeHtml(state.selectedProfile.name)}</strong>
          </div>
        </div>
        <div class="ps-header-right">
          <button type="button" id="ps-btn-reset" class="ps-btn ps-btn-ghost ps-btn-sm" ${diff.added === 0 && diff.removed === 0 && !diff.reordered ? 'disabled' : ''} title="Discard changes and revert to original profile layout">
            ↺ Reset
          </button>
          <button type="button" class="ps-close-btn" aria-label="Close" onclick="window.ProfileStudio.close()">&times;</button>
        </div>
      </div>

      <div class="ps-canvas-layout">
        <!-- LEFT: User's TV Layout -->
        <div class="ps-column ps-column-left">
          <div class="ps-col-header">
            <div>
              <h3 class="ps-col-title">My TV Layout</h3>
              <span class="ps-col-subtitle">${categories.length} rows &bull; ${totalFolders} folders</span>
            </div>
            <button type="button" id="ps-btn-add-cat" class="ps-btn ps-btn-secondary ps-btn-sm">
              + New Row
            </button>
          </div>
          <div class="ps-categories-scroller">
            ${categoriesHtml}
          </div>
        </div>

        <!-- RIGHT: Kaptain's Curated Vault -->
        <div class="ps-column ps-column-right">
          <div class="ps-col-header">
            <div>
              <h3 class="ps-col-title">Kaptain's Vault</h3>
              <span class="ps-col-subtitle">${filteredVault.length} folders available &bull; Click to add</span>
            </div>
          </div>
          <div class="ps-vault-toolbar">
            <input type="search" id="ps-vault-search" class="ps-input ps-vault-search" placeholder="Search 600+ folders (Marvel, Nolan, HBO, Anime...)" value="${escapeAttr(state.vaultSearch)}">
            <div class="ps-vault-tabs-wrap" id="ps-vault-tabs-wrap">
              <div class="ps-vault-tabs-scroller" id="ps-vault-tabs-scroller">
                ${vaultTabsHtml}
              </div>
            </div>
          </div>
          <div class="ps-vault-grid">
            ${vaultCardsHtml}
          </div>
        </div>
      </div>

      <div class="ps-bottom-bar">
        <div class="ps-diff-summary">
          <span class="ps-diff-pill ps-diff-added">+${diff.added} added</span>
          <span class="ps-diff-pill ps-diff-removed">-${diff.removed} removed</span>
          ${diff.reordered ? '<span class="ps-diff-pill ps-diff-reordered">Rows reordered</span>' : ''}
        </div>
        <div class="ps-bottom-actions">
          <button type="button" id="ps-btn-review-bottom" class="ps-btn ps-btn-primary">
            Review &amp; Push to TV 🚀
          </button>
        </div>
      </div>
    `;

    // Wire up events in Canvas
    wireCanvasEvents(container, displayVault);
  }

  // -------------------------------------------------------------
  // Wire Canvas Events
  // -------------------------------------------------------------
  function wireCanvasEvents(container, displayVault) {
    // Back to profiles
    el('ps-btn-back-profiles')?.addEventListener('click', () => {
      state.step = 'profiles';
      render();
    });

    // Reset button
    el('ps-btn-reset')?.addEventListener('click', () => {
      if (confirm('Reset all changes back to your profile original layout?')) {
        state.workingCollections = deepClone(state.originalCollections);
        state.addedFoldersHistory.clear();
        state.removedFoldersHistory.clear();
        render();
        showToast('Layout reset to original state.');
      }
    });

    // Review buttons
    const goReview = () => {
      state.step = 'confirm';
      render();
    };
    el('ps-btn-review')?.addEventListener('click', goReview);
    el('ps-btn-review-bottom')?.addEventListener('click', goReview);

    // Add Category button
    el('ps-btn-add-cat')?.addEventListener('click', () => {
      const name = prompt('Enter a name for the new row/category:');
      if (name && name.trim()) {
        const newCat = {
          id: 'custom-' + Date.now().toString(36),
          title: name.trim(),
          pinToTop: true,
          focusGlowEnabled: true,
          folders: [],
        };
        state.workingCollections.push(newCat);
        state.expandedCategoryIndex = state.workingCollections.length - 1;
        render();
        showToast(`Added row "${name.trim()}".`);
      }
    });

    // Move category up/down
    container.querySelectorAll('.ps-btn-move-cat-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        if (idx > 0) {
          const temp = state.workingCollections[idx];
          state.workingCollections[idx] = state.workingCollections[idx - 1];
          state.workingCollections[idx - 1] = temp;
          state.expandedCategoryIndex = idx - 1;
          render();
        }
      });
    });

    container.querySelectorAll('.ps-btn-move-cat-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        if (idx < state.workingCollections.length - 1) {
          const temp = state.workingCollections[idx];
          state.workingCollections[idx] = state.workingCollections[idx + 1];
          state.workingCollections[idx + 1] = temp;
          state.expandedCategoryIndex = idx + 1;
          render();
        }
      });
    });

    // Pin toggle
    container.querySelectorAll('.ps-btn-pin-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const cat = state.workingCollections[idx];
        if (cat) {
          cat.pinToTop = cat.pinToTop === false ? true : false;
          render();
          showToast(cat.pinToTop ? 'Row pinned to top.' : 'Row unpinned.');
        }
      });
    });

    // Delete category
    container.querySelectorAll('.ps-btn-delete-cat').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const cat = state.workingCollections[idx];
        if (cat && confirm(`Delete the category "${cat.title || 'Category'}" and all its folders?`)) {
          state.workingCollections.splice(idx, 1);
          state.expandedCategoryIndex = Math.max(0, idx - 1);
          render();
          showToast('Category removed.');
        }
      });
    });

    // Expand / collapse category
    container.querySelectorAll('.ps-cat-header').forEach((hdr) => {
      hdr.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        // If clicked a button that is NOT the chevron toggle, ignore (e.g. pin toggle, kebab menu, move buttons)
        if (btn && !btn.classList.contains('ps-btn-cat-toggle')) return;

        const card = hdr.closest('.ps-cat-card');
        if (card) {
          const idx = parseInt(card.getAttribute('data-cat-idx'), 10);
          state.expandedCategoryIndex = state.expandedCategoryIndex === idx ? -1 : idx;
          render();
        }
      });
      makeKeyboardActivatable(hdr);
    });

    // Explicit direct click on chevron toggle button
    container.querySelectorAll('.ps-btn-cat-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.ps-cat-card');
        if (card) {
          const idx = parseInt(card.getAttribute('data-cat-idx'), 10);
          state.expandedCategoryIndex = state.expandedCategoryIndex === idx ? -1 : idx;
          render();
        }
      });
    });

    // Kebab menus (category + folder rows) — open/close is pure DOM class
    // toggling, not a state+render() round trip, so opening a menu doesn't
    // rebuild the whole canvas and lose vault scroll position / search focus.
    container.querySelectorAll('.ps-kebab-trigger').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = trigger.closest('.ps-actions-menu');
        const dropdown = menu ? menu.querySelector('.ps-actions-dropdown') : null;
        if (!dropdown) return;
        const willOpen = !dropdown.classList.contains('is-open');
        container.querySelectorAll('.ps-actions-dropdown.is-open').forEach((d) => {
          d.classList.remove('is-open');
          const t = d.closest('.ps-actions-menu')?.querySelector('.ps-kebab-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          dropdown.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Move category to top / bottom
    container.querySelectorAll('.ps-btn-move-cat-top').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        if (idx > 0) {
          const [cat] = state.workingCollections.splice(idx, 1);
          state.workingCollections.unshift(cat);
          state.expandedCategoryIndex = 0;
          render();
          showToast(`Moved "${cat.title || 'row'}" to the top.`);
        }
      });
    });
    container.querySelectorAll('.ps-btn-move-cat-bottom').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        if (idx < state.workingCollections.length - 1) {
          const [cat] = state.workingCollections.splice(idx, 1);
          state.workingCollections.push(cat);
          state.expandedCategoryIndex = state.workingCollections.length - 1;
          render();
          showToast(`Moved "${cat.title || 'row'}" to the bottom.`);
        }
      });
    });

    // Move folder to top / bottom within its category
    container.querySelectorAll('.ps-btn-move-folder-top').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const fIdx = parseInt(btn.getAttribute('data-f-idx'), 10);
        const folders = state.workingCollections[catIdx]?.folders;
        if (folders && fIdx > 0) {
          const [f] = folders.splice(fIdx, 1);
          folders.unshift(f);
          render();
        }
      });
    });
    container.querySelectorAll('.ps-btn-move-folder-bottom').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const fIdx = parseInt(btn.getAttribute('data-f-idx'), 10);
        const folders = state.workingCollections[catIdx]?.folders;
        if (folders && fIdx < folders.length - 1) {
          const [f] = folders.splice(fIdx, 1);
          folders.push(f);
          render();
        }
      });
    });

    // Vault tabs scroll-fade — hides the "more tabs this way" hint once
    // scrolled to the end, so the 15-tab strip doesn't look permanently cut off.
    const tabsScroller = el('ps-vault-tabs-scroller');
    const tabsWrap = el('ps-vault-tabs-wrap');
    if (tabsScroller && tabsWrap) {
      const updateFade = () => {
        const atEnd = tabsScroller.scrollWidth - tabsScroller.clientWidth <= tabsScroller.scrollLeft + 4;
        tabsWrap.classList.toggle('at-end', atEnd);
      };
      updateFade();
      tabsScroller.addEventListener('scroll', updateFade);
    }

    // Folder Move Up
    container.querySelectorAll('.ps-btn-move-folder-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const fIdx = parseInt(btn.getAttribute('data-f-idx'), 10);
        const folders = state.workingCollections[catIdx]?.folders;
        if (folders && fIdx > 0) {
          const temp = folders[fIdx];
          folders[fIdx] = folders[fIdx - 1];
          folders[fIdx - 1] = temp;
          render();
        }
      });
    });

    // Folder Move Down
    container.querySelectorAll('.ps-btn-move-folder-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const fIdx = parseInt(btn.getAttribute('data-f-idx'), 10);
        const folders = state.workingCollections[catIdx]?.folders;
        if (folders && fIdx < folders.length - 1) {
          const temp = folders[fIdx];
          folders[fIdx] = folders[fIdx + 1];
          folders[fIdx + 1] = temp;
          render();
        }
      });
    });

    // Folder Delete
    container.querySelectorAll('.ps-btn-delete-folder').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
        const fIdx = parseInt(btn.getAttribute('data-f-idx'), 10);
        const folders = state.workingCollections[catIdx]?.folders;
        const target = folders && folders[fIdx];
        if (target && confirm(`Remove "${target.title || target.name || 'this folder'}" from this row?`)) {
          const removed = folders.splice(fIdx, 1)[0];
          state.removedFoldersHistory.add(removed.id || removed.title);
          render();
          showToast(`Removed "${removed.title || 'Folder'}".`);
        }
      });
    });

    // Vault search input
    const searchInput = el('ps-vault-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.vaultSearch = e.target.value;
        render();
        const freshInput = el('ps-vault-search');
        if (freshInput) {
          freshInput.focus();
          freshInput.setSelectionRange(freshInput.value.length, freshInput.value.length);
        }
      });
    }

    // Vault category tabs
    container.querySelectorAll('.ps-vault-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.vaultCategoryFilter = tab.getAttribute('data-vault-tab');
        render();
      });
    });

    // Add folder from Vault to profile
    container.querySelectorAll('.ps-btn-vault-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vIdx = parseInt(btn.getAttribute('data-vault-idx'), 10);
        const item = displayVault[vIdx];
        if (!item) return;

        // Choose target category:
        // 1. Current expanded category on left
        // 2. Or match category with same title as item.categoryTitle
        // 3. Or create/append category
        let targetCatIdx = state.expandedCategoryIndex;
        if (targetCatIdx < 0 || targetCatIdx >= state.workingCollections.length) {
          // Find matching category
          const matchIdx = state.workingCollections.findIndex(
            (c) => (c.title || c.name || '').toLowerCase() === item.categoryTitle.toLowerCase()
          );
          if (matchIdx >= 0) {
            targetCatIdx = matchIdx;
          } else if (state.workingCollections.length > 0) {
            targetCatIdx = 0;
          } else {
            // Create category
            state.workingCollections.push({
              id: 'cat-' + Date.now().toString(36),
              title: item.categoryTitle,
              pinToTop: true,
              focusGlowEnabled: true,
              folders: [],
            });
            targetCatIdx = state.workingCollections.length - 1;
          }
        }

        const targetCat = state.workingCollections[targetCatIdx];
        if (!targetCat.folders) targetCat.folders = [];

        // Check if already in this category
        const exists = targetCat.folders.some((f) => (f.id && f.id === item.folder.id) || f.title === item.folder.title);
        if (exists) {
          showToast(`"${item.folder.title}" is already in "${targetCat.title || 'this category'}".`);
          return;
        }

        // Add cloned folder
        const clonedFolder = deepClone(item.folder);
        targetCat.folders.push(clonedFolder);
        state.addedFoldersHistory.add(clonedFolder.id || clonedFolder.title);
        state.expandedCategoryIndex = targetCatIdx;

        render();
        showToast(`Added "${clonedFolder.title}" to ${targetCat.title || 'category'}!`);
      });
    });
  }

  // -------------------------------------------------------------
  // STEP 4: Confirm & Push View
  // -------------------------------------------------------------
  function renderConfirm(container) {
    const diff = calculateDiff();
    const categories = state.workingCollections || [];
    const totalFolders = categories.reduce((acc, c) => acc + (c.folders ? c.folders.length : 0), 0);

    const categoriesListHtml = categories
      .map((c) => `<li><strong>${escapeHtml(c.title || 'Category')}</strong> (${(c.folders || []).length} folders)</li>`)
      .join('');

    // Real before/after preview instead of a bare "+1/-0" count — this is
    // the single riskiest click in the flow (an irreversible push to a real
    // TV), so it should show exactly what changed, not just how many.
    const MAX_CHIPS = 6;
    function diffChip(folder, kind) {
      const cover = (folder && (folder.coverImageUrl || folder.posterUrl)) || PLACEHOLDER_IMG;
      const title = (folder && (folder.title || folder.name)) || 'Untitled';
      return `
        <div class="ps-diffchip is-${kind}">
          <div class="ps-diffchip-thumb"><img src="${escapeAttr(cover)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'"></div>
          <span class="ps-diffchip-title">${escapeHtml(title)}</span>
        </div>
      `;
    }
    function diffChipRow(items, kind) {
      if (!items.length) return '';
      const shown = items.slice(0, MAX_CHIPS).map((f) => diffChip(f, kind)).join('');
      const more = items.length > MAX_CHIPS ? `<span class="ps-diffchip-more">+${items.length - MAX_CHIPS} more</span>` : '';
      return `<div class="ps-diffchip-row">${shown}${more}</div>`;
    }
    const diffDetailHtml = diff.added || diff.removed
      ? `
        <div class="ps-diff-detail">
          ${diff.addedItems.length ? `<h4>Added (${diff.addedItems.length})</h4>${diffChipRow(diff.addedItems, 'added')}` : ''}
          ${diff.removedItems.length ? `<h4>Removed (${diff.removedItems.length})</h4>${diffChipRow(diff.removedItems, 'removed')}` : ''}
        </div>
      `
      : `<div class="ps-confirm-empty">No folders added or removed this session — only row order/pin changes, if any.</div>`;

    container.innerHTML = `
      <div class="ps-header">
        <div class="ps-badge">Step 4 &bull; Confirm &amp; Save</div>
        <h2 class="ps-title">Save Layout to "${escapeHtml(state.selectedProfile.name)}"?</h2>
        <p class="ps-subtitle">Review your changes before pushing directly to your Nuvio profile.</p>
        <button type="button" class="ps-close-btn" aria-label="Close" onclick="window.ProfileStudio.close()">&times;</button>
      </div>

      <div class="ps-body ps-confirm-body">
        <div class="ps-summary-card">
          <div class="ps-summary-stat">
            <span class="ps-stat-value">${categories.length}</span>
            <span class="ps-stat-label">Categories</span>
          </div>
          <div class="ps-summary-stat">
            <span class="ps-stat-value">${totalFolders}</span>
            <span class="ps-stat-label">Folders Total</span>
          </div>
          <div class="ps-summary-stat ps-stat-added">
            <span class="ps-stat-value">+${diff.added}</span>
            <span class="ps-stat-label">New Added</span>
          </div>
          <div class="ps-summary-stat ps-stat-removed">
            <span class="ps-stat-value">-${diff.removed}</span>
            <span class="ps-stat-label">Removed</span>
          </div>
        </div>

        ${diffDetailHtml}

        <div class="ps-backup-notice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>A backup of your previous layout will be saved in your browser storage automatically before saving.</span>
        </div>

        <div class="ps-categories-preview">
          <h4>Final Row Order on TV:</h4>
          <ol class="ps-order-list">
            ${categoriesListHtml}
          </ol>
        </div>
      </div>

      <div class="ps-bottom-bar ps-confirm-bottom-bar">
        <button type="button" id="ps-btn-back-canvas" class="ps-btn ps-btn-secondary">
          &larr; Keep Editing
        </button>
        <button type="button" id="ps-btn-save-push" class="ps-btn ps-btn-primary ps-btn-lg">
          Save &amp; Push to Nuvio 🚀
        </button>
      </div>
    `;

    el('ps-btn-back-canvas')?.addEventListener('click', () => {
      state.step = 'canvas';
      render();
    });

    el('ps-btn-save-push')?.addEventListener('click', async () => {
      await executePush();
    });
  }

  // -------------------------------------------------------------
  // Execute Push with Local Backup
  // -------------------------------------------------------------
  async function executePush() {
    state.isLoading = true;
    state.loadingMsg = `Pushing layout to ${state.selectedProfile.name}...`;
    render();

    try {
      // 1. Create browser backup
      try {
        const backupKey = `${BACKUP_PREFIX}${state.selectedProfile.profile_index}_${Date.now()}`;
        localStorage.setItem(backupKey, JSON.stringify(state.originalCollections));
      } catch (e) {
        console.warn('Could not write backup to localStorage', e);
      }

      // 2. Ensure domain invariants
      const payload = deepClone(state.workingCollections);
      payload.forEach((cat) => {
        cat.focusGlowEnabled = true;
        if (cat.pinToTop == null) cat.pinToTop = true;
      });

      // 3. Push to Supabase via NuvioPush
      await window.NuvioPush.pushCollections(state.token, state.selectedProfile.profile_index, payload);

      state.originalCollections = deepClone(payload);
      state.workingCollections = deepClone(payload);
      state.isLoading = false;
      state.step = 'success';
      render();
    } catch (err) {
      state.isLoading = false;
      state.errorMsg = (err && err.message) || 'Failed to save to Nuvio. Please check your connection.';
      state.step = 'confirm';
      render();
    }
  }

  // -------------------------------------------------------------
  // STEP 5: Success Celebration View
  // -------------------------------------------------------------
  function renderSuccess(container) {
    container.innerHTML = `
      <div class="ps-header ps-header-center">
        <div class="ps-success-icon">🎉</div>
        <h2 class="ps-title">Profile Updated Successfully!</h2>
        <p class="ps-subtitle">Your custom categories and folders have been synced to <strong>${escapeHtml(state.selectedProfile.name)}</strong>.</p>
      </div>

      <div class="ps-body ps-success-body">
        <div class="ps-success-tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0;">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
            <polyline points="17 2 12 7 7 2"></polyline>
          </svg>
          <div>
            <strong>How to see it on TV:</strong>
            <p>Simply close and reopen the Nuvio app on your TV, Chromecast, Fire TV, or mobile device. Your new layout and folders will appear automatically!</p>
          </div>
        </div>

        <div class="ps-success-actions">
          <button type="button" id="ps-btn-edit-another" class="ps-btn ps-btn-secondary">
            Edit Another Profile
          </button>
          <button type="button" id="ps-btn-done" class="ps-btn ps-btn-primary">
            Done &amp; Close &times;
          </button>
        </div>
      </div>
    `;

    el('ps-btn-edit-another')?.addEventListener('click', () => {
      state.step = 'profiles';
      render();
    });

    el('ps-btn-done')?.addEventListener('click', () => {
      ProfileStudio.close();
    });
  }

  // Escape closes just an open kebab menu if one exists, otherwise closes
  // the whole modal. Attached only while open (open()/close() below), so it
  // never fires — or leaks — while Profile Studio isn't on screen.
  function handleModalKeydown(e) {
    if (e.key !== 'Escape') return;
    const openMenu = document.querySelector('.ps-actions-dropdown.is-open');
    if (openMenu) {
      openMenu.classList.remove('is-open');
      const t = openMenu.closest('.ps-actions-menu')?.querySelector('.ps-kebab-trigger');
      if (t) t.setAttribute('aria-expanded', 'false');
      return;
    }
    ProfileStudio.close();
  }

  // -------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------
  window.ProfileStudio = {
    open(opts) {
      ensureModalElement();
      state.isOpen = true;
      state.errorMsg = '';
      state.toastMsg = '';

      // Check for saved session token
      const savedToken = sessionStorage.getItem(STORAGE_TOKEN_KEY);
      const savedEmail = sessionStorage.getItem(STORAGE_EMAIL_KEY);

      if (savedToken && window.NuvioPush) {
        state.token = savedToken;
        state.email = savedEmail || '';
        loadProfiles();
      } else {
        state.step = 'login';
        render();
      }

      const overlay = el('profile-studio-overlay');
      if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
      document.addEventListener('keydown', handleModalKeydown);
      const panel = el('profile-studio-panel');
      if (panel) panel.focus();
    },

    close() {
      state.isOpen = false;
      const overlay = el('profile-studio-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
      document.removeEventListener('keydown', handleModalKeydown);
    },

    toggle() {
      if (state.isOpen) this.close();
      else this.open();
    },
  };

  // Wire launcher buttons on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    // Title screen button
    const titleBtn = el('title-screen-profile-studio');
    if (titleBtn) titleBtn.addEventListener('click', () => window.ProfileStudio.open());

    // Showcase card
    const showcaseCard = el('title-screen-profile-studio-card');
    if (showcaseCard) showcaseCard.addEventListener('click', () => window.ProfileStudio.open());

    // Picker header button
    const pickerBtn = el('btn-open-profile-studio');
    if (pickerBtn) pickerBtn.addEventListener('click', () => window.ProfileStudio.open());
  });
})();
