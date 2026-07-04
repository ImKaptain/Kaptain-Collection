/**
 * Kaptain's Mega Collection — Nuvio Setup Wizard
 * ----------------------------------------------
 * A guided modal that lets a visitor either:
 *   1) Push their picked collection straight into their Nuvio account
 *      (creating an account if they don't have one), or
 *   2) Take the safe hand-off route — download the file / copy the link —
 *      without sharing any login.
 *
 * Relies on globals from app.js (assembleFilteredDatabase, compileAndDownloadJSON,
 * showToast, window.KaptainExport) and window.NuvioPush from nuvio-push.js.
 */
(function () {
  const DEFAULT_PROFILE_NAME = "Kaptain's Collection";

  // Nuvio stores settings per device type; the user's TV is what we target.
  // Nuvio stores settings per device type. Write to both confirmed buckets so
  // the keys apply whether the user opens Nuvio on their TV or their phone.
  const SETTINGS_PLATFORMS = ['tv', 'mobile'];

  // Starter-guide addon suggestions (numb3rs-based, NO AI addons). Plain scraper
  // manifests with no API key — they resolve through Torbox Instant. Editable in
  // the UI: the user can toggle, remove, or add their own.
  const SUGGESTED_ADDONS = [
    { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json', recommended: true,
      note: 'Works with Torbox Instant, no key needed.' },
    { name: 'Comet', url: 'https://cometfortheweebs.midnightignite.me/manifest.json', recommended: false,
      note: 'Works with Torbox Instant, no key needed.' },
  ];

  // Metadata addons a collection needs in order to actually render rows. Nuvio
  // usually seeds these on a new profile, but we ensure them so a fresh user
  // never lands on empty rows. installAddons de-dupes, so this is a safe no-op
  // when they're already present.
  const METADATA_ADDONS = [
    { name: 'Cinemeta', url: 'https://v3-cinemeta.strem.io' },
  ];

  // The exact preset I want copied into AIO Metadata's import box. Stored
  // verbatim (not rebuilt via JSON.stringify) so what gets copied matches
  // byte-for-byte, including key order and the timestamp.
  const AIO_PRESET_JSON = `{
  "version": 1,
  "exportedAt": "2026-06-30T02:35:34.372Z",
  "catalogs": [
    {
      "id": "trakt.watchlist.movies",
      "type": "movie",
      "name": "Watchlist",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "movie"
    },
    {
      "id": "trakt.watchlist.series",
      "type": "series",
      "name": "Watchlist",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "series"
    },
    {
      "id": "trakt.recommendations.movies",
      "type": "movie",
      "name": "Recommendations",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "movie"
    },
    {
      "id": "trakt.recommendations.shows",
      "type": "series",
      "name": "Recommendations",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "series"
    },
    {
      "id": "trakt.upnext",
      "type": "series",
      "name": "Up Next",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300,
      "displayType": "series"
    },
    {
      "id": "trakt.unwatched",
      "type": "series",
      "name": "Recently Aired",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300,
      "displayType": "series"
    },
    {
      "id": "trakt.calendar",
      "type": "series",
      "name": "Airing Soon",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300
    }
  ]
}`;

  // Every step here is matched against real screenshots of the page, not
  // guessed. Positions are still my best read of those screenshots though,
  // not pixel-exact: it's a cross-origin iframe, so I can't see its real
  // scroll position or DOM. The tooltip's drag handle is the fallback when a
  // guess is off for someone's screen.
  // refImage.src is a real screenshot of this exact step; .pos is the
  // object-position used to crop/zoom the thumbnail toward the relevant
  // spot. The thumbnail is the actual accuracy fix, not the pointer, since
  // it's a real screenshot rather than a guess at where things are.
  const AIO_TUTORIAL_STEPS = [
    {
      state: 1,
      label: 'Step 1 of 11',
      title: 'Open Catalogs',
      // pos crops to sidebar with Catalogs visible but not yet selected.
      body: `In the left sidebar, scroll down until you see "Catalogs" -- it's the 7th item from the top. Click it. The main area will switch to Catalog Management.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/step1.png', pos: '15% 50%' },
    },
    {
      state: 2,
      label: 'Step 2 of 11',
      title: 'Choose "Start from Scratch"',
      body: `Click "Start from Scratch" on the right -- NOT the "Start with Defaults" option, even though it says Recommended. You need a blank slate for the Trakt preset.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step2.png', pos: '78% 50%' },
    },
    {
      state: 3,
      label: 'Step 3 of 11',
      title: 'Close the Catalog Builder popup',
      body: `A "Build Your Catalog" dialog appears -- click its X to close it. Skip this for now; the next step pastes a ready-made preset instead.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step3.png', pos: '90% 15%' },
    },
    {
      state: 4,
      label: 'Step 4 of 11',
      title: 'Click "Import Setup"',
      body: `In the toolbar at the top of the page, find the row of buttons starting with "Quick Add". The last button on the right is "Import Setup" -- click it.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step4.png', pos: '85% 22%' },
    },
    {
      state: 5,
      label: 'Step 5 of 11',
      title: 'Import the Trakt preset',
      body: `Click "Copy Preset to Clipboard" below, then paste into the "Paste JSON" tab of the Import dialog and click "Import". New catalogs should appear in the list.`,
      actions: ['copy-primary', 'next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step5.png', pos: '70% 72%' },
    },
    {
      state: 6,
      label: 'Step 6 of 11',
      title: 'Open Trakt Integration',
      body: `Your imported catalogs are now visible. Above them, find the row of small service icons. Click the Trakt icon -- it looks like a pink checkmark on a dark background. This opens the Trakt Integration panel.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step6.png', pos: '35% 30%' },
    },
    {
      state: 7,
      label: 'Step 7 of 11',
      title: 'Authorize with Trakt',
      body: `Click "Authorize Trakt" -- this opens a new browser tab to Trakt.tv. Log in and click "Allow". On the success page, click "Copy Token ID" to copy your token. Back here, paste it into the Token ID field and click "Connect Trakt". If the tab doesn't open, check that your browser isn't blocking popups from this site.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Trakt2.png', pos: '50% 45%' },
    },
    {
      state: 8,
      label: 'Step 8 of 11',
      title: 'Confirm connection and close',
      body: `The status should now show "Connected". Once you see that, click the X to close this panel. If it still says "Not connected", click "Authorize Trakt" again.`,
      actions: ['next'],
      // Step8.png should show the Trakt Integration panel in the connected/green state.
      refImage: { src: 'assets/aio-tutorial-refs/Trakt3.png', pos: '90% 35%' },
    },
    {
      state: 9,
      label: 'Step 9 of 11',
      title: 'Save your configuration',
      body: `In the left sidebar, click "Configuration". On the page that appears, click "Save Configuration". This is what generates your unique manifest link.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step9.png', pos: '80% 75%' },
    },
    {
      state: 10,
      label: 'Step 10 of 11',
      title: 'Set a password',
      body: `A dialog asks for a password and confirmation. Choose something you'll remember -- you'll need this to edit your AIO Metadata setup later. Save it somewhere safe, then click Save.`,
      actions: ['next'],
      // Step10.png should show the Save Configuration password dialog.
      refImage: { src: 'assets/aio-tutorial-refs/password1.png', pos: '50% 50%' },
    },
    {
      state: 11,
      label: 'Step 11 of 11',
      title: 'Copy your Install URL',
      body: `Below the Configuration settings, find "Your UUID" and "Install URL". Copy the Install URL -- that's your manifest link. Also save the UUID somewhere safe; you'll need it to edit this setup later. Then close this window and paste the URL into the "AIO Metadata manifest URL" field in the wizard.`,
      actions: ['done'],
      refImage: { src: 'assets/aio-tutorial-refs/password2.png', pos: '50% 65%' },
    },
  ];

  let aioTutorialIndex = 0;

  // Torbox API keys are UUIDs. We can't ping Torbox from a static page (their
  // API blocks cross-site browser calls), so this is a shape check — it catches
  // typos / partial pastes, and the write itself is verified against Nuvio.
  const TORBOX_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isTorboxKeyShape(k) { return TORBOX_KEY_RE.test(String(k || '').trim()); }

  // Lightweight liveness check for a custom manifest URL before we let it into
  // the push. Many manifest servers don't send CORS headers for browser fetches,
  // so a thrown/opaque error here doesn't prove the addon is dead — only a real
  // non-2xx HTTP response does. ok:false = confirmed bad (hard block). ok:null =
  // couldn't verify (soft warn, same double-tap-to-override UX as the Torbox key).
  async function checkManifestAlive(url) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, reason: `That manifest URL returned HTTP ${res.status}. Double-check the link.` };
      return { ok: true };
    } catch (e) {
      return { ok: null, reason: `Couldn't verify that manifest link (could just be a CORS-blocked or slow server). Tap "Add Addon" again to add it anyway.` };
    }
  }

  const state = {
    step: 'choose',     // choose | account | profile | placement | pushing | streaming | done | error
    flow: 'collection', // collection (import + optional streaming) | starter (streaming only)
    mode: 'create',     // create | signin
    email: '',
    password: '',
    profileName: DEFAULT_PROFILE_NAME,
    token: null,
    profiles: [],
    selectedProfileId: null,
    createNewProfile: true,
    existingCollections: [],   // current rows on the chosen existing profile
    placementIndex: null,      // where to splice the new rows into existingCollections
    targetProfileId: null,     // profile the streaming setup writes to
    torboxKey: '',
    aioManifestUrl: '',        // manifest URL the visitor pastes back from AIO Metadata
    addonChoices: null,        // [{ name, url, checked }] — built lazily from SUGGESTED_ADDONS
    streamingApplied: false,   // whether the user ran the streaming setup
    torboxApplied: false,      // whether a Torbox key was actually written
    streamWarned: false,       // shown the "scrapers without a key" heads-up yet
    torboxShapeWarned: false,  // shown the "key looks wrong" heads-up yet
    prefill: null,             // settings handed in from the Quick editor (one-shot)
    resultProfileName: '',
    // For the finish summary:
    accountAction: '',         // 'created' | 'signedin'
    collectionRows: 0,         // rows we just added to the profile
    addonsAdded: [],           // names of scraper addons installed this run
    tmdbApplied: false,
    mdblistApplied: false,
    traktApplied: false,
    avatarApplied: false,
    errorMsg: '',
    devices: [],               // ['tv'] | ['mobile'] | ['tv','mobile']
    streamingSubStep: null,    // 'prompt' | 'torbox' | 'addons'
    streamingShowAddons: false,
    tmdbKey: '',
  };

  function el(id) { return document.getElementById(id); }

  function countSelection() {
    // Re-derive the same numbers shown in the control bar.
    let folders = 0, sources = 0;
    try {
      const compiled = assembleFilteredDatabase();
      compiled.forEach((cat) => {
        (cat.folders || []).forEach((f) => {
          folders += 1;
          sources += (f.sources || []).length;
        });
      });
    } catch (e) { /* ignore */ }
    return { folders, sources };
  }

  function open(opts) {
    state.flow = (opts && opts.flow === 'starter') ? 'starter'
               : (opts && opts.flow === 'collection-only') ? 'collection-only'
               : 'collection';
    state.errorMsg = '';
    state.torboxKey = '';
    state.aioManifestUrl = '';
    state._aioUrlVerified = false;
    state._lastAioUrlWarned = null;
    state.addonChoices = null;
    state.streamingApplied = false;
    state.torboxApplied = false;
    state.streamWarned = false;
    state.torboxShapeWarned = false;
    state.targetProfileId = null;
    state.accountAction = '';
    state.collectionRows = 0;
    state.addonsAdded = [];
    state.tmdbApplied = false;
    state.mdblistApplied = false;
    state.traktApplied = false;
    state.avatarApplied = false;
    state.devices = [];
    state.streamingSubStep = null;
    state.streamingShowAddons = false;
    state.tmdbKey = '';
    state._devicesAutoSwitch = true;
    state._streamManifestWarnedUrls = null;
    // Pre-filled settings from the Quick editor → applied in one shot, no
    // interactive streaming step.
    state.prefill = (opts && opts.prefill && typeof opts.prefill === 'object') ? opts.prefill : null;
    if (state.prefill && state.prefill.profileName) state.profileName = String(state.prefill.profileName).trim() || DEFAULT_PROFILE_NAME;
    // Routing: collection-only → straight to account (no device or streaming steps).
    // starter → straight to account (streaming-only, no collection or device question).
    // collection + skipChoose → devices step first (asks TV/Mobile before account).
    // collection → choose step (Send vs Download fork).
    if (state.flow === 'collection-only' || state.flow === 'starter') {
      state.step = 'account';
      state.mode = 'create';
    } else if (opts && opts.skipChoose) {
      state.step = 'devices';
      state.mode = 'create';
    } else {
      state.step = 'choose';
    }
    const overlay = el('wizard-overlay');
    if (overlay) overlay.classList.add('open');
    render();
  }

  function close() {
    const overlay = el('wizard-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function go(step) { state.step = step; render(); }

  // ----- ICONS -----
  const ICON = {
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
  };

  // ====================================================================
  // RENDER
  // ====================================================================
  function render() {
    const panel = el('wizard-panel');
    if (!panel) return;

    if (state.step === 'devices') return renderDevices(panel);
    if (state.step === 'choose') return renderChoose(panel);
    if (state.step === 'account') return renderAccount(panel);
    if (state.step === 'profile') return renderProfile(panel);
    if (state.step === 'placement') return renderPlacement(panel);
    if (state.step === 'streaming') return renderStreaming(panel);
    if (state.step === 'pushing') return renderPushing(panel);
    if (state.step === 'for-you') return renderForYou(panel);
    if (state.step === 'done') return renderDone(panel);
    if (state.step === 'error') return renderError(panel);
  }

  function header(title, subtitle, withBack, progressStep) {
    return `
      <div class="wiz-header">
        ${withBack ? `<button class="wiz-back" id="wiz-back" title="Back">${ICON.back}</button>` : ''}
        <div class="wiz-header-text">
          <h3 class="wiz-title">${title}</h3>
          ${subtitle ? `<p class="wiz-sub">${subtitle}</p>` : ''}
        </div>
        <button class="wiz-close" id="wiz-close" aria-label="Close">&times;</button>
      </div>
      ${progressStep ? progressBar(progressStep) : ''}`;
  }

  // Simple Account → Profile → Streaming progress for the guided steps.
  function progressIndex(step) {
    if (step === 'account') return 0;
    if (step === 'profile' || step === 'placement') return 1;
    if (step === 'streaming') return 2;
    return -1;
  }
  function progressBar(step) {
    const idx = progressIndex(step);
    if (idx < 0) return '';
    const labels = ['Account', 'Profile', 'Streaming'];
    const dots = labels.map((label, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      const mark = i < idx ? ICON.check : (i + 1);
      return `<span class="wiz-prog-step ${cls}"><span class="wiz-prog-dot">${mark}</span><span class="wiz-prog-label">${label}</span></span>`;
    }).join('<span class="wiz-prog-line"></span>');
    return `<div class="wiz-progress">${dots}</div>`;
  }

  function renderChoose(panel) {
    const { folders, sources } = countSelection();
    panel.innerHTML = `
      ${header('Get Your Collection into Nuvio', `${folders} folders · ${sources} sources ready to go`, false)}
      <div class="wiz-body">
        <button class="wiz-option" id="wiz-pick-push">
          <span class="wiz-option-icon accent">${ICON.rocket}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">Send straight to Nuvio</span>
            <span class="wiz-option-desc">Sign in or create a Nuvio account and I'll load your collection in instantly. It'll be there on every device you use.</span>
          </span>
        </button>
        <button class="wiz-option" id="wiz-pick-download">
          <span class="wiz-option-icon">${ICON.download}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">Just download the file</span>
            <span class="wiz-option-desc">Prefer not to share a login? Grab the file (or copy the import link) and add it in Nuvio yourself.</span>
          </span>
        </button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-pick-push').addEventListener('click', () => {
      if (countSelection().folders === 0) {
        showToast('Pick at least one folder before sending to Nuvio.', 'error');
        return;
      }
      go('devices');
    });
    el('wiz-pick-download').addEventListener('click', () => {
      close();
      if (typeof compileAndDownloadJSON === 'function') compileAndDownloadJSON();
    });
  }

  function renderAccount(panel) {
    const minLen = state.mode === 'create' ? 8 : 6;
    const starter = state.flow === 'starter';
    const sub = starter
      ? (state.mode === 'create'
          ? "I'll set up a new account and a fresh profile, then get your streaming ready."
          : "I'll sign you in and set up streaming on whichever profile you pick.")
      : (state.mode === 'create'
          ? "Create an account, pick a profile, and your collection loads on every device."
          : "Sign in, pick a profile, and your collection loads on every device.");
    panel.innerHTML = `
      ${header('Your Nuvio Account', sub, true, 'account')}
      <div class="wiz-body">
        <div class="wiz-toggle">
          <button class="wiz-toggle-btn ${state.mode === 'create' ? 'active' : ''}" data-mode="create">Create account</button>
          <button class="wiz-toggle-btn ${state.mode === 'signin' ? 'active' : ''}" data-mode="signin">Sign in</button>
        </div>

        <div class="wiz-privacy">
          <span class="wiz-privacy-icon">${ICON.lock}</span>
          <span>Your email and password go straight to Nuvio from your browser. This site is just a static page. It has no server, so nothing you type ever gets stored or seen by me.</span>
        </div>

        <label class="wiz-label">Email address
          <input type="email" id="wiz-email" class="wiz-input" placeholder="you@example.com" value="${escapeAttr(state.email)}" autocomplete="email">
        </label>
        <label class="wiz-label">Password <span class="wiz-hint">(min. ${minLen} characters)</span>
          <span class="wiz-input-wrap">
            <input type="password" id="wiz-password" class="wiz-input" placeholder="Enter your password..." value="${escapeAttr(state.password)}" autocomplete="${state.mode === 'create' ? 'new-password' : 'current-password'}">
            <button type="button" class="wiz-input-toggle" id="wiz-pw-toggle">Show</button>
          </span>
        </label>
        ${state.mode === 'create' ? `
        <label class="wiz-label">Profile name
          <input type="text" id="wiz-profile-name" class="wiz-input" placeholder="${DEFAULT_PROFILE_NAME}" value="${escapeAttr(state.profileName)}">
        </label>` : ''}

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>

        <button class="wiz-primary" id="wiz-continue">
          <span>${state.mode === 'create' ? 'Create account & continue' : 'Sign in & continue'}</span>
        </button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    // Starter flow has no choose step before account — back just closes.
    el('wiz-back').addEventListener('click', () => (state.flow === 'collection' ? go('devices') : close()));
    panel.querySelectorAll('.wiz-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputs();
        state.mode = btn.getAttribute('data-mode');
        render();
      });
    });
    const pwToggle = el('wiz-pw-toggle');
    if (pwToggle) pwToggle.addEventListener('click', () => {
      const pw = el('wiz-password');
      if (!pw) return;
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      pwToggle.textContent = show ? 'Hide' : 'Show';
    });
    el('wiz-continue').addEventListener('click', onAccountContinue);
  }

  function renderProfile(panel) {
    const opts = state.profiles.map((p) =>
      `<option value="${p.profile_index}" ${state.selectedProfileId === p.profile_index && !state.createNewProfile ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const starter = state.flow === 'starter';
    panel.innerHTML = `
      ${header('Choose a Profile', starter ? 'Which profile do you want set up?' : 'Where do you want your collection?', true, 'profile')}
      <div class="wiz-body">
        <label class="wiz-label">Profile
          <select id="wiz-profile-select" class="wiz-input">
            <option value="__new__" ${state.createNewProfile ? 'selected' : ''}>➕ Create a new profile (recommended)</option>
            ${opts}
          </select>
        </label>

        <div id="wiz-newprofile-wrap" class="wiz-label" style="${state.createNewProfile ? '' : 'display:none;'}">
          <span>New profile name</span>
          <input type="text" id="wiz-profile-name" class="wiz-input" placeholder="${DEFAULT_PROFILE_NAME}" value="${escapeAttr(state.profileName)}">
        </div>

        <div class="wiz-note" id="wiz-profile-note">${profileNoteText()}</div>

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>

        <button class="wiz-primary" id="wiz-push"><span>${starter ? 'Continue to streaming setup' : 'Load my collection into Nuvio'}</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('account'));

    const select = el('wiz-profile-select');
    select.addEventListener('change', () => {
      if (select.value === '__new__') {
        state.createNewProfile = true;
        state.selectedProfileId = null;
      } else {
        state.createNewProfile = false;
        state.selectedProfileId = Number(select.value);
      }
      el('wiz-newprofile-wrap').style.display = state.createNewProfile ? '' : 'none';
      el('wiz-profile-note').innerHTML = profileNoteText();
    });
    el('wiz-push').addEventListener('click', onPush);
  }

  function profileNoteText() {
    if (state.flow === 'starter') {
      return state.createNewProfile
        ? "I'll spin up a brand-new profile, then set up streaming on it. Your existing profiles stay exactly as they are."
        : "I'll add the streaming setup to this profile. Your collection on it stays exactly as it is.";
    }
    return state.createNewProfile
      ? "I'll create a brand-new profile just for this collection. Your existing profiles stay exactly as they are."
      : "Next you'll pick exactly where these rows slot into this profile's current collection. Nothing already there gets removed.";
  }

  function renderPushing(panel) {
    panel.innerHTML = `
      <div class="wiz-body wiz-center">
        <div class="popup-spinner"></div>
        <h3 class="wiz-title">${escapeHtml(state.pushingLabel || 'Setting up Nuvio...')}</h3>
        <p class="wiz-sub">Talking to Nuvio. This only takes a moment.</p>
      </div>`;
  }

  function renderDone(panel) {
    if (!state._telemetryFired) {
      state._telemetryFired = true;
      if (window.KaptainTelemetry) window.KaptainTelemetry.hit('deployments');
    }
    const name = escapeHtml(state.resultProfileName || 'your');
    const items = [];
    const ok = (txt) => items.push(`<li class="wiz-sum-ok">${ICON.check}<span>${txt}</span></li>`);
    const todo = (txt) => items.push(`<li class="wiz-sum-todo"><span class="wiz-sum-dot">○</span><span>${txt}</span></li>`);

    ok(state.accountAction === 'created' ? 'Nuvio account created' : 'Signed in to Nuvio');
    ok(`Profile: <strong>${name}</strong>`);
    if ((state.flow === 'collection' || state.flow === 'collection-only') && state.collectionRows > 0) {
      ok(`${state.collectionRows} ${state.collectionRows === 1 ? 'row' : 'rows'} added to your collection`);
    }
    if (state.addonsAdded && state.addonsAdded.length) {
      ok(`Scrapers installed: ${escapeHtml(state.addonsAdded.join(', '))}`);
    }
    if (state.torboxApplied) {
      ok('Torbox streaming switched on');
    } else if (state.streamingApplied) {
      todo('Torbox not set. Add a debrid key in Nuvio before streams will play.');
    }
    if (state.tmdbApplied) ok('TMDB integration on');
    if (state.mdblistApplied) ok('MDBList key saved');
    if (state.traktApplied) ok('Trakt connected');
    if (state.avatarApplied) ok('Profile image set');

    const readyToStream = state.torboxApplied;
    const hasMobile = state.devices.includes('mobile');
    const nextSteps = readyToStream
      ? `<strong>On your TV:</strong> open Nuvio → switch to the "${name}" profile → press play. That's it.${hasMobile ? `<br><br><strong>On mobile:</strong> open the Nuvio app → Settings → Connected Services → Torbox to finish connecting Torbox (takes ~30 seconds).` : ''}`
      : `<strong>On your TV:</strong> open Nuvio and switch to the "${name}" profile. To play streams you'll still need a Torbox (or other debrid) key in Nuvio's settings.`;

    panel.innerHTML = `
      ${header("You're live. 🎉", '', false)}
      <div class="wiz-body">
        <div class="wiz-center"><div class="wiz-success-badge">${ICON.check}</div></div>
        <ul class="wiz-summary">${items.join('')}</ul>
        <div class="wiz-note wiz-nextsteps">${nextSteps}</div>
        <button class="wiz-primary" id="wiz-done-close"><span>Done</span></button>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-done-close').addEventListener('click', close);
  }

  function renderError(panel) {
    panel.innerHTML = `
      ${header('Something Went Wrong', '', true)}
      <div class="wiz-body">
        <div class="wiz-error" style="display:block;">${escapeHtml(state.errorMsg)}</div>
        <p class="wiz-note">You can try again, or just grab the download instead. No login needed.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-err-download"><span>Download instead</span></button>
          <button class="wiz-primary" id="wiz-err-retry"><span>Try again</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('account'));
    el('wiz-err-retry').addEventListener('click', () => go('account'));
    el('wiz-err-download').addEventListener('click', () => {
      close();
      if (typeof compileAndDownloadJSON === 'function') compileAndDownloadJSON();
    });
  }

  // ====================================================================
  // ACTIONS
  // ====================================================================
  function syncInputs() {
    const email = el('wiz-email');
    const pw = el('wiz-password');
    const pn = el('wiz-profile-name');
    if (email) state.email = email.value.trim();
    if (pw) state.password = pw.value;
    if (pn) state.profileName = pn.value;
  }

  function showInlineError(msg) {
    const box = el('wiz-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  }

  async function onAccountContinue() {
    syncInputs();
    const minLen = state.mode === 'create' ? 8 : 6;
    if (!state.email.includes('@')) return showInlineError('Please enter a valid email address.');
    if (state.password.length < minLen) return showInlineError(`Password must be at least ${minLen} characters.`);
    if (state.mode === 'create' && !state.profileName.trim()) state.profileName = DEFAULT_PROFILE_NAME;

    try {
      if (state.mode === 'create') {
        state.pushingLabel = 'Creating your Nuvio account...';
        go('pushing');
        let auth;
        try {
          auth = await window.NuvioPush.signup(state.email, state.password);
        } catch (e) {
          // Email already has a Nuvio account → quietly switch them to sign-in
          // instead of dead-ending on an error screen.
          if (/already (exists|registered)/i.test((e && e.message) || '')) {
            state.mode = 'signin';
            go('account');
            showInlineError('Looks like you already have a Nuvio account with that email, so I switched you over to Sign in. Enter your password to continue.');
            return;
          }
          throw e;
        }
        state.token = auth.token;
        state.accountAction = 'created';
        // Brand-new account → create the first profile, then continue.
        const profile = await createTargetProfile(state.profileName.trim() || DEFAULT_PROFILE_NAME);
        if (state.flow === 'starter') return proceedToStreaming();
        await doPushCollection(profile.profile_index);  // collection flow
        return proceedToStreaming();
      } else {
        state.pushingLabel = 'Signing in...';
        go('pushing');
        const auth = await window.NuvioPush.login(state.email, state.password);
        state.token = auth.token;
        state.accountAction = 'signedin';
        state.profiles = await window.NuvioPush.getProfiles(state.token);
        // Default to the safe "create new profile" choice.
        state.createNewProfile = true;
        state.selectedProfileId = state.profiles[0] ? state.profiles[0].profile_index : null;
        go('profile');
      }
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  function onPush() {
    doOnPush();
  }

  async function doOnPush() {
    const pn = el('wiz-profile-name');
    if (pn) state.profileName = pn.value;
    try {
      if (state.createNewProfile) {
        const profile = await createTargetProfile(state.profileName.trim() || DEFAULT_PROFILE_NAME);
        if (state.flow === 'starter') return proceedToStreaming();
        await doPushCollection(profile.profile_index);
        return proceedToStreaming();
      }
      // Existing profile chosen.
      const profile = state.profiles.find((p) => p.profile_index === state.selectedProfileId);
      const profileName = profile ? profile.name : `Profile ${state.selectedProfileId}`;
      state.targetProfileId = state.selectedProfileId;
      state.resultProfileName = profileName;
      if (state.flow === 'starter') return proceedToStreaming();
      // Collection flow → read current rows so the user can choose where the new
      // ones land, then show the placement step.
      state.pushingLabel = 'Reading your current collection...';
      go('pushing');
      state.existingCollections = await window.NuvioPush.pullCollections(state.token, state.selectedProfileId);
      if (!state.existingCollections.length) {
        // Empty profile — nothing to merge into, just push the selection.
        await doMergedPush(profileName);
        return;
      }
      state.placementIndex = null; // default to bottom, computed in renderPlacement
      go('placement');
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  // Existing rows minus any that share an id with an incoming category, so a
  // re-import replaces those rows in place instead of duplicating them.
  function keptExisting(incoming) {
    const incomingIds = new Set((incoming || []).map((c) => c && c.id).filter(Boolean));
    return (state.existingCollections || []).filter((c) => !c || !c.id || !incomingIds.has(c.id));
  }

  function renderPlacement(panel) {
    const incoming = assembleFilteredDatabase();
    const kept = keptExisting(incoming);
    if (state.placementIndex == null) state.placementIndex = kept.length; // default: bottom

    const newCount = incoming.length;
    const rowLabel = `${newCount} ${newCount === 1 ? 'row' : 'rows'}`;
    const opts = [`<option value="0" ${state.placementIndex === 0 ? 'selected' : ''}>⬆️ At the very top</option>`];
    kept.forEach((c, i) => {
      const idx = i + 1;
      const isBottom = idx === kept.length;
      const label = isBottom
        ? `⬇️ At the very bottom (after "${escapeHtml(c.title || 'row')}")`
        : `After "${escapeHtml(c.title || 'row')}"`;
      opts.push(`<option value="${idx}" ${state.placementIndex === idx ? 'selected' : ''}>${label}</option>`);
    });

    panel.innerHTML = `
      ${header('Where Should It Go?', `Slot your ${rowLabel} into this profile's collection.`, true, 'placement')}
      <div class="wiz-body">
        <label class="wiz-label">Insert position
          <select id="wiz-placement-select" class="wiz-input">${opts.join('')}</select>
        </label>
        <div class="wiz-note">Everything already on this profile stays. If a row you're adding matches one that's already there (same row), it's refreshed in place rather than duplicated.</div>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <button class="wiz-primary" id="wiz-place-push"><span>Add my rows here</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('profile'));
    el('wiz-placement-select').addEventListener('change', (e) => {
      state.placementIndex = Number(e.target.value);
    });
    el('wiz-place-push').addEventListener('click', async () => {
      try {
        const profile = state.profiles.find((p) => p.profile_index === state.selectedProfileId);
        await doMergedPush(profile ? profile.name : `Profile ${state.selectedProfileId}`);
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
    });
  }

  // Build the merged array (existing rows + incoming spliced at placementIndex)
  // and push it to the chosen existing profile, then go to the streaming step.
  async function doMergedPush(profileName) {
    state.pushingLabel = 'Loading your collection...';
    go('pushing');
    const incoming = assembleFilteredDatabase();
    if (!incoming || incoming.length === 0) {
      throw new Error('No folders are selected, so there is nothing to send.');
    }
    const kept = keptExisting(incoming);
    const idx = Math.max(0, Math.min(state.placementIndex == null ? kept.length : state.placementIndex, kept.length));
    const merged = kept.slice(0, idx).concat(incoming, kept.slice(idx));
    await window.NuvioPush.pushCollections(state.token, state.selectedProfileId, merged);
    state.collectionRows = incoming.length;
    state.targetProfileId = state.selectedProfileId;
    state.resultProfileName = profileName;
    await ensureMetadataAddons(state.selectedProfileId);
    await proceedToStreaming();
  }

  // Safety net so a fresh profile's collection actually renders. No-op when the
  // metadata addons are already there (Nuvio usually seeds them).
  async function ensureMetadataAddons(profileId) {
    try { await window.NuvioPush.installAddons(state.token, profileId, METADATA_ADDONS); }
    catch (e) { /* non-fatal — collection is still saved */ }
  }

  // Creates a fresh profile and records it as the streaming target.
  async function createTargetProfile(name) {
    state.pushingLabel = 'Creating your profile...';
    go('pushing');
    const profile = await window.NuvioPush.createProfile(state.token, name);
    if (!profile) throw new Error('Your account is ready, but the profile could not be created. Please try again.');
    state.targetProfileId = profile.profile_index;
    state.resultProfileName = profile.name;
    return profile;
  }

  // Full push of the current selection to a brand-new / freshly-chosen profile.
  async function doPushCollection(profileId) {
    state.pushingLabel = 'Loading your collection...';
    go('pushing');
    const collections = assembleFilteredDatabase();
    if (!collections || collections.length === 0) {
      throw new Error('No folders are selected, so there is nothing to send.');
    }
    await window.NuvioPush.pushCollections(state.token, profileId, collections);
    state.collectionRows = collections.length;
    await ensureMetadataAddons(profileId);
  }

  // After the collection is saved: collection-only skips straight to done;
  // prefilled settings are applied in one shot; otherwise show the interactive
  // streaming sub-steps.
  async function proceedToStreaming() {
    try {
      await window.NuvioPush.applyProfileSettings(state.token, state.targetProfileId, SETTINGS_PLATFORMS, { autoplayTrailers: true });
    } catch (e) { /* non-fatal — profile/collection are already saved */ }
    if (state.prefill) return applyPrefillAndFinish();
    if (state.flow === 'collection-only') { go('done'); return; }
    state.streamingSubStep = null;
    state.streamingShowAddons = false;
    go('streaming');
  }

  async function applyPrefillAndFinish() {
    const p = state.prefill || {};
    state.pushingLabel = 'Setting up your streaming & integrations...';
    go('pushing');
    const pid = state.targetProfileId;
    const hasSettings = p.torboxKey || p.tmdbKey || p.tmdbEnabled || p.mdblistKey || p.trakt;
    if (hasSettings) {
      await window.NuvioPush.applyProfileSettings(state.token, pid, SETTINGS_PLATFORMS, {
        torboxKey: p.torboxKey, tmdbEnabled: p.tmdbEnabled, tmdbKey: p.tmdbKey,
        mdblistKey: p.mdblistKey, trakt: p.trakt,
      });
      state.torboxApplied = !!p.torboxKey;
      state.tmdbApplied = !!(p.tmdbKey || p.tmdbEnabled);
      state.mdblistApplied = !!p.mdblistKey;
      state.traktApplied = !!p.trakt;
    }
    const picked = (p.addons || []).filter((a) => a && a.checked && a.url);
    if (picked.length) {
      await window.NuvioPush.installAddons(state.token, pid, picked.map((a) => ({ name: a.name, url: a.url })));
      state.addonsAdded = picked.map((a) => a.name);
    }
    if (p.avatarUrl && String(p.avatarUrl).trim()) {
      await window.NuvioPush.setProfileAvatar(state.token, pid, p.avatarUrl);
      state.avatarApplied = true;
    }
    state.streamingApplied = true;
    go('done');
  }

  // ====================================================================
  // STREAMING SETUP (Torbox + addons) — three guided sub-steps
  // ====================================================================
  function ensureAddonChoices() {
    if (!state.addonChoices) {
      state.addonChoices = SUGGESTED_ADDONS.map((a) => ({ name: a.name, url: a.url, note: a.note || '', checked: !!a.recommended }));
    }
    return state.addonChoices;
  }

  function renderStreaming(panel) {
    const sub = state.streamingSubStep || 'prompt';
    if (sub === 'torbox') return renderStreamingTorbox(panel);
    if (sub === 'addons') return renderStreamingAddons(panel);
    return renderStreamingPrompt(panel);
  }

  function renderStreamingPrompt(panel) {
    panel.innerHTML = `
      ${header('Set Up Streaming', '', true, 'streaming')}
      <div class="wiz-body wiz-streaming-prompt">
        <p class="wiz-prompt-heading">Do you want to set up Torbox Instant or streaming addons?</p>
        <p class="wiz-note">This is what makes content actually play. It's completely optional — you can always set it up later in Nuvio's settings.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-stream-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-stream-yes"><span>Yes, let's do it →</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', close);
    el('wiz-stream-skip').addEventListener('click', () => { state.streamingApplied = false; afterStreaming(); });
    el('wiz-stream-yes').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
  }

  function renderStreamingTorbox(panel) {
    const showTmdb = state.devices.includes('mobile');
    panel.innerHTML = `
      ${header('Torbox Instant', 'Connect Torbox and streams play instantly — no per-source keys needed.', true, 'streaming')}
      <div class="wiz-body">
        <label class="wiz-label">Torbox API key <span class="wiz-hint">(optional)</span>
          <input type="text" id="wiz-torbox-key" class="wiz-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${escapeAttr(state.torboxKey)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="wiz-key-status" id="wiz-key-status">${torboxStatusHtml(state.torboxKey)}</div>
        ${state.devices.includes('mobile') ? `<div class="wiz-note">📱 <strong>On mobile:</strong> Torbox connects differently — after setup open the Nuvio app → Settings → Connected Services → Torbox. You'll get a short code to enter at <strong>tor.box/link</strong>.</div>` : ''}
        <div class="wiz-torbox-promo">
          <div class="wiz-torbox-promo-copy">
            <span class="wiz-torbox-promo-title">Don't have Torbox yet?</span>
            <span class="wiz-torbox-promo-text">Sign up with my link for a discount. It helps keep this project running.</span>
          </div>
          <a href="https://torbox.app/subscription?referral=691a76aa-4d6e-40c0-8625-ffe4e4189ae4" target="_blank" rel="noopener" class="wiz-torbox-promo-btn"><span>Get Torbox</span><span class="wiz-torbox-promo-arrow">→</span></a>
          <a href="https://torbox.app/subscription" target="_blank" rel="noopener" class="wiz-torbox-promo-skip">or sign up without a referral code</a>
        </div>
        ${showTmdb ? `
        <label class="wiz-label">TMDB API key <span class="wiz-hint">(optional — needed for Nuvio Mobile)</span>
          <input type="text" id="wiz-tmdb-key" class="wiz-input" placeholder="Paste your TMDB API key..." value="${escapeAttr(state.tmdbKey)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="wiz-note">Without a TMDB key, posters and metadata won't load on Nuvio Mobile. TV works fine without it. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener" class="wiz-link">Get a free TMDB key →</a></div>
        ` : ''}
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-torbox-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-torbox-next"><span>Continue →</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'prompt'; render(); });
    const keyInput = el('wiz-torbox-key');
    if (keyInput) keyInput.addEventListener('input', () => {
      state.torboxKey = keyInput.value.trim();
      state.torboxShapeWarned = false;
      const status = el('wiz-key-status');
      if (status) status.innerHTML = torboxStatusHtml(state.torboxKey);
    });
    const tmdbInput = el('wiz-tmdb-key');
    if (tmdbInput) tmdbInput.addEventListener('input', () => { state.tmdbKey = tmdbInput.value.trim(); });
    el('wiz-torbox-back').addEventListener('click', () => { state.streamingSubStep = 'prompt'; render(); });
    el('wiz-torbox-next').addEventListener('click', () => {
      const keyEl = el('wiz-torbox-key');
      if (keyEl) state.torboxKey = keyEl.value.trim();
      const tmdbEl = el('wiz-tmdb-key');
      if (tmdbEl) state.tmdbKey = tmdbEl.value.trim();
      if (state.torboxKey && !isTorboxKeyShape(state.torboxKey) && !state.torboxShapeWarned) {
        state.torboxShapeWarned = true;
        showToast('That Torbox key looks like a typo — double-check it before finishing.', 'warning');
      }
      state.streamingSubStep = 'addons';
      state.streamingShowAddons = false;
      render();
    });
  }

  function renderStreamingAddons(panel) {
    const choices = ensureAddonChoices();
    if (!state.streamingShowAddons) {
      panel.innerHTML = `
        ${header('Scraper Addons', '', true, 'streaming')}
        <div class="wiz-body wiz-streaming-prompt">
          <p class="wiz-prompt-heading">Do you want to add scraper addons?</p>
          <p class="wiz-note">Scrapers find streams for your content. Torrentio is pre-selected and works great with Torbox — no extra key needed.</p>
          <div class="wiz-btn-row">
            <button class="wiz-secondary" id="wiz-addons-skip"><span>No, I'm done</span></button>
            <button class="wiz-primary" id="wiz-addons-yes"><span>Yes, show me</span></button>
          </div>
        </div>`;
      el('wiz-close').addEventListener('click', close);
      el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
      el('wiz-addons-skip').addEventListener('click', () => onAddonsApply(false));
      el('wiz-addons-yes').addEventListener('click', () => { state.streamingShowAddons = true; render(); });
      return;
    }
    // Full addon list view
    const rows = choices.map((a, i) => `
      <label class="wiz-addon-row">
        <input type="checkbox" class="wiz-addon-check" data-idx="${i}" ${a.checked ? 'checked' : ''}>
        <span class="wiz-addon-text">
          <span class="wiz-addon-name">${escapeHtml(a.name)}</span>
          ${a.note ? `<span class="wiz-addon-note">${escapeHtml(a.note)}</span>` : ''}
        </span>
        <button type="button" class="wiz-addon-remove" data-remove="${i}" title="Remove" aria-label="Remove addon">&times;</button>
      </label>`).join('');
    panel.innerHTML = `
      ${header('Scraper Addons', 'Pick which scrapers to wire in. You can always add more in Nuvio later.', true, 'streaming')}
      <div class="wiz-body">
        <div class="wiz-addon-list" id="wiz-addon-list">${rows || '<div class="wiz-note">No addons selected. Add one below.</div>'}</div>
        <div class="wiz-addon-add">
          <div class="wiz-note wiz-note-custom">Got your own addon? Paste its manifest URL here.</div>
          <input type="text" id="wiz-addon-name" class="wiz-input wiz-addon-add-name" placeholder="Addon Name">
          <input type="text" id="wiz-addon-url" class="wiz-input wiz-addon-add-url" placeholder="Manifest URL (https://...)">
          <button type="button" class="wiz-secondary wiz-addon-add-btn" id="wiz-addon-add-btn"><span>Add Addon</span></button>
        </div>
        <label class="wiz-label" style="margin-top:10px;">AIO Metadata manifest URL <span class="wiz-hint">(Trakt · optional)</span>
          <input type="text" id="wiz-aio-manifest-url" class="wiz-input" placeholder="Paste your AIO Metadata Install URL..." value="${escapeAttr(state.aioManifestUrl)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-addons-back-list"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-addons-finish"><span>Finish setup</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { syncAddonsInputs(); state.streamingShowAddons = false; render(); });
    panel.querySelectorAll('.wiz-addon-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        if (choices[idx]) choices[idx].checked = e.target.checked;
      });
    });
    panel.querySelectorAll('.wiz-addon-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove'));
        syncAddonsInputs();
        choices.splice(idx, 1);
        render();
      });
    });
    const addBtn = el('wiz-addon-add-btn');
    addBtn.addEventListener('click', async () => {
      const nm = el('wiz-addon-name');
      const ur = el('wiz-addon-url');
      const url = (ur && ur.value || '').trim();
      if (!url) return showInlineError("Enter the addon's manifest link to add it.");
      addBtn.disabled = true;
      const check = await checkManifestAlive(url);
      addBtn.disabled = false;
      if (check.ok === false) return showInlineError(check.reason);
      if (check.ok === null && state._lastAddonUrlWarned !== url) {
        state._lastAddonUrlWarned = url;
        return showInlineError(check.reason);
      }
      state._lastAddonUrlWarned = null;
      syncAddonsInputs();
      choices.push({ name: (nm && nm.value || '').trim() || url, url, note: '', checked: true, verified: true });
      render();
    });
    const aioInput = el('wiz-aio-manifest-url');
    if (aioInput) aioInput.addEventListener('input', () => { state.aioManifestUrl = aioInput.value.trim(); state._aioUrlVerified = false; });
    el('wiz-addons-back-list').addEventListener('click', () => { syncAddonsInputs(); state.streamingShowAddons = false; render(); });
    el('wiz-addons-finish').addEventListener('click', () => { syncAddonsInputs(); onAddonsApply(true); });
  }

  function syncAddonsInputs() {
    const aio = el('wiz-aio-manifest-url');
    if (aio) state.aioManifestUrl = aio.value.trim();
  }

  // Instant format feedback under the Torbox field.
  function torboxStatusHtml(key) {
    const k = String(key || '').trim();
    if (!k) return '';
    if (isTorboxKeyShape(k)) return `<span class="wiz-key-ok">${ICON.check} Looks like a valid Torbox key</span>`;
    return `<span class="wiz-key-bad">That doesn't look like a Torbox key. It should look like <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code></span>`;
  }

  // Push Torbox key + TMDB key + (optionally) addon list, then route onward.
  async function onAddonsApply(withAddons) {
    const choices = ensureAddonChoices();
    const aioUrl = state.aioManifestUrl;
    if (withAddons) {
      const picked = choices.filter((a) => a.checked && a.url);
      const unverified = picked.filter((a) => !a.verified);
      if (unverified.length) {
        if (!state._streamManifestWarnedUrls) state._streamManifestWarnedUrls = new Set();
        for (const addon of unverified) {
          const check = await checkManifestAlive(addon.url);
          if (check.ok === false) return showInlineError(`${addon.name || addon.url}: ${check.reason}`);
          if (check.ok === null && !state._streamManifestWarnedUrls.has(addon.url)) {
            state._streamManifestWarnedUrls.add(addon.url);
            return showInlineError(`${addon.name || addon.url}: ${check.reason}`);
          }
          addon.verified = true;
        }
      }
      if (aioUrl && !state._aioUrlVerified) {
        const check = await checkManifestAlive(aioUrl);
        if (check.ok === false) return showInlineError(`AIO Metadata: ${check.reason}`);
        if (check.ok === null && state._lastAioUrlWarned !== aioUrl) {
          state._lastAioUrlWarned = aioUrl;
          return showInlineError(`AIO Metadata: ${check.reason}`);
        }
        state._aioUrlVerified = true;
      }
      if (!state.torboxKey && picked.length && !state.streamWarned) {
        state.streamWarned = true;
        return showInlineError("Heads up: without a Torbox key these scrapers usually can't play anything. Tap \"Finish setup\" again to continue without it.");
      }
    }
    try {
      state.pushingLabel = withAddons ? 'Setting up your streaming & integrations...' : 'Setting up your streaming...';
      go('pushing');
      const pid = state.targetProfileId;
      state.torboxApplied = false;
      if (state.torboxKey) {
        await window.NuvioPush.setupTorbox(state.token, pid, state.torboxKey, ['tv']);
        state.torboxApplied = true;
      }
      if (state.tmdbKey) {
        await window.NuvioPush.applyProfileSettings(state.token, pid, SETTINGS_PLATFORMS, { tmdbKey: state.tmdbKey });
        state.tmdbApplied = true;
      }
      if (withAddons) {
        const picked = choices.filter((a) => a.checked && a.url);
        const toInstall = picked.map((a) => ({ name: a.name, url: a.url }));
        if (aioUrl) toInstall.push({ name: 'AIO Metadata', url: aioUrl });
        if (toInstall.length) {
          await window.NuvioPush.installAddons(state.token, pid, toInstall);
          state.addonsAdded = toInstall.map((a) => a.name);
          if (aioUrl) state.traktApplied = true;
        }
      }
      state.streamingApplied = true;
      afterStreaming();
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  function hasForYouFolder() {
    try {
      const compiled = window.KaptainExport.assembleFilteredDatabase();
      return compiled.some(function(cat) {
        return (cat.folders || []).some(function(f) { return f.id === 'folder-25429024'; });
      });
    } catch (e) { return false; }
  }

  function afterStreaming() {
    if (hasForYouFolder() && !state.aioManifestUrl) go('for-you');
    else go('done');
  }

  // ====================================================================
  // DEVICE SELECTION STEP
  // ====================================================================
  function renderDevices(panel) {
    const tvChecked = state.devices.includes('tv');
    const mobileChecked = state.devices.includes('mobile');
    const viewMode = (localStorage.getItem('kaptain_view_mode') || 'FOLLOW_LAYOUT').toUpperCase();
    const hasRowsIssue = viewMode === 'ROWS' || viewMode === 'FOLLOW_LAYOUT';

    panel.innerHTML = `
      ${header('Your Devices', 'What do you use Nuvio on? This helps us set things up right.', false)}
      <div class="wiz-body">
        <div class="wiz-label" style="margin-bottom:10px;">What devices do you use Nuvio on?</div>
        <div class="wiz-device-options">
          <label class="wiz-device-check-row${tvChecked ? ' checked' : ''}" id="wiz-device-tv-row">
            <input type="checkbox" id="wiz-device-tv" ${tvChecked ? 'checked' : ''}>
            <span class="wiz-device-label">📺  TV</span>
          </label>
          <label class="wiz-device-check-row${mobileChecked ? ' checked' : ''}" id="wiz-device-mobile-row">
            <input type="checkbox" id="wiz-device-mobile" ${mobileChecked ? 'checked' : ''}>
            <span class="wiz-device-label">📱  Mobile</span>
          </label>
        </div>
        <div class="wiz-rows-warning" id="wiz-rows-warning" style="display:${mobileChecked && hasRowsIssue ? '' : 'none'};">
          <strong>Heads up:</strong> Rows mode doesn't scroll well on Nuvio Mobile. We recommend switching your export to Tabbed Grid.
          <label class="wiz-rows-warning-check">
            <input type="checkbox" id="wiz-rows-auto-switch" ${state._devicesAutoSwitch !== false ? 'checked' : ''}>
            Auto-switch to Tabbed Grid (recommended)
          </label>
        </div>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <button class="wiz-primary" id="wiz-devices-next" style="margin-top:8px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);

    const tvCb = el('wiz-device-tv');
    const mobileCb = el('wiz-device-mobile');

    function syncDevicesUI() {
      const newDevices = [];
      if (tvCb && tvCb.checked) newDevices.push('tv');
      if (mobileCb && mobileCb.checked) newDevices.push('mobile');
      state.devices = newDevices;
      const tvRow = el('wiz-device-tv-row');
      const mobileRow = el('wiz-device-mobile-row');
      if (tvRow) tvRow.classList.toggle('checked', state.devices.includes('tv'));
      if (mobileRow) mobileRow.classList.toggle('checked', state.devices.includes('mobile'));
      const warning = el('wiz-rows-warning');
      if (warning) warning.style.display = (state.devices.includes('mobile') && hasRowsIssue) ? '' : 'none';
      // Clear validation error as soon as the user makes a selection
      if (newDevices.length > 0) { const box = el('wiz-error'); if (box) box.style.display = 'none'; }
    }

    if (tvCb) tvCb.addEventListener('change', syncDevicesUI);
    if (mobileCb) mobileCb.addEventListener('change', syncDevicesUI);

    el('wiz-devices-next').addEventListener('click', () => {
      if (state.devices.length === 0) return showInlineError('Pick at least one device to continue.');
      const autoSwitch = el('wiz-rows-auto-switch');
      state._devicesAutoSwitch = autoSwitch ? autoSwitch.checked : true;
      if (state._devicesAutoSwitch && state.devices.includes('mobile') && hasRowsIssue) {
        if (window.KaptainExport && window.KaptainExport.setLastExportOptimize) {
          window.KaptainExport.setLastExportOptimize(true);
        }
      }
      go('account');
    });
  }

  // ====================================================================
  // FOR YOU STEP (AIO Metadata / Trakt setup when that folder is selected)
  // ====================================================================
  function renderForYou(panel) {
    panel.innerHTML = `
      ${header('Set Up "For You"', '', true)}
      <div class="wiz-body">
        <p class="wiz-note">Your <strong style="color:var(--text-primary)">"For You"</strong> folder is powered by Trakt — it shows your personal recommendations, watchlist, and what's coming up next.</p>
        <p class="wiz-note">To make it work, connect your Trakt account through AIO Metadata, then paste the Install URL it gives you back here.</p>
        <button type="button" class="wiz-secondary" id="wiz-foryou-aio" style="margin-bottom:18px;"><span>Connect Trakt via AIO Metadata →</span></button>
        <label class="wiz-label">AIO Metadata Install URL
          <input type="text" id="wiz-aio-manifest-url" class="wiz-input" placeholder="Paste your AIO Metadata Install URL here..." value="${escapeAttr(state.aioManifestUrl)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-foryou-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-foryou-save"><span>Save &amp; Finish</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('done'));

    const urlInput = el('wiz-aio-manifest-url');
    if (urlInput) urlInput.addEventListener('input', () => {
      state.aioManifestUrl = urlInput.value.trim();
      state._aioUrlVerified = false;
    });

    el('wiz-foryou-aio').addEventListener('click', () => {
      const inp = el('wiz-aio-manifest-url');
      if (inp) state.aioManifestUrl = inp.value.trim();
      aioOpen();
    });

    el('wiz-foryou-skip').addEventListener('click', () => go('done'));

    el('wiz-foryou-save').addEventListener('click', async () => {
      const inp = el('wiz-aio-manifest-url');
      if (inp) state.aioManifestUrl = inp.value.trim();
      if (!state.aioManifestUrl) return showInlineError('Paste your AIO Metadata Install URL, or tap "Skip for now".');
      if (!state._aioUrlVerified) {
        const check = await checkManifestAlive(state.aioManifestUrl);
        if (check.ok === false) return showInlineError(`That URL doesn't look right: ${check.reason}`);
        if (check.ok === null && state._lastAioUrlWarned !== state.aioManifestUrl) {
          state._lastAioUrlWarned = state.aioManifestUrl;
          return showInlineError('Couldn\'t verify that URL — it may still work. Tap "Save & Finish" again to use it anyway.');
        }
        state._aioUrlVerified = true;
      }
      try {
        state.pushingLabel = 'Connecting Trakt...';
        go('pushing');
        await window.NuvioPush.installAddons(state.token, state.targetProfileId, [{ name: 'AIO Metadata', url: state.aioManifestUrl }]);
        state.traktApplied = true;
        go('done');
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
    });
  }

  // ====================================================================
  // AIO METADATA TUTORIAL (floating pointers over a cross-origin iframe)
  // I can't reach into aiometadata.elfhosted.com's DOM, so I just guide the
  // visitor with plain instructions and let them paste the result back into
  // my own manifest URL field above.
  // ====================================================================
  function aioOpen() {
    const overlay = el('aio-overlay');
    if (!overlay) return;
    // Load the iframe only on first open, and never again, so a visitor who
    // closes and reopens the modal doesn't lose their Trakt login session.
    const iframe = el('aio-iframe');
    if (iframe && !iframe.src) iframe.src = 'https://aiometadata.elfhosted.com/configure';
    aioTutorialIndex = 0;
    overlay.classList.add('open');
    renderAioTutorial();
  }

  function aioClose() {
    const overlay = el('aio-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function renderAioTutorial() {
    const wrap = el('aio-tutorial');
    if (!wrap) return;
    const step = AIO_TUTORIAL_STEPS[aioTutorialIndex];
    wrap.className = `aio-tutorial state-${step.state}`;

    const actionsHtml = step.actions.map((a) => {
      if (a === 'next') return `<button class="wiz-primary" id="aio-tut-next" type="button"><span>Next Step</span></button>`;
      if (a === 'copy') return `<button class="wiz-secondary" id="aio-tut-copy" type="button"><span>Copy Preset to Clipboard</span></button>`;
      if (a === 'copy-primary') return `<button class="wiz-primary" id="aio-tut-copy" type="button"><span>Copy Preset to Clipboard</span></button>`;
      if (a === 'done') return `<button class="wiz-primary" id="aio-tut-done" type="button"><span>Done</span></button>`;
      return '';
    }).join('');

    const refHtml = step.refImage ? `
        <div class="aio-tooltip-ref" id="aio-tut-ref" title="Click to enlarge">
          <img src="${escapeAttr(step.refImage.src)}" alt="" style="object-position: ${escapeAttr(step.refImage.pos)};">
          <span class="aio-tooltip-ref-hint">Click to enlarge</span>
        </div>` : '';

    wrap.innerHTML = `
      <div class="aio-pointer"></div>
      <div class="aio-region"></div>
      <div class="aio-tooltip">
        <div class="aio-tooltip-handle" title="Drag to move"><span class="aio-tooltip-handle-grip"></span></div>
        <div class="aio-tooltip-step">${escapeHtml(step.label)}</div>
        <h4 class="aio-tooltip-title">${escapeHtml(step.title)}</h4>
        <p class="aio-tooltip-body">${escapeHtml(step.body)}</p>${refHtml}
        <div class="aio-tooltip-actions">${actionsHtml}</div>
      </div>`;

    const next = el('aio-tut-next');
    if (next) next.addEventListener('click', () => {
      aioTutorialIndex = Math.min(aioTutorialIndex + 1, AIO_TUTORIAL_STEPS.length - 1);
      renderAioTutorial();
    });
    const copy = el('aio-tut-copy');
    if (copy) copy.addEventListener('click', () => aioCopyPreset(copy));
    const done = el('aio-tut-done');
    if (done) done.addEventListener('click', () => {
      aioClose();
      const input = el('wiz-aio-manifest-url');
      if (input) input.focus();
    });
    const ref = el('aio-tut-ref');
    if (ref && step.refImage) ref.addEventListener('click', () => aioOpenLightbox(step.refImage.src));

    const tooltip = wrap.querySelector('.aio-tooltip');
    const frameWrap = el('aio-frame-wrap');
    if (tooltip && frameWrap) makeAioTooltipDraggable(tooltip, frameWrap);
  }

  function aioOpenLightbox(src) {
    const lightbox = el('aio-lightbox');
    const img = el('aio-lightbox-img');
    if (!lightbox || !img) return;
    img.src = src;
    lightbox.classList.add('open');
  }

  function aioCloseLightbox() {
    const lightbox = el('aio-lightbox');
    if (lightbox) lightbox.classList.remove('open');
  }

  // My best-guess pointer/tooltip position for each step is just that, a
  // guess, since I can't read the real iframe's layout or scroll position
  // from outside. Letting the visitor drag the card off whatever it's
  // covering is the actual fix when a guess is wrong for their screen.
  function makeAioTooltipDraggable(tooltip, frameWrap) {
    const handle = tooltip.querySelector('.aio-tooltip-handle');
    if (!handle) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      const tipRect = tooltip.getBoundingClientRect();
      const wrapRect = frameWrap.getBoundingClientRect();
      startLeft = tipRect.left - wrapRect.left;
      startTop = tipRect.top - wrapRect.top;
      startX = e.clientX;
      startY = e.clientY;
      // Switch off the CSS-class-based position so explicit left/top can drive it.
      tooltip.style.left = `${startLeft}px`;
      tooltip.style.top = `${startTop}px`;
      tooltip.style.right = 'auto';
      tooltip.style.bottom = 'auto';
      tooltip.style.transform = 'none';
      tooltip.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const wrapRect = frameWrap.getBoundingClientRect();
      let left = startLeft + (e.clientX - startX);
      let top = startTop + (e.clientY - startY);
      left = Math.max(0, Math.min(left, wrapRect.width - tooltip.offsetWidth));
      top = Math.max(0, Math.min(top, wrapRect.height - tooltip.offsetHeight));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });

    const stopDrag = () => {
      dragging = false;
      tooltip.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  // Falls back to the old execCommand approach via a hidden textarea. The
  // Clipboard API isn't just "missing or present": some browsers/contexts
  // (older Safari, restricted iframes, permission-denied embeds) expose
  // navigator.clipboard but still throw when called, so I try it first and
  // fall back on ANY failure, not only when the API is absent.
  function aioCopyPresetFallback() {
    const ta = document.createElement('textarea');
    ta.value = AIO_PRESET_JSON;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand copy failed');
  }

  async function aioCopyPreset(btn) {
    const span = btn.querySelector('span');
    const original = span ? span.textContent : '';
    try {
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(AIO_PRESET_JSON);
      } catch (clipErr) {
        aioCopyPresetFallback();
      }
      if (span) {
        span.textContent = 'Copied!';
        setTimeout(() => { span.textContent = original; }, 1600);
      }
    } catch (e) {
      if (span) {
        span.textContent = "Couldn't copy, try again";
        setTimeout(() => { span.textContent = original; }, 2000);
      }
    }
  }

  // ----- small helpers -----
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // Wire up the launcher button + overlay close, once the DOM is ready.
  document.addEventListener('DOMContentLoaded', () => {
    const launch = el('btn-send-to-nuvio');
    if (launch) launch.addEventListener('click', () => open());

    const overlay = el('wizard-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    const aioOverlay = el('aio-overlay');
    if (aioOverlay) {
      const aioCloseBtn = el('aio-close');
      if (aioCloseBtn) aioCloseBtn.addEventListener('click', aioClose);
      aioOverlay.addEventListener('click', (e) => { if (e.target === aioOverlay) aioClose(); });
    }

    const aioLightbox = el('aio-lightbox');
    if (aioLightbox) {
      const lightboxCloseBtn = el('aio-lightbox-close');
      if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', aioCloseLightbox);
      aioLightbox.addEventListener('click', (e) => { if (e.target === aioLightbox) aioCloseLightbox(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Each layer closes just itself first, narrowest on top: the reference
      // lightbox can open on top of the AIO modal, which can open on top of
      // the wizard. Closing all three at once on one Escape would surprise.
      if (aioLightbox && aioLightbox.classList.contains('open')) { aioCloseLightbox(); return; }
      if (aioOverlay && aioOverlay.classList.contains('open')) { aioClose(); return; }
      if (overlay && overlay.classList.contains('open')) close();
    });
  });

  // Expose shared bits so the Quick editor can reuse them instead of duplicating.
  window.NuvioWizard = {
    open,
    close,
    SUGGESTED_ADDONS,
    isTorboxKeyShape,
    torboxStatusHtml,
    checkManifestAlive,
  };
})();
