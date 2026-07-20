/**
 * Kaptain's Mega Collection — Custom Collection Builder
 * Client-side application logic
 */

// Application State
let database = [];
let selectedMap = {};  // { folderKey: { sourceTitle: boolean } }
let currentCategoryIdx = 0;
let isGuideActive = false;
let isPreviewActive = false;
let currentSearch = '';
let gridSize = 210;
let activeDrawerFolder = null;

// Bump this alongside the style.css?v=NN / app.js?v=NN cache-busters in index.html
const KAPTAIN_VERSION = 'v23';
const KAPTAIN_UPDATED = 'Jul 2026';

// Newest entry first. Bump KAPTAIN_VERSION above whenever a new entry is added here —
// the title-screen "what's new" banner compares a visitor's last-seen version against this list.
const CHANGELOG = [
  {
    version: 'v23',
    items: [
      'AIO Streams setup is now a guided step-by-step flow, matching Native Mode',
      'Sending to an existing profile now lets you fully reorder every row, not just top/bottom',
      'Fixed old rows silently sticking around after you deselected them and re-sent',
      'Added bulk genre selection (e.g. select "Horror" everywhere at once) in the Quick Editor',
      'Fixed the Quick Editor "‹ Menu" button wiping your selections',
      'Fixed broken artwork for French, Indian, and Korean Cinema',
      'Added a no-signin "Export for Bingecat" option',
      'Dozens of smaller fixes and polish across the setup wizard',
    ],
  },
];

// Human-readable labels for TMDB sort_by API strings shown in source drawer badges
const SORT_LABEL_MAP = {
  'primary_release_date.desc': 'By Release Date ↓',
  'primary_release_date.asc': 'By Release Date ↑',
  'vote_average.desc': 'By Rating ↓',
  'vote_average.asc': 'By Rating ↑',
  'popularity.desc': 'By Popularity ↓',
  'popularity.asc': 'By Popularity ↑',
  'revenue.desc': 'By Revenue ↓',
  'revenue.asc': 'By Revenue ↑',
  'first_air_date.desc': 'By Air Date ↓',
  'first_air_date.asc': 'By Air Date ↑',
  'vote_count.desc': 'By Vote Count ↓',
  'vote_count.asc': 'By Vote Count ↑',
};
function sortLabel(raw) {
  if (!raw) return '';
  return SORT_LABEL_MAP[raw.toLowerCase()] ?? raw;
}

// Nuvio TV/Mobile emulator (Preview) state
let previewDevice = (() => { try { return localStorage.getItem('kaptain_preview_device') || 'tv'; } catch (e) { return 'tv'; } })();
// Whether the mobile-only "more options" panel (device toggle / reorder /
// editor view / layout / help) is expanded above the slim phone bottom bar.
let previewMoreOpen = false;
// Whether the mobile-only preview bar itself (Download / Send to Nuvio / ⋯,
// plus whatever the ⋯ reveals) is expanded out of its collapsed FAB.
let previewBarOpen = false;
let featuredKey = null;            // folderKey shown in the preview hero
let previewRows = [];              // array of arrays of focusable elements (focus engine)
let previewPos = { r: 0, c: 0 };   // current focus position
let activeCatIdx = 0;              // sidebar jump-nav highlight
const categorySort = {};           // { catIdx: 'custom'|'az'|'za'|'selected' } — per-row sort preset
let drawerSearch = '';             // filter text for the open drawer's source list

const CARD_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const CARD_MINUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

// Ordering State
let reorderMode = false;   // when true, up/down arrows appear at every level


// Keeps the persistent top-bar reorder indicator in sync with reorderMode,
// regardless of which toggle (Browse or Preview) flipped it, and across
// category switches / view re-renders.
function updateReorderBanner() {
  const banner = document.getElementById('reorder-banner');
  if (banner) banner.hidden = !reorderMode;
}

// View Mode State (per-browser; never shared with other visitors)
let selectedViewMode = localStorage.getItem('kaptain_view_mode') || 'FOLLOW_LAYOUT';
let lastExportOptimize = false;  // decided per-export by the mobile-compat gate

// Hover-GIF preference (per-browser). Affects the real exported/pushed
// collection, not just the local preview — Nuvio itself renders focusGifUrl.
let gifDisableStreaming = (() => { try { return localStorage.getItem('kaptain_gif_disable_streaming') === '1'; } catch (e) { return false; } })();
let gifDisableOther = (() => { try { return localStorage.getItem('kaptain_gif_disable_other') === '1'; } catch (e) { return false; } })();
function gifsAllowedForCategory(category) {
  const isStreaming = category && category.title === 'Streaming Services';
  return isStreaming ? !gifDisableStreaming : !gifDisableOther;
}

// Walkthrough State
let walkthroughActive = false;
let walkthroughStep = 0;
let preWalkthroughState = null;

// Sidebar overlay helpers (module-scope so walkthrough can open it)
function openSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('open');
  document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
  document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', 'false');
}

const WALKTHROUGH_STEPS = [
  {
    title: "Here's the Lay of the Land",
    body: "What you're looking at is your actual Nuvio home screen. Pick your folders and it updates live: this is the real thing.",
    target: null,
    position: 'center',
    nextLabel: 'Show Me Around'
  },
  {
    title: 'Jump to a Section',
    body: 'Each section in the list maps to a row on your home screen. Click one to jump to it. The toggle on the right grabs the whole section at once.',
    target: '#category-scroller',
    position: 'right',
    nextLabel: 'Next'
  },
  {
    title: 'Add & Remove Folders',
    body: "Every folder shows up as a card. Green border means it's in your collection. Click the + to add one, − to remove it, or open the gear for finer control.",
    target: '.nv-card',
    position: 'right',
    nextLabel: 'Next'
  },
  {
    title: 'Pick Exact Sources',
    body: "Click the gear on any card to open its source drawer, then toggle individual Trakt & TMDB lists on or off within that folder instead of all-or-nothing.",
    target: null,
    position: 'center',
    nextLabel: 'Next'
  },
  {
    title: 'TV or Phone',
    body: "Flip between how your collection will look on a TV and on a phone. Use your arrow keys to move around just like a real remote, and the focused card becomes the hero up top.",
    target: '.nv-device-toggle',
    position: 'bottom',
    nextLabel: 'Next'
  },
  {
    title: 'Layout, Sort & Reorder',
    body: "Switch how everything lays out inside Nuvio (Rows, Tabbed Grid, or Auto), and turn on Reorder to drag sections and folders into your own order. On a phone, tap the ⋯ button to find these.",
    target: '.nv-preview-secondary',
    position: 'bottom',
    nextLabel: 'Next'
  },
  {
    title: 'Send Straight to Nuvio',
    body: "When you're happy, Send to Nuvio signs you in (or creates an account) and loads your collection instantly, synced to all your devices. Prefer to keep it to yourself? Download the file and import it manually.",
    target: '#preview-send',
    position: 'bottom',
    nextLabel: 'Got It'
  }
];

// ==========================================================================
// 1. BOOTSTRAP
// ==========================================================================

// Public, no-auth hit counter (countapi.xyz died in 2024 — this is Miles
// Hilliard's drop-in fork, same no-signup/no-key model, different URL shape:
// one flat key instead of namespace+key, so the namespace is baked into the
// key name). Fire-and-forget, never blocks or throws into the UI. No PII,
// just an integer increment.
const TELEMETRY_DOM_IDS = {
  visits: ['visitor-count'],
  deployments: ['collections-generated-count'],
};

window.KaptainTelemetry = {
  async hit(key) {
    try {
      const res = await fetch(`https://countapi.mileshilliard.com/api/v1/hit/kaptain-collection_${key}`);
      const data = await res.json();
      this._render(key, data.value);
      return data.value;
    } catch (e) { return null; }
  },
  async get(key) {
    try {
      const res = await fetch(`https://countapi.mileshilliard.com/api/v1/get/kaptain-collection_${key}`);
      const data = await res.json();
      this._render(key, data.value);
      return data.value;
    } catch (e) { return null; }
  },
  _render(key, value) {
    if (typeof value !== 'number') return;
    // Still update hidden spans for any code that reads them
    const ids = TELEMETRY_DOM_IDS[key] || [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value.toLocaleString();
    });
    // Rebuild the sentence display
    this._renderSentence();
  },
  _renderSentence() {
    const sentenceEl = document.getElementById('telemetry-sentence');
    if (!sentenceEl) return;
    const visitEl = document.getElementById('visitor-count');
    const collEl = document.getElementById('collections-generated-count');
    const visits = visitEl && visitEl.textContent && visitEl.textContent !== '—' ? visitEl.textContent : null;
    const colls = collEl && collEl.textContent && collEl.textContent !== '—' ? collEl.textContent : null;
    if (!visits && !colls) {
      sentenceEl.innerHTML = 'Loading stats…';
    } else if (visits && colls) {
      sentenceEl.innerHTML = `<strong>${visits}</strong> people visited · <strong>${colls}</strong> collections built`;
    } else if (visits) {
      sentenceEl.innerHTML = `<strong>${visits}</strong> people have visited`;
    } else {
      sentenceEl.innerHTML = `<strong>${colls}</strong> collections built`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  initializeDatabase();
  bindGlobalEvents();
  window.KaptainTelemetry.hit('visits');
  window.KaptainTelemetry.get('deployments');
});

function initializeDatabase() {
  if (window.NUVIO_DATABASE && Array.isArray(window.NUVIO_DATABASE)) {
    database = window.NUVIO_DATABASE;
  } else {
    database = [];
  }

  // Initialize: everything selected by default (Full Mega Bundle)
  initializeSelections();

  // Render UI — the preview emulator is the main (and only) view now.
  renderSidebar();
  isPreviewActive = true;
  isGuideActive = false;
  switchCategory(-2);
  updateControlCenterStats();

  // Title screen is the first thing every visitor sees; it offers the
  // walkthrough or a straight path in, so nothing auto-starts the tour anymore.
  showTitleScreen();
}

function initializeSelections() {
  selectedMap = {};
  database.forEach(category => {
    if (!category.folders) return;
    category.folders.forEach(folder => {
      const folderKey = getFolderKey(folder);
      selectedMap[folderKey] = {};
      if (folder.sources) {
        folder.sources.forEach(source => {
          selectedMap[folderKey][getSourceKey(source)] = true;
        });
      }
    });
  });
}

function getFolderKey(folder) {
  return folder.id || folder.title;
}

function getSourceKey(source) {
  return source.title || source.catalogId || "Default Source";
}

// ==========================================================================
// 1b. ORDERING HELPERS (sort + manual reorder)
// ==========================================================================

// Move the item at `fromIdx` one slot in `dir` (-1 up, +1 down). Returns the
// item's new index (unchanged if it was already at the boundary).
function moveItem(arr, fromIdx, dir) {
  const toIdx = fromIdx + dir;
  if (!Array.isArray(arr) || toIdx < 0 || toIdx >= arr.length) return fromIdx;
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, item);
  return toIdx;
}

// Stable A–Z ('az') / Z–A ('za') sort on `.title`. Mutates in place.
function sortByTitle(arr, dir) {
  if (!Array.isArray(arr)) return;
  const factor = dir === 'za' ? -1 : 1;
  arr.sort((a, b) =>
    factor * String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
  );
}

// Small up/down arrow control. `disableUp`/`disableDown` grey out the ends.
function reorderArrowsHtml(disableUp, disableDown) {
  return `
    <div class="reorder-arrows">
      <button class="reorder-arrow" data-dir="-1" ${disableUp ? 'disabled' : ''} title="Move up" aria-label="Move up">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
      </button>
      <button class="reorder-arrow" data-dir="1" ${disableDown ? 'disabled' : ''} title="Move down" aria-label="Move down">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
    </div>`;
}

// ==========================================================================
// 2. SIDEBAR
// ==========================================================================

function renderSidebar() {
  const scroller = document.getElementById('category-scroller');
  if (!scroller) return;

  scroller.innerHTML = '';

  // Collection-level sort toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'sidebar-sort-toolbar';
  toolbar.innerHTML = `
    <span class="sidebar-sort-label">Sections</span>
    <select id="collection-sort" class="topbar-select sidebar-sort-select" title="Sort sections">
      <option value="custom">Custom order</option>
      <option value="az">A–Z</option>
      <option value="za">Z–A</option>
    </select>
  `;
  scroller.appendChild(toolbar);
  const collSortSelect = toolbar.querySelector('#collection-sort');
  collSortSelect.addEventListener('change', () => {
    if (collSortSelect.value === 'az' || collSortSelect.value === 'za') {
      const activeCat = database[currentCategoryIdx];
      sortByTitle(database, collSortSelect.value);
      // Keep the same section highlighted after a sort
      if (activeCat) {
        const newIdx = database.indexOf(activeCat);
        if (newIdx >= 0) currentCategoryIdx = newIdx;
      }
      renderSidebar();
      if (isPreviewActive) renderPreviewCollection();   // reorder the rows too
    }
  });

  database.forEach((category, idx) => {
    const stats = getCategorySelectionStats(idx);
    const catNavItem = document.createElement('button');
    catNavItem.className = `cat-nav-item ${(!isGuideActive && idx === activeCatIdx) ? 'active' : ''}`;
    catNavItem.title = category.title;

    const emoji = getCategoryEmoji(category.title);

    // Determine toggle state
    let toggleClass = '';
    let toggleIcon = '';
    if (stats.selectedFolders === stats.totalFolders && stats.totalFolders > 0) {
      toggleClass = 'checked';
      toggleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (stats.selectedFolders > 0) {
      toggleClass = 'partial';
      toggleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="6" y1="12" x2="18" y2="12"></line></svg>`;
    }

    // Progress ring: fills proportionally to how much of the section is selected.
    const ringC = 56.5;   // 2πr for r=9
    const ringPct = stats.totalFolders ? stats.selectedFolders / stats.totalFolders : 0;
    const ringOffset = ringC * (1 - ringPct);
    const ringHtml = `
      <svg class="cat-ring ${ringPct >= 1 ? 'full' : ''}" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="cat-ring-track" cx="12" cy="12" r="9"></circle>
        <circle class="cat-ring-fill" cx="12" cy="12" r="9" style="stroke-dasharray:${ringC};stroke-dashoffset:${ringOffset};"></circle>
      </svg>`;

    const rightGroup = reorderMode
      ? `<div class="cat-right-group">${reorderArrowsHtml(idx === 0, idx === database.length - 1)}</div>`
      : `<div class="cat-right-group">
           <span class="cat-badge" title="${stats.selectedFolders} of ${stats.totalFolders} folders selected">${ringHtml}${stats.selectedFolders}/${stats.totalFolders}</span>
           <div class="cat-toggle ${toggleClass}" data-cat-idx="${idx}" title="Toggle all folders in this section">
             ${toggleIcon}
           </div>
         </div>`;

    catNavItem.innerHTML = `
      <div class="cat-info-combo">
        <span class="cat-emoji">${emoji}</span>
        <span class="cat-name">${category.title}</span>
      </div>
      ${rightGroup}
    `;

    // Click category name → jump to that row in the preview
    catNavItem.addEventListener('click', (e) => {
      // Don't navigate if they clicked the toggle or a reorder arrow
      if (e.target.closest('.cat-toggle') || e.target.closest('.reorder-arrows')) return;
      jumpToCategory(idx);
    });

    if (reorderMode) {
      catNavItem.querySelectorAll('.reorder-arrow').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const dir = parseInt(btn.getAttribute('data-dir'), 10);
          const newIdx = moveItem(database, idx, dir);
          activeCatIdx = newIdx;             // keep the moved section highlighted
          renderSidebar();
          if (isPreviewActive) renderPreviewCollection();   // move the row to match
        });
      });
    } else {
      // Click toggle → bulk select/deselect
      const toggleEl = catNavItem.querySelector('.cat-toggle');
      toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const allSelected = stats.selectedFolders === stats.totalFolders;
        toggleCategorySelection(idx, !allSelected);
      });
    }

    scroller.appendChild(catNavItem);
  });

}

function getCategorySelectionStats(categoryIdx) {
  const category = database[categoryIdx];
  if (!category || !category.folders) return { totalFolders: 0, selectedFolders: 0, totalSources: 0, selectedSources: 0 };

  let totalFolders = category.folders.length;
  let selectedFolders = 0;
  let totalSources = 0;
  let selectedSources = 0;

  category.folders.forEach(folder => {
    const folderKey = getFolderKey(folder);
    const sources = folder.sources || [];
    totalSources += sources.length;

    let folderHasActive = false;
    sources.forEach(source => {
      const sourceKey = getSourceKey(source);
      if (selectedMap[folderKey] && selectedMap[folderKey][sourceKey]) {
        selectedSources++;
        folderHasActive = true;
      }
    });

    if (folderHasActive) selectedFolders++;
  });

  return { totalFolders, selectedFolders, totalSources, selectedSources };
}

function toggleCategorySelection(categoryIdx, selectAll) {
  const category = database[categoryIdx];
  if (!category || !category.folders) return;

  category.folders.forEach(folder => {
    const folderKey = getFolderKey(folder);
    if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
    if (folder.sources) {
      folder.sources.forEach(source => {
        selectedMap[folderKey][getSourceKey(source)] = selectAll;
      });
    }
  });

  renderSidebar();
  if (isPreviewActive) {
    // Refresh just this category's cards in place so the scroll position holds.
    const row = document.getElementById('nv-cat-' + categoryIdx);
    if (row) row.querySelectorAll('.nv-card').forEach(c => { if (c.__folder) refreshCardState(c, c.__folder); });
  } else if (!isGuideActive && currentCategoryIdx === categoryIdx) {
    renderFolderGrid();
  }
  updateControlCenterStats();
}

// ---- Bulk genre selection across the whole collection ----
// Two different shapes carry genre in this data, and a genre toggle needs to
// hit both:
//   1. The "Genres" category has one whole FOLDER per genre ("Horror") — no
//      per-source split, the folder itself is the unit. This category is
//      also the canonical genre list — used below to tell a real genre like
//      "Horror Movies" apart from a same-shaped but non-genre source like
//      "New Movies" or "Top Rated Series".
//   2. "Streaming Services" (Netflix, Apple TV+, etc.) folders contain
//      per-genre SOURCES inside them ("Horror Movies", "Horror Series") —
//      toggling a genre there must only touch those sources, not the whole
//      service folder (which covers many genres at once).
const GENRE_SOURCE_RE = /^(.+?) (Movies|Series)$/;

function getCanonicalGenreNames() {
  const genresCategory = database.find(c => c.title === 'Genres');
  return new Set((genresCategory && genresCategory.folders || []).map(f => f.title));
}

function getAllGenres() {
  const canonical = getCanonicalGenreNames();
  const genres = new Set(canonical);
  database.forEach(category => {
    (category.folders || []).forEach(folder => {
      (folder.sources || []).forEach(source => {
        const m = GENRE_SOURCE_RE.exec(source.title || '');
        if (m && canonical.has(m[1])) genres.add(m[1]);
      });
    });
  });
  return Array.from(genres).sort((a, b) => a.localeCompare(b));
}

// Returns { wholeFolders, sourcesByFolder } — wholeFolders are toggled
// entirely; sourcesByFolder maps folder -> just the matching sources within it.
function getGenreTargets(genre) {
  const wholeFolders = [];
  const sourcesByFolder = [];
  database.forEach(category => {
    (category.folders || []).forEach(folder => {
      if (category.title === 'Genres' && folder.title === genre) {
        wholeFolders.push(folder);
        return;
      }
      const matches = (folder.sources || []).filter(source => {
        const m = GENRE_SOURCE_RE.exec(source.title || '');
        return m && m[1] === genre;
      });
      if (matches.length) sourcesByFolder.push({ folder, sources: matches });
    });
  });
  return { wholeFolders, sourcesByFolder };
}

// true = everything matching is fully selected, false = fully off,
// null = mixed — lets the UI show an indeterminate checkbox state.
function getGenreSelectionState(genre) {
  const { wholeFolders, sourcesByFolder } = getGenreTargets(genre);
  let anyOn = false, anyOff = false;
  wholeFolders.forEach(folder => {
    const stats = getFolderSourceCountStats(folder);
    if (stats.active > 0) anyOn = true;
    if (stats.active < stats.total) anyOff = true;
  });
  sourcesByFolder.forEach(({ folder, sources }) => {
    const folderKey = getFolderKey(folder);
    sources.forEach(source => {
      const on = !!(selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(source)]);
      if (on) anyOn = true; else anyOff = true;
    });
  });
  if (anyOn && anyOff) return null;
  return anyOn;
}

function applyGenreToggle(genre, on) {
  const { wholeFolders, sourcesByFolder } = getGenreTargets(genre);
  wholeFolders.forEach(folder => {
    const folderKey = getFolderKey(folder);
    if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
    (folder.sources || []).forEach(source => {
      selectedMap[folderKey][getSourceKey(source)] = on;
    });
  });
  sourcesByFolder.forEach(({ folder, sources }) => {
    const folderKey = getFolderKey(folder);
    if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
    sources.forEach(source => { selectedMap[folderKey][getSourceKey(source)] = on; });
  });
  renderSidebar();
  if (isPreviewActive) renderPreviewCollection();
  else if (!isGuideActive) renderFolderGrid();
  updateControlCenterStats();
}

function getCategoryEmoji(title) {
  const t = title.toLowerCase();
  if (t.includes('trending') || t.includes('new')) return '⚡';
  if (t.includes('streaming') || t.includes('services')) return '🎬';
  if (t.includes('networks')) return '📺';
  if (t.includes('genres')) return '🎭';
  if (t.includes('film') || t.includes('collection')) return '📦';
  if (t.includes('actor')) return '🌟';
  if (t.includes('director')) return '🎥';
  if (t.includes('studio')) return '🏰';
  if (t.includes('decade') || t.includes('year')) return '📅';
  if (t.includes('anime')) return '🔥';
  if (t.includes('award')) return '🏆';
  return '📁';
}

// ==========================================================================
// 3. CATEGORY SWITCH & TOP BAR
// ==========================================================================

function switchCategory(idx) {
  currentCategoryIdx = idx;
  currentSearch = '';
  updateReorderBanner();
  // Any view switch tears down the old preview; renderPreviewCollection restarts
  // the carousel when we land back in preview mode.
  stopHeroCarousel();

  const searchField = document.getElementById('dashboard-search');
  if (searchField) searchField.value = '';

  renderSidebar();

  const titleEl = document.getElementById('view-title');
  const subtitleEl = document.getElementById('view-subtitle');
  const topBar = document.querySelector('.top-bar');
  const controlCenter = document.getElementById('control-center-bar');
  const actionsGroup = document.getElementById('category-actions-group');
  // Browse-only top-bar controls (search/view-mode/sort/reorder/zoom) are shown
  // or hidden by a CSS class on the top bar — never inline display — so that
  // responsive media queries can still collapse non-essential controls.
  const setMode = (mode) => {
    if (!topBar) return;
    topBar.classList.toggle('mode-browse', mode === 'browse');
    topBar.classList.toggle('mode-preview', mode === 'preview');
    topBar.classList.toggle('mode-guide', mode === 'guide');
  };

  if (isPreviewActive) {
    titleEl.textContent = '';
    subtitleEl.textContent = '';
    setMode('preview');
    // The preview has its own slim Download / Send bar, so hide the editor's
    // bottom control-center to avoid a duplicate action bar.
    if (controlCenter) {
      controlCenter.style.opacity = '0';
      controlCenter.style.pointerEvents = 'none';
      const panel = controlCenter.querySelector('.control-center-panel');
      if (panel) panel.style.pointerEvents = 'none';
    }
    if (actionsGroup) actionsGroup.innerHTML = '';
    renderPreviewCollection();
  } else {
    isPreviewActive = false;
    const category = database[currentCategoryIdx];
    if (category) {
      const stats = getCategorySelectionStats(currentCategoryIdx);
      titleEl.textContent = category.title;
      subtitleEl.textContent = reorderMode
        ? 'Reorder mode: use the ▲ ▼ arrows to move sections, folders & sources. Click Reorder again to finish.'
        : `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;

      if (category.folders && category.folders.length > 0) {
        setCinematicWallpaper(category.folders[0]);
      }
    }

    setMode('browse');
    if (controlCenter) {
      controlCenter.style.opacity = '1';
      controlCenter.style.pointerEvents = 'auto';
      const panel = controlCenter.querySelector('.control-center-panel');
      if (panel) panel.style.pointerEvents = '';
    }

    // Reflect whatever sort was last applied to this category (kept in sync
    // with the Preview-mode row sort via the shared categorySort map).
    const folderSort = document.getElementById('folder-sort');
    if (folderSort) folderSort.value = categorySort[currentCategoryIdx] || 'custom';

    // Render category action buttons
    renderCategoryActions();
    renderFolderGrid();
  }
}

function renderCategoryActions() {
  const group = document.getElementById('category-actions-group');
  if (!group) return;

  const stats = getCategorySelectionStats(currentCategoryIdx);

  group.innerHTML = `
    <button class="cat-action-btn ${stats.selectedFolders === stats.totalFolders ? 'active-all' : ''}" id="btn-cat-select-all" title="Select all folders in this category">All</button>
    <button class="cat-action-btn" id="btn-cat-select-none" title="Deselect all folders in this category">None</button>
  `;

  document.getElementById('btn-cat-select-all').addEventListener('click', () => {
    toggleCategorySelection(currentCategoryIdx, true);
    renderCategoryActions();
    // Update subtitle
    const stats = getCategorySelectionStats(currentCategoryIdx);
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl) subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
  });

  document.getElementById('btn-cat-select-none').addEventListener('click', () => {
    toggleCategorySelection(currentCategoryIdx, false);
    renderCategoryActions();
    const stats = getCategorySelectionStats(currentCategoryIdx);
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl) subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
  });
}

// ==========================================================================
// 4. FOLDER GRID RENDERER
// ==========================================================================

// Escape for safe HTML insertion (folder titles are controlled data, but the
// search query is user input, so both go through this before highlighting).
function buildFolderDescription(folder, category) {
  const sources = folder.sources || [];
  const providers = [...new Set(sources.map(s => (s.provider || 'tmdb').toUpperCase()))];
  const providerStr = providers.length >= 2
    ? providers.slice(0, -1).join(', ') + ' and ' + providers[providers.length - 1]
    : providers[0] || 'TMDB';
  const hasMovies = sources.some(s => s.type === 'movie' || !s.type);
  const hasSeries = sources.some(s => s.type === 'series');
  const contentType = hasMovies && hasSeries ? 'movies and shows'
    : hasSeries ? 'shows'
    : 'movies';
  const catName = (category && category.title) ? category.title.toLowerCase() : 'your collection';
  return `${folder.title} draws from ${providerStr} and keeps your ${catName} section stocked with ${contentType}.`;
}

const ADDON_CATALOG_LABELS = {
  'trakt.recommendations.movies': 'Trakt · Recommended',
  'trakt.recommendations.shows': 'Trakt · Recommended',
  'trakt.upnext': 'Trakt · Up Next',
  'trakt.unwatched': 'Trakt · Unwatched',
  'trakt.calendar': 'Trakt · Calendar',
  'trakt.watchlist.movies': 'Trakt · Watchlist',
  'trakt.watchlist.series': 'Trakt · Watchlist',
};

function getSourceName(source) {
  if (source.title) return source.title;
  if (source.provider === 'addon') return ADDON_CATALOG_LABELS[source.catalogId] || 'Trakt-powered';
  return 'Source';
}

function getProviderLabel(source) {
  if (source.provider === 'addon') return ADDON_CATALOG_LABELS[source.catalogId] || 'Trakt-powered';
  const provider = (source.provider || 'tmdb').toUpperCase();
  const title = (source.title || '').toLowerCase();
  let type = '';
  if (title.includes('watchlist')) type = 'List';
  else if (title.includes('recommend')) type = 'Picks';
  else if (title.includes('popular')) type = 'Popular';
  else if (title.includes('trending')) type = 'Trending';
  else if (title.includes('top')) type = 'Top';
  else if (title.includes('new') || title.includes('release')) type = 'New';
  return type ? `${provider} · ${type}` : provider;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Wrap the matched portion of a title in <mark> for search highlighting.
function highlightMatch(title, query) {
  const safe = escapeHtml(title);
  const q = (query || '').trim();
  if (!q) return safe;
  const re = new RegExp('(' + escapeRegex(escapeHtml(q)) + ')', 'ig');
  return safe.replace(re, '<mark>$1</mark>');
}

function renderFolderGrid() {
  const canvas = document.getElementById('content-canvas');
  if (!canvas || isGuideActive) return;
  // While the Nuvio preview is open, edits made from inside it (inline curation,
  // drawer source toggles) should refresh the emulator rather than swap in the
  // editor grid that owns this same canvas.
  if (isPreviewActive) { renderPreviewCollection(); return; }

  canvas.innerHTML = `<div id="media-grid" class="media-grid"></div>`;
  const grid = document.getElementById('media-grid');
  grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${gridSize}px, 1fr))`;

  const category = database[currentCategoryIdx];
  if (!category || !category.folders || category.folders.length === 0) {
    renderEmptyState(grid, "No folders available in this category.");
    return;
  }

  const query = currentSearch.toLowerCase().trim();
  const filteredFolders = category.folders.filter(folder => {
    return query === '' || folder.title.toLowerCase().includes(query);
  });

  if (filteredFolders.length === 0) {
    renderEmptyState(grid, `No results matching "${currentSearch}".`);
    return;
  }

  // Reorder arrows are only safe when the full, unfiltered list is shown.
  const showArrows = reorderMode && query === '';
  if (showArrows) grid.classList.add('reordering');

  filteredFolders.forEach((folder, filteredIdx) => {
    const card = document.createElement('div');
    const folderKey = getFolderKey(folder);
    const sourceStats = getFolderSourceCountStats(folder);
    const isSelected = sourceStats.active > 0;
    const realIdx = category.folders.indexOf(folder);

    // Spotlight: first card in categories with 6+ folders
    const isSpotlight = filteredIdx === 0 && filteredFolders.length >= 6 && !showArrows;

    card.className = `folder-card ${isSelected ? 'selected' : ''} ${showArrows ? 'reorder-active' : ''} ${isSpotlight ? 'is-spotlight' : ''}`;
    card.dataset.folderKey = folderKey;

    const shape = folder.tileShape || "LANDSCAPE";
    card.classList.add(`aspect-${shape.toLowerCase()}`);

    const baseImg = folder.coverImageUrl || '';
    const hoverGif = folder.focusGifUrl || baseImg;

    const logoOverlayHtml = folder.titleLogoUrl
      ? `<div class="card-logo-overlay"><img src="${folder.titleLogoUrl}" alt="${folder.title}" class="card-logo-img"></div>`
      : `<h4 class="card-text-title">${highlightMatch(folder.title, query)}</h4>`;

    // Badge colour class based on source ratio
    const badgeRatio = sourceStats.total > 0 ? sourceStats.active / sourceStats.total : 0;
    const badgeClass = badgeRatio === 1 ? 'badge-full'
      : badgeRatio === 0 ? 'badge-empty'
      : badgeRatio < 0.5 ? 'badge-sparse'
      : 'badge-half';

    // "New" badge for trending/new category folders
    const categoryId = (category.id || '').toLowerCase();
    const folderId = (folder.id || '').toLowerCase();
    const isNewFolder = categoryId.includes('trending') || categoryId.includes('new')
      || folderId.includes('trending') || folderId.includes('new');
    const newBadgeHtml = isNewFolder ? `<span class="new-badge">New</span>` : '';

    const controlsHeader = showArrows
      ? `<div class="card-controls-header">
           ${reorderArrowsHtml(realIdx === 0, realIdx === category.folders.length - 1)}
           <div class="card-source-count-badge ${badgeClass}" title="${sourceStats.active} of ${sourceStats.total} sources enabled">${sourceStats.active}/${sourceStats.total}</div>
         </div>`
      : `<div class="card-controls-header">
           <div class="custom-checkbox-wrapper" title="${isSelected ? 'Remove from collection' : 'Add to collection'}">
             <div class="checkbox-visual">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                 <polyline points="20 6 9 17 4 12"></polyline>
               </svg>
             </div>
           </div>
           <div class="card-source-count-badge ${badgeClass}" title="${sourceStats.active} of ${sourceStats.total} sources enabled">${sourceStats.active}/${sourceStats.total}</div>
           <button class="gear-button" title="Tune sources">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
               <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
               <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
               <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
               <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
             </svg>
           </button>
           ${newBadgeHtml}
         </div>`;

    card.innerHTML = `
      <div class="card-artwork-wrapper">
        <img src="${baseImg}" class="card-cover-img" alt="${folder.title}" loading="lazy">
        ${(folder.focusGifUrl && gifsAllowedForCategory(category)) ? `<img src="${hoverGif}" class="card-gif-img" alt="${folder.title} preview" loading="lazy">` : ''}
      </div>
      <div class="card-overlay-gradient"></div>

      ${controlsHeader}

      ${logoOverlayHtml}
    `;

    // Hover → update backdrop
    card.addEventListener('mouseenter', () => {
      setCinematicWallpaper(folder);
    });

    if (showArrows) {
      // Reorder mode: arrows move the folder; selection/drawer clicks are suppressed.
      card.querySelectorAll('.reorder-arrow').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const dir = parseInt(btn.getAttribute('data-dir'), 10);
          moveItem(category.folders, realIdx, dir);
          renderFolderGrid();
          // renderFolderGrid replaces #content-canvas's whole innerHTML (it IS
          // the scroll container), which snaps scroll to the top — keep the
          // moved card in view instead of resetting on every click.
          document.querySelector(`[data-folder-key="${CSS.escape(folderKey)}"]`)?.scrollIntoView({ block: 'nearest' });
        });
      });
    } else {
      // Checkbox → toggle folder (keyboard-focusable: Tab + Enter/Space)
      const checkboxBtn = card.querySelector('.custom-checkbox-wrapper');
      checkboxBtn.setAttribute('tabindex', '0');
      checkboxBtn.setAttribute('role', 'checkbox');
      checkboxBtn.setAttribute('aria-checked', String(isSelected));
      checkboxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWholeFolderSelection(folder, !isSelected);
      });
      checkboxBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleWholeFolderSelection(folder, !isSelected);
        }
      });

      // Gear → open drawer
      const gearBtn = card.querySelector('.gear-button');
      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSourceCustomizationDrawer(folder);
      });

      // Card body → open drawer (keyboard-focusable: Tab + Enter/Space)
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${folder.title}: customize sources`);
      card.addEventListener('click', () => {
        openSourceCustomizationDrawer(folder);
      });
      card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
          e.preventDefault();
          openSourceCustomizationDrawer(folder);
        }
      });
    }

    grid.appendChild(card);
  });
}

// Apply a sort preset to the current category's folders, then re-render.
function applyFolderSort(mode) {
  const category = database[currentCategoryIdx];
  if (!category || !category.folders) return;
  categorySort[currentCategoryIdx] = mode;
  if (mode === 'az' || mode === 'za') {
    sortByTitle(category.folders, mode);
  } else if (mode === 'selected') {
    // Stable: selected folders (any active source) float to the top.
    const decorated = category.folders.map((f, i) => ({ f, i, sel: getFolderSourceCountStats(f).active > 0 }));
    decorated.sort((a, b) => (b.sel - a.sel) || (a.i - b.i));
    category.folders = decorated.map((d) => d.f);
  }
  renderFolderGrid();
}

function renderEmptyState(container, descText) {
  const isSearch = descText.includes('matching') || descText.includes('results');
  container.innerHTML = `
    <div class="no-results-box">
      <svg class="no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="transform:rotate(-15deg);opacity:0.4;">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
      <h4 class="no-results-title">${isSearch ? 'Nothing called that.' : 'No folders here.'}</h4>
      <p class="no-results-desc">${isSearch ? 'Try a different name, or scroll; some folders have unexpected titles.' : descText}</p>
    </div>
  `;
}

function getFolderSourceCountStats(folder) {
  const folderKey = getFolderKey(folder);
  const sources = folder.sources || [];
  let total = sources.length;
  let active = 0;

  if (selectedMap[folderKey]) {
    sources.forEach(source => {
      if (selectedMap[folderKey][getSourceKey(source)]) active++;
    });
  }
  return { active, total };
}

function toggleWholeFolderSelection(folder, targetState) {
  const folderKey = getFolderKey(folder);
  if (!selectedMap[folderKey]) selectedMap[folderKey] = {};

  if (folder.sources) {
    folder.sources.forEach(source => {
      selectedMap[folderKey][getSourceKey(source)] = targetState;
    });
  }

  if (!targetState) showUndoToast(folder);

  renderFolderGrid();
  renderSidebar();
  renderCategoryActions();
  updateControlCenterStats();

  // Update subtitle
  const stats = getCategorySelectionStats(currentCategoryIdx);
  const subtitleEl = document.getElementById('view-subtitle');
  if (subtitleEl && !isGuideActive && !isPreviewActive) {
    subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
  }
}

// ==========================================================================
// 5b. PREVIEW COLLECTION VIEW
// ==========================================================================

function renderPreviewCollection() {
  const canvas = document.getElementById('content-canvas');
  if (!canvas) return;

  canvas.innerHTML = '';
  previewRows = [];

  const all = getAllFolders();   // every folder, selected or not

  const container = document.createElement('div');
  container.className = `nv-emulator device-${previewDevice}`;

  // ---- Control bar (lives outside the simulated device frame) ----
  const bar = document.createElement('div');
  bar.className = `nv-preview-bar${previewBarOpen ? ' open' : ''}`;
  bar.innerHTML = `
    <div class="nv-preview-content">
    <div class="nv-preview-secondary${previewMoreOpen ? ' open' : ''}" id="nv-preview-secondary">
      <div class="nv-device-toggle" role="tablist" aria-label="Preview device">
        <button class="nv-device-opt ${previewDevice === 'tv' ? 'active' : ''}" data-device="tv" role="tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          <span>TV</span>
        </button>
        <button class="nv-device-opt ${previewDevice === 'mobile' ? 'active' : ''}" data-device="mobile" role="tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"></rect><line x1="12" y1="18" x2="12" y2="18"></line></svg>
          <span>Phone</span>
        </button>
      </div>
      <button class="nv-reorder-toggle ${reorderMode ? 'active' : ''}" id="preview-reorder" title="Reorder mode: show up/down arrows to move sections, folders & sources by hand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
        <span>Reorder</span>
      </button>
      <button class="nv-reorder-toggle" id="preview-editorview" title="Quick Editor: the full settings panel for folders, sources, and API keys, no wizard required">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
        <span>Quick Editor</span>
      </button>
      <div class="nv-viewmode-combo" title="How your folders lay out inside Nuvio, also written to your export. Tabbed Grid is the mobile-safe pick.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--text-muted);"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <select id="preview-viewmode" class="topbar-select" aria-label="View mode">
          <option value="ROWS">Rows</option>
          <option value="TABBED_GRID">Tabbed Grid</option>
          <option value="FOLLOW_LAYOUT">Auto</option>
        </select>
      </div>
      <button class="nv-help-btn" id="preview-help" data-tooltip="Keyboard shortcuts (press ?)" aria-label="Keyboard shortcuts">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </button>
    </div>
    <div class="nv-preview-actions">
      <button class="nv-more-toggle${previewMoreOpen ? ' active' : ''}" id="preview-more" aria-label="More options" aria-expanded="${previewMoreOpen}" title="More options">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
      </button>
      <button class="btn-secondary nv-mini-btn" id="preview-download" title="Download your collection file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px;"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>
        <span>Save File</span>
      </button>
      <button class="btn-primary nv-mini-btn" id="preview-send" title="Send your collection straight to Nuvio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/><line x1="12" y1="7" x2="12" y2="14"/></svg>
        <span>Send to Nuvio</span>
      </button>
    </div>
    </div>
    <button class="mobile-fab${previewBarOpen ? ' active' : ''}" id="preview-fab" aria-label="Export & view options" aria-expanded="${previewBarOpen}" title="Export & view options">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>
    </button>
  `;
  container.appendChild(bar);

  // ---- Empty state (only when the catalog itself is empty) ----
  if (all.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'preview-empty';
    empty.innerHTML = `
      <h3>No folders available</h3>
      <p>This collection doesn't have any folders to show.</p>
    `;
    container.appendChild(empty);
    canvas.appendChild(container);
    bindPreviewControls();
    return;
  }

  // ---- Resolve the featured folder for the hero ----
  // Keep the current pick if it's still valid; otherwise prefer the first
  // folder that's in the collection, falling back to the very first folder.
  let featured = featuredKey ? all.find(p => getFolderKey(p.folder) === featuredKey) : null;
  if (!featured) {
    featured = all.find(p => getFolderSourceCountStats(p.folder).active > 0) || all[0];
  }
  featuredKey = getFolderKey(featured.folder);

  // ---- Simulated device frame ----
  const frame = document.createElement('div');
  frame.className = 'nv-frame';

  const screen = document.createElement('div');
  screen.className = 'nv-screen';
  screen.appendChild(buildMobileStatusBar());

  // Hero stays pinned at the top of the screen; only the rows scroll beneath it,
  // so the backdrop + title logo remain visible while browsing.
  screen.appendChild(buildNuvioHero());

  const scroll = document.createElement('div');
  scroll.className = 'nv-scroll';

  // Gentle nudge when the collection is empty — every card below is dimmed and
  // addable, so this is a hint banner rather than a blocking overlay.
  if (getSelectedFolderCount() === 0) {
    const hint = document.createElement('div');
    hint.className = 'nv-empty-hint';
    hint.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
      <div class="nv-empty-hint-text">
        <strong>Your home screen starts here.</strong>
        <span>Check a folder to add it. A few good ones beats the full list.</span>
      </div>
      <button class="nv-empty-hint-btn" id="nv-empty-browse">Start picking</button>
    `;
    scroll.appendChild(hint);
  }

  // One catalog row per category — every folder is shown; ones not in the
  // collection appear dimmed with an Add toggle.
  database.forEach((category, idx) => {
    if (!category.folders || category.folders.length === 0) return;
    const items = category.folders.map(folder => ({ folder, category, catIdx: idx }));
    scroll.appendChild(buildCatalogRow(category.title, items, idx));
  });

  // Idle hero rotation pauses while the cursor is over the screen (hover drives
  // the hero directly), and resumes once it leaves.
  screen.addEventListener('mouseenter', pauseHeroCarousel);
  screen.addEventListener('mouseleave', resumeHeroCarousel);

  screen.appendChild(scroll);
  screen.appendChild(buildMobileTabBar());
  frame.appendChild(screen);
  container.appendChild(frame);
  canvas.appendChild(container);

  bindPreviewControls();
  collectPreviewFocusRows();
  setPreviewHero(featured.folder, featured.category);

  // Start the ambient hero rotation from the featured folder's position.
  const carouselFolders = getHeroCarouselFolders();
  const featIdx = carouselFolders.findIndex(p => getFolderKey(p.folder) === featuredKey);
  heroCarouselIdx = featIdx >= 0 ? featIdx : 0;
  heroCarouselPaused = false;
  startHeroCarousel();
  document.getElementById('nv-empty-browse')?.addEventListener('click', openSidebar);
}

// Count of folders currently in the collection (at least one active source).
function getSelectedFolderCount() {
  let n = 0;
  database.forEach(c => (c.folders || []).forEach(f => {
    if (getFolderSourceCountStats(f).active > 0) n++;
  }));
  return n;
}

// ROWS → classic, TABBED_GRID → grid, FOLLOW_LAYOUT → modern (Nuvio home layouts)
function previewLayoutFromViewMode() {
  if (selectedViewMode === 'TABBED_GRID') return 'grid';
  if (selectedViewMode === 'FOLLOW_LAYOUT') return 'modern';
  return 'classic';
}
function previewLayoutLabel(layout) {
  return layout === 'grid' ? 'Grid layout' : layout === 'modern' ? 'Modern layout' : 'Classic rows';
}

// Flat list of every selected folder with its category, in display order.
function getAllSelectedFolders() {
  const out = [];
  database.forEach((category, catIdx) => {
    getSelectedFoldersForPreview(category).forEach(folder => {
      out.push({ folder, category, catIdx });
    });
  });
  return out;
}

function getSelectedFoldersForPreview(category) {
  if (!category.folders) return [];
  return category.folders.filter(folder => {
    const folderKey = getFolderKey(folder);
    const sources = folder.sources || [];
    return sources.some(source => {
      return selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(source)];
    });
  });
}

// ---- Hero carousel ------------------------------------------------------
// The hero is built once, then re-populated live as the user hovers/arrows
// across cards (so navigation drives the hero, no "featured" pinning needed).
let previewHeroFolder = null;
let previewHeroCategory = null;

function buildNuvioHero() {
  const hero = document.createElement('div');
  hero.className = 'nv-hero nv-focus-row';
  hero.innerHTML = `
    <div class="nv-hero-bg" id="nv-hero-bg"></div>
    <div class="nv-hero-scrim"></div>
    <div class="nv-hero-content">
      <span class="nv-hero-eyebrow" id="nv-hero-eyebrow"></span>
      <img class="nv-hero-logo" id="nv-hero-logo" alt="">
      <h2 class="nv-hero-title" id="nv-hero-title"></h2>
      <p class="nv-hero-meta"><span class="nv-live-dot"></span><span id="nv-hero-meta"></span></p>
      <div class="nv-hero-actions">
        <button class="nv-hero-btn nv-hero-play nv-focusable" data-action="play">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Play
        </button>
        <button class="nv-hero-btn nv-hero-info nv-focusable" data-action="info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          More Info
        </button>
      </div>
      <div class="nv-hero-dots" id="nv-hero-dots"></div>
    </div>
  `;
  hero.querySelectorAll('.nv-hero-btn').forEach(btn => {
    btn.addEventListener('click', () => { if (previewHeroFolder) openPreviewDetail(previewHeroFolder, previewHeroCategory); });
    btn.addEventListener('mouseenter', () => focusPreviewElement(btn));
  });
  return hero;
}

// Point the hero at a folder. Called on mount and on every focus/hover change.
function setPreviewHero(folder, category) {
  if (!folder) return;
  previewHeroFolder = folder;
  previewHeroCategory = category;
  const bg = document.getElementById('nv-hero-bg');
  if (!bg) return;   // hero not mounted yet
  const logo = document.getElementById('nv-hero-logo');
  const title = document.getElementById('nv-hero-title');
  const eyebrow = document.getElementById('nv-hero-eyebrow');
  const meta = document.getElementById('nv-hero-meta');
  const stats = getFolderSourceCountStats(folder);

  bg.style.backgroundImage = `url('${folder.heroBackdropUrl || folder.coverImageUrl || ''}')`;
  // Title logos belong to the hero only (never the cards). Sits top-left.
  if (folder.titleLogoUrl) {
    logo.src = folder.titleLogoUrl;
    logo.style.display = '';
    title.style.display = 'none';
  } else {
    logo.removeAttribute('src');
    logo.style.display = 'none';
    title.textContent = folder.title;
    title.style.display = '';
  }
  eyebrow.textContent = (previewHeroCategory && previewHeroCategory.title
    ? previewHeroCategory.title
    : "Kaptain's Collection").toUpperCase();
  meta.textContent = `${stats.active}/${stats.total} sources`;
}

// ---- Ambient hero carousel ----------------------------------------------
// When the user isn't interacting, the hero slowly rotates through the folders
// that are currently in the collection so the screen never feels frozen. Any
// hover/focus pauses it (the hero follows the cursor instead); leaving the
// screen resumes it. Dots under the hero show position and allow jumping.
let heroCarouselTimer = null;
let heroCarouselPaused = false;
let heroCarouselIdx = 0;
const HERO_CAROUSEL_MAX = 6;
const HERO_CAROUSEL_MS = 6000;

function getHeroCarouselFolders() {
  return getAllFolders()
    .filter(p => getFolderSourceCountStats(p.folder).active > 0)
    .slice(0, HERO_CAROUSEL_MAX);
}

function renderHeroDots() {
  const dotsWrap = document.getElementById('nv-hero-dots');
  if (!dotsWrap) return;
  const slides = getHeroCarouselFolders();
  if (slides.length < 2) { dotsWrap.innerHTML = ''; return; }
  if (heroCarouselIdx >= slides.length) heroCarouselIdx = 0;
  dotsWrap.innerHTML = slides.map((_, i) =>
    `<button class="nv-hero-dot ${i === heroCarouselIdx ? 'active' : ''}" data-idx="${i}" aria-label="Show featured folder ${i + 1}"></button>`
  ).join('');
  dotsWrap.querySelectorAll('.nv-hero-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      showHeroSlide(parseInt(dot.getAttribute('data-idx'), 10));
      startHeroCarousel();   // reset the timer after a manual jump
    });
  });
}

function showHeroSlide(i) {
  const slides = getHeroCarouselFolders();
  if (!slides.length) return;
  heroCarouselIdx = ((i % slides.length) + slides.length) % slides.length;
  const slide = slides[heroCarouselIdx];
  setPreviewHero(slide.folder, slide.category);
  setCinematicWallpaper(slide.folder);
  const dotsWrap = document.getElementById('nv-hero-dots');
  if (dotsWrap) dotsWrap.querySelectorAll('.nv-hero-dot').forEach((d, di) =>
    d.classList.toggle('active', di === heroCarouselIdx));
}

function startHeroCarousel() {
  stopHeroCarousel();
  renderHeroDots();
  if (getHeroCarouselFolders().length < 2) return;   // nothing to rotate through
  heroCarouselTimer = setInterval(() => {
    if (heroCarouselPaused) return;
    if (document.getElementById('preview-detail')) return;   // detail sheet is open
    showHeroSlide(heroCarouselIdx + 1);
  }, HERO_CAROUSEL_MS);
}
function stopHeroCarousel() {
  if (heroCarouselTimer) { clearInterval(heroCarouselTimer); heroCarouselTimer = null; }
}
function pauseHeroCarousel() { heroCarouselPaused = true; }
function resumeHeroCarousel() { heroCarouselPaused = false; }

// ---- Catalog row --------------------------------------------------------
// No category icon: emojis are only shown if they actually exist in the
// collection config (i.e. baked into the title), never auto-generated.
function buildCatalogRow(title, items, catIdx) {
  const row = document.createElement('div');
  row.className = 'nv-row nv-focus-row';
  if (catIdx != null) row.id = 'nv-cat-' + catIdx;

  // Quick-sort menu (hidden while reordering by hand)
  const sortVal = categorySort[catIdx] || 'custom';
  const sortMenu = reorderMode ? '' : `
    <div class="nv-row-sort" title="Sort the folders in this row">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;color:var(--text-muted);"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="14" y2="12"></line><line x1="4" y1="18" x2="9" y2="18"></line></svg>
      <select class="topbar-select nv-row-sort-select" data-cat-idx="${catIdx}">
        <option value="custom"${sortVal === 'custom' ? ' selected' : ''}>Custom</option>
        <option value="az"${sortVal === 'az' ? ' selected' : ''}>A–Z</option>
        <option value="za"${sortVal === 'za' ? ' selected' : ''}>Z–A</option>
        <option value="selected"${sortVal === 'selected' ? ' selected' : ''}>In collection first</option>
      </select>
    </div>`;

  row.innerHTML = `
    <div class="nv-row-header">
      <span class="nv-row-title">${title}</span>
      <span class="nv-row-count">${items.length}</span>
      ${sortMenu}
    </div>
  `;

  const select = row.querySelector('.nv-row-sort-select');
  if (select) select.addEventListener('change', () => {
    categorySort[catIdx] = select.value;
    sortCategoryFolders(catIdx, select.value);
    rebuildCategoryRow(catIdx);
  });

  const track = document.createElement('div');
  track.className = 'nv-track';
  items.forEach(item => track.appendChild(buildNuvioCard(item.folder, item.category, item.catIdx)));
  row.appendChild(track);
  return row;
}

// Sort one category's folders by a preset (reuses the editor's logic).
function sortCategoryFolders(catIdx, mode) {
  const category = database[catIdx];
  if (!category || !category.folders) return;
  if (mode === 'az' || mode === 'za') {
    sortByTitle(category.folders, mode);
  } else if (mode === 'selected') {
    const decorated = category.folders.map((f, i) => ({ f, i, sel: getFolderSourceCountStats(f).active > 0 }));
    decorated.sort((a, b) => (b.sel - a.sel) || (a.i - b.i));
    category.folders = decorated.map((d) => d.f);
  }
}

// Rebuild a single category's row in place (keeps scroll; refreshes focus rows).
function rebuildCategoryRow(catIdx) {
  const oldRow = document.getElementById('nv-cat-' + catIdx);
  if (!oldRow) return;
  const category = database[catIdx];
  const items = (category.folders || []).map(folder => ({ folder, category, catIdx }));
  oldRow.replaceWith(buildCatalogRow(category.title, items, catIdx));
  collectPreviewFocusRows();
}

// ---- Content card (Nuvio contentCard parity + inline curation) ----------
function buildNuvioCard(folder, category, catIdx) {
  const shape = (folder.tileShape || 'LANDSCAPE').toLowerCase();
  const folderKey = getFolderKey(folder);
  const isFeatured = folderKey === featuredKey;
  const stats = getFolderSourceCountStats(folder);
  const isOn = stats.active > 0;   // is this folder in the collection?

  const card = document.createElement('div');
  card.className = `nv-card nv-focusable shape-${shape}${isFeatured ? ' is-featured' : ''}${isOn ? '' : ' nv-off'}`;
  card.tabIndex = -1;
  card.dataset.folderKey = folderKey;
  card.__folder = folder;       // used by the focus engine to drive the hero
  card.__category = category;

  const imgSrc = folder.coverImageUrl || '';
  // Title logos never overlay the cards — they only appear in the hero.
  // Fall back to a text title only when the card has no artwork at all.
  const titleFallback = imgSrc ? '' : `<span class="nv-card-title">${folder.title}</span>`;
  // Focus GIF: plays on hover OR keyboard focus, mirroring the editor cards.
  // The src is attached lazily (on first hover/focus) so we don't fire off
  // hundreds of GIF requests when the preview first opens.
  const gifHtml = (folder.focusGifUrl && folder.focusGifEnabled !== false && gifsAllowedForCategory(category))
    ? `<img class="nv-card-gif" data-gif="${folder.focusGifUrl}" alt="">`
    : '';

  // In reorder mode, swap the curation actions for up/down arrows.
  const realIdx = category.folders ? category.folders.indexOf(folder) : -1;
  const lastIdx = category.folders ? category.folders.length - 1 : 0;
  const actionsHtml = reorderMode
    ? `<div class="nv-card-actions nv-card-reorder">${reorderArrowsHtml(realIdx === 0, realIdx === lastIdx)}</div>`
    : `<div class="nv-card-actions">
      <button class="nv-card-act act-toggle" title="${isOn ? 'Remove from collection' : 'Add to collection'}" aria-label="Toggle in collection">
        ${isOn ? CARD_MINUS_SVG : CARD_PLUS_SVG}
      </button>
      <button class="nv-card-act act-feature ${isFeatured ? 'on' : ''}" title="Set as featured (shows in hero)" aria-label="Set as featured">
        <svg viewBox="0 0 24 24" fill="${isFeatured ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      </button>
      <button class="nv-card-act act-gear" title="Customize sources" aria-label="Customize">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </div>`;

  card.innerHTML = `
    <img class="nv-card-img" src="${imgSrc}" alt="${folder.title}" loading="lazy">
    ${gifHtml}
    <div class="nv-card-gradient"></div>
    <span class="nv-card-meta" title="${isOn ? stats.active + ' active source' + (stats.active !== 1 ? 's' : '') : ''}">${isOn ? stats.active : ''}</span>
    ${titleFallback}
    ${actionsHtml}
  `;

  card.addEventListener('mouseenter', () => { attachCardGif(card); setCinematicWallpaper(folder); focusPreviewElement(card); });

  if (reorderMode) {
    card.querySelectorAll('.reorder-arrow').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const dir = parseInt(btn.getAttribute('data-dir'), 10);
        moveItem(category.folders, realIdx, dir);
        rebuildCategoryRow(catIdx);
        // rebuildCategoryRow swaps in a brand-new .nv-track, which resets its
        // horizontal scroll to 0 — keep the moved card in view instead of
        // snapping the row back to the start on every click.
        document.querySelector(`[data-folder-key="${folderKey}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      });
    });
    return card;
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.nv-card-act')) return;
    openPreviewDetail(folder, category);
  });
  card.querySelector('.act-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    const turnOn = !(getFolderSourceCountStats(folder).active > 0);
    setFolderSelected(folder, turnOn);     // in-place — card stays put, no full re-render
    refreshCardState(card, folder);
    pulseCard(card, turnOn);
    renderHeroDots();   // the carousel set changed — keep the dots in sync
  });
  card.querySelector('.act-feature').addEventListener('click', (e) => {
    e.stopPropagation();
    setPreviewFeatured(folder, category);
  });
  card.querySelector('.act-gear').addEventListener('click', (e) => {
    e.stopPropagation();
    currentCategoryIdx = catIdx;                 // so the drawer label/stats match
    openSourceCustomizationDrawer(folder);
  });
  return card;
}

function setPreviewFeatured(folder, category) {
  featuredKey = getFolderKey(folder);
  // Update the featured ring + star in place (no full re-render → keep scroll).
  document.querySelectorAll('.nv-card').forEach(c => {
    const on = c.dataset.folderKey === featuredKey;
    c.classList.toggle('is-featured', on);
    const star = c.querySelector('.act-feature');
    if (star) star.classList.toggle('on', on);
  });
  setPreviewHero(folder, category);
}

// Add/remove a whole folder from the collection without rebuilding the view.
function setFolderSelected(folder, on) {
  const key = getFolderKey(folder);
  if (!selectedMap[key]) selectedMap[key] = {};
  (folder.sources || []).forEach(s => { selectedMap[key][getSourceKey(s)] = on; });
  if (!on) showUndoToast(folder);
  updateControlCenterStats();
  renderSidebar();   // refresh the per-category counts
}

// Quick confirmation pulse when a card is added to / removed from the collection.
function pulseCard(card, added) {
  if (!card) return;
  card.classList.remove('card-added', 'card-removed');
  void card.offsetWidth;   // force reflow so the animation restarts on rapid toggles
  card.classList.add(added ? 'card-added' : 'card-removed');
  setTimeout(() => card.classList.remove('card-added', 'card-removed'), 380);
}

// Sync a single card's visuals to the folder's current selection state.
function refreshCardState(card, folder) {
  const stats = getFolderSourceCountStats(folder);
  const on = stats.active > 0;
  card.classList.toggle('nv-off', !on);
  const meta = card.querySelector('.nv-card-meta');
  if (meta) {
    meta.textContent = on ? stats.active : '';
    meta.title = on ? `${stats.active} active source${stats.active !== 1 ? 's' : ''}` : '';
  }
  const tgl = card.querySelector('.act-toggle');
  if (tgl) {
    tgl.title = on ? 'Remove from collection' : 'Add to collection';
    tgl.innerHTML = on ? CARD_MINUS_SVG : CARD_PLUS_SVG;
  }
}

// Every folder in the catalog with its category, in display order.
function getAllFolders() {
  const out = [];
  database.forEach((category, catIdx) => {
    (category.folders || []).forEach(folder => out.push({ folder, category, catIdx }));
  });
  return out;
}

// Jump-nav: bring a category's row into view (switching back to preview first).
function jumpToCategory(idx) {
  activeCatIdx = idx;
  if (!isPreviewActive || isGuideActive) {
    isGuideActive = false; isPreviewActive = true;
    switchCategory(-2);
    requestAnimationFrame(() => scrollToCategoryRow(idx));
  } else {
    renderSidebar();
    scrollToCategoryRow(idx);
  }
}
function scrollToCategoryRow(idx) {
  const row = document.getElementById('nv-cat-' + idx);
  const scroller = document.querySelector('.nv-scroll');
  if (row && scroller) {
    const rr = row.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    scroller.scrollTop += rr.top - sr.top - 12;
  }
}

// ---- Mobile chrome (hidden on TV via CSS) -------------------------------
function buildMobileStatusBar() {
  const bar = document.createElement('div');
  bar.className = 'nv-statusbar';
  bar.innerHTML = `
    <span class="nv-clock">9:41</span>
    <div class="nv-status-icons">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><path d="M2 22h2V10H2v12zm5 0h2V4H7v18zm5 0h2V13h-2v9zm5 0h2V7h-2v15z"></path></svg>
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;"><path d="M12 4C7 4 2.7 6.5 1 9l11 13L23 9c-1.7-2.5-6-5-11-5z"></path></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:14px;"><rect x="2" y="7" width="18" height="10" rx="2"></rect><line x1="22" y1="11" x2="22" y2="13"></line><rect x="4" y="9" width="13" height="6" fill="currentColor" stroke="none"></rect></svg>
    </div>
  `;
  return bar;
}
function buildMobileTabBar() {
  const tabs = [
    { n: 'Home', a: true, p: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { n: 'Search', a: false, p: 'M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z' },
    { n: 'Library', a: false, p: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z' },
    { n: 'Settings', a: false, p: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82' }
  ];
  const bar = document.createElement('div');
  bar.className = 'nv-tabbar';
  bar.innerHTML = tabs.map(t => `
    <div class="nv-tab ${t.a ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${t.p}"></path></svg>
      <span>${t.n}</span>
    </div>
  `).join('');
  return bar;
}

// ---- Preview poster helpers ---------------------------------------------
function formatPreviewAge(isoStr) {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffH < 1)  return 'just now';
  if (diffH < 24) return `${diffH} hour${diffH > 1 ? 's' : ''} ago`;
  if (diffD === 1) return 'yesterday';
  if (diffD < 7)  return `${diffD} days ago`;
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function fillFauxTiles(folder, source, container) {
  if (!window.PREVIEW_POSTERS || !source || !container) return;
  const key = `${folder.id}::${source.title}`;
  const paths = window.PREVIEW_POSTERS[key];
  if (!paths || !paths.length) return;
  const isLandscape = (folder.tileShape || '').toUpperCase() === 'LANDSCAPE';
  const baseUrl = isLandscape ? 'https://image.tmdb.org/t/p/w780' : 'https://image.tmdb.org/t/p/w342';
  const tiles = container.querySelectorAll('.nv-faux-tile');
  paths.forEach((p, i) => {
    if (!tiles[i] || !p) return;
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('load',  () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.remove());
    img.src = baseUrl + p;
    if (img.complete && img.naturalWidth) img.classList.add('loaded');
    tiles[i].appendChild(img);
  });
}

// ---- Detail sheet (Nuvio detail-screen feel) ----------------------------
function openPreviewDetail(folder, category) {
  closePreviewDetail();
  const stats = getFolderSourceCountStats(folder);
  const folderKey = getFolderKey(folder);
  const backdrop = folder.heroBackdropUrl || folder.coverImageUrl || '';
  const isIncluded = stats.active > 0;
  const isFeatured = folderKey === featuredKey;

  const sourceChips = (folder.sources || []).map(src => {
    const on = selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(src)];
    const provider = src.provider ? src.provider.toLowerCase() : 'tmdb';
    return `<span class="nv-chip ${on ? 'on' : 'off'}"><span class="nv-chip-dot provider-${provider}"></span>${escapeHtml(getSourceName(src))}</span>`;
  }).join('') || '<span class="nv-detail-empty">No individual sources.</span>';

  // Layout demo: the View Mode controls how the folder's own catalogs lay out
  // once you open it — NOT how the home-screen cards look. Show that here.
  const layout = previewLayoutFromViewMode();
  const activeSrc = (folder.sources || []).filter(src => selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(src)]);
  const demoSources = (activeSrc.length ? activeSrc : (folder.sources || [])).slice(0, 4);
  const tile = () => '<div class="nv-faux-tile"></div>';
  let layoutDemo;
  if (layout === 'grid') {
    const tabs = (demoSources.length ? demoSources : [{ title: 'All' }])
      .map((s, i) => `<span class="nv-faux-tab ${i === 0 ? 'on' : ''}">${s.title || 'List'}</span>`).join('');
    layoutDemo = `<div class="nv-faux-tabs">${tabs}</div><div class="nv-faux-grid">${Array.from({ length: 12 }).map(tile).join('')}</div>`;
  } else {
    layoutDemo = (demoSources.length ? demoSources : [{ title: 'Catalog' }]).map(s => `
      <div class="nv-faux-row">
        <span class="nv-faux-row-label">${s.title || 'Catalog'}</span>
        <div class="nv-faux-strip">${Array.from({ length: 8 }).map(tile).join('')}</div>
      </div>`).join('');
  }

  const logoHtml = folder.titleLogoUrl
    ? `<img class="nv-detail-logo" src="${folder.titleLogoUrl}" alt="${folder.title}">`
    : `<h2 class="nv-detail-title">${folder.title}</h2>`;

  const generatedAt = window.PREVIEW_POSTERS && window.PREVIEW_POSTERS._generatedAt;
  const hasAnyPosters = window.PREVIEW_POSTERS && demoSources.some(s => {
    const k = `${folder.id}::${s.title}`;
    return window.PREVIEW_POSTERS[k] && window.PREVIEW_POSTERS[k].length > 0;
  });
  const noteText = hasAnyPosters
    ? `Real titles from your sources · Updated ${formatPreviewAge(generatedAt)}`
    : 'Placeholder layout. Your lists fill with live titles once the collection is in Nuvio.';

  const overlay = document.createElement('div');
  overlay.id = 'preview-detail';
  overlay.className = 'nv-detail-overlay';
  overlay.innerHTML = `
    <div class="nv-detail-sheet" role="dialog" aria-label="${folder.title}">
      <button class="nv-detail-close" aria-label="Close">&times;</button>
      <div class="nv-detail-banner">
        <div class="nv-detail-bg" style="background-image:url('${backdrop}')"></div>
        <div class="nv-detail-scrim"></div>
      </div>
      <div class="nv-detail-scrollable">
        ${logoHtml}
        <p class="nv-detail-meta">${category.title} · ${stats.active}/${stats.total} sources active</p>
        <p class="nv-detail-desc">${folder.description || buildFolderDescription(folder, category)}</p>
        <p class="nv-detail-section-label">Sources feeding this folder · ${stats.active}/${stats.total}</p>
        <div class="nv-detail-chips">${sourceChips}</div>
        <div class="nv-detail-inside">
          <p class="nv-detail-inside-head">Inside this folder · ${previewLayoutLabel(layout)} <span class="nv-inside-hint">(this folder's internal layout, set by your View Mode, not the home screen)</span></p>
          <div class="nv-faux-stage layout-${layout}">${layoutDemo}</div>
          <p class="nv-faux-note">${noteText}</p>
        </div>
        <div class="nv-detail-actions">
          <button class="nv-hero-btn nv-hero-play" data-act="toggle">${isIncluded ? 'Remove from collection' : 'Add to collection'}</button>
          <button class="nv-hero-btn nv-hero-info" data-act="feature">${isFeatured ? '★ Featured' : '☆ Set as featured'}</button>
          <button class="nv-hero-btn nv-hero-info" data-act="sources">Customize sources</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setCinematicWallpaper(folder);

  // Fill live preview tiles from pre-baked TMDB data
  if (window.PREVIEW_POSTERS && demoSources.length) {
    if (layout === 'grid') {
      const gridEl = overlay.querySelector('.nv-faux-grid');
      const tabEls = overlay.querySelectorAll('.nv-faux-tab');
      tabEls.forEach((tabEl, i) => {
        tabEl.style.cursor = 'pointer';
        tabEl.addEventListener('click', () => {
          tabEls.forEach(t => t.classList.remove('on'));
          tabEl.classList.add('on');
          if (gridEl) {
            gridEl.innerHTML = Array.from({ length: 12 }).map(() => '<div class="nv-faux-tile"></div>').join('');
            fillFauxTiles(folder, demoSources[i], gridEl);
          }
        });
      });
      fillFauxTiles(folder, demoSources[0], gridEl);
    } else {
      const strips = overlay.querySelectorAll('.nv-faux-strip');
      demoSources.forEach((src, i) => {
        if (strips[i]) fillFauxTiles(folder, src, strips[i]);
      });
    }
  }

  const close = () => closePreviewDetail();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.nv-detail-close').addEventListener('click', close);
  overlay.querySelector('[data-act="toggle"]').addEventListener('click', () => {
    setFolderSelected(folder, !isIncluded);
    document.querySelectorAll(`.nv-card[data-folder-key="${CSS.escape(folderKey)}"]`).forEach(c => refreshCardState(c, folder));
    close();
  });
  overlay.querySelector('[data-act="feature"]').addEventListener('click', () => {
    close();
    setPreviewFeatured(folder, category);
  });
  overlay.querySelector('[data-act="sources"]').addEventListener('click', () => {
    const catIdx = database.indexOf(category);
    if (catIdx >= 0) currentCategoryIdx = catIdx;
    close();
    openSourceCustomizationDrawer(folder);
  });
  requestAnimationFrame(() => overlay.classList.add('open'));
}
function closePreviewDetail() {
  const overlay = document.getElementById('preview-detail');
  if (overlay) overlay.remove();
}

// ---- TV focus engine ----------------------------------------------------
function collectPreviewFocusRows() {
  previewRows = [];
  document.querySelectorAll('.nv-emulator .nv-focus-row').forEach(rowEl => {
    const items = Array.from(rowEl.querySelectorAll('.nv-focusable'));
    if (items.length) previewRows.push(items);
  });
  previewPos = { r: 0, c: 0 };
  clearPreviewFocus();
}
function clearPreviewFocus() {
  document.querySelectorAll('.nv-focusable.is-focused').forEach(el => el.classList.remove('is-focused'));
}
// Scroll only the row's track (horizontally) and the screen's scroll area
// (vertically) — never the outer canvas — so arrow nav behaves predictably.
function scrollFocusIntoView(el) {
  const track = el.closest('.nv-track');
  if (track) {
    const er = el.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    const pad = 70;
    if (er.left < tr.left + pad) track.scrollLeft += er.left - tr.left - pad;
    else if (er.right > tr.right - pad) track.scrollLeft += er.right - tr.right + pad;
  }
  const scroller = el.closest('.nv-scroll');
  const row = el.closest('.nv-focus-row');
  if (scroller && row) {
    const rr = row.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const pad = 24;
    if (rr.top < sr.top + pad) scroller.scrollTop += rr.top - sr.top - pad;
    else if (rr.bottom > sr.bottom - pad) scroller.scrollTop += rr.bottom - sr.bottom + pad;
  }
}
function focusPreviewElement(el) {
  // Sync previewPos to a directly-hovered element so keyboard nav continues from here.
  for (let r = 0; r < previewRows.length; r++) {
    const c = previewRows[r].indexOf(el);
    if (c >= 0) { setPreviewFocus(r, c, false); return; }
  }
}
function setPreviewFocus(r, c, scroll = true) {
  if (!previewRows.length) return;
  r = Math.max(0, Math.min(r, previewRows.length - 1));
  c = Math.max(0, Math.min(c, previewRows[r].length - 1));
  previewPos = { r, c };
  clearPreviewFocus();
  const el = previewRows[r][c];
  if (!el) return;
  el.classList.add('is-focused');
  if (scroll) scrollFocusIntoView(el);
  // Focused/hovered card drives the hero (and the page backdrop), like the real app
  const card = el.closest('.nv-card');
  if (card && card.__folder) {
    attachCardGif(card);
    setCinematicWallpaper(card.__folder);
    setPreviewHero(card.__folder, card.__category);
  }
}

// Lazily load a card's focus GIF the first time it's hovered/focused.
function attachCardGif(card) {
  const gif = card && card.querySelector('.nv-card-gif[data-gif]');
  if (gif) { gif.src = gif.getAttribute('data-gif'); gif.removeAttribute('data-gif'); }
}
function handlePreviewKeydown(e) {
  if (!isPreviewActive) return;
  // Don't hijack arrow keys when the user is interacting with a dropdown/field.
  if (e.target && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (document.getElementById('preview-detail')) {
    if (e.key === 'Escape') { e.preventDefault(); closePreviewDetail(); }
    return;
  }
  const overlayOpen = document.querySelector('.drawer-overlay.open, .wizard-overlay.open, .compat-overlay.open');
  if (overlayOpen) return;
  if (!previewRows.length) return;
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); setPreviewFocus(previewPos.r, previewPos.c + 1); break;
    case 'ArrowLeft':  e.preventDefault(); setPreviewFocus(previewPos.r, previewPos.c - 1); break;
    case 'ArrowDown':  e.preventDefault(); setPreviewFocus(previewPos.r + 1, previewPos.c); break;
    case 'ArrowUp':    e.preventDefault(); setPreviewFocus(previewPos.r - 1, previewPos.c); break;
    case 'Enter': case ' ': {
      const el = previewRows[previewPos.r] && previewRows[previewPos.r][previewPos.c];
      if (el) { e.preventDefault(); el.click(); }
      break;
    }
  }
}

// The mobile bottom bar collapses everything but Download/Send behind a
// "more" toggle (see .nv-preview-secondary in style.css). These just flip
// the DOM class directly — no need to re-render the whole preview.
function openPreviewSecondary() {
  previewMoreOpen = true;
  document.getElementById('nv-preview-secondary')?.classList.add('open');
  const btn = document.getElementById('preview-more');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-expanded', 'true'); }
}
function closePreviewSecondary() {
  previewMoreOpen = false;
  document.getElementById('nv-preview-secondary')?.classList.remove('open');
  const btn = document.getElementById('preview-more');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
}

// The mobile preview bar itself collapses into a single FAB (#preview-fab).
// Opening it just reveals .nv-preview-content (⋯ / Download / Send to
// Nuvio); the ⋯ disclosure above still nests one level deeper inside that.
function openPreviewBar() {
  previewBarOpen = true;
  document.querySelector('.nv-preview-bar')?.classList.add('open');
  const btn = document.getElementById('preview-fab');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-expanded', 'true'); }
}
function closePreviewBar() {
  previewBarOpen = false;
  document.querySelector('.nv-preview-bar')?.classList.remove('open');
  const btn = document.getElementById('preview-fab');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
}

function bindPreviewControls() {
  document.getElementById('preview-fab')?.addEventListener('click', () => {
    if (previewBarOpen) closePreviewBar(); else openPreviewBar();
  });
  document.getElementById('preview-more')?.addEventListener('click', () => {
    if (previewMoreOpen) closePreviewSecondary(); else openPreviewSecondary();
  });
  const vm = document.getElementById('preview-viewmode');
  if (vm) {
    vm.value = selectedViewMode;
    vm.addEventListener('change', () => {
      selectedViewMode = vm.value;
      try { localStorage.setItem('kaptain_view_mode', selectedViewMode); } catch (e) { /* ignore */ }
      const editorSel = document.getElementById('viewmode-select');
      if (editorSel) { editorSel.value = selectedViewMode; updateRowsWarning(editorSel); }
    });
  }
  document.querySelectorAll('.nv-device-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      previewDevice = btn.getAttribute('data-device');
      try { localStorage.setItem('kaptain_preview_device', previewDevice); } catch (e) { /* ignore */ }
      renderPreviewCollection();
    });
  });
  const reorderBtn = document.getElementById('preview-reorder');
  if (reorderBtn) reorderBtn.addEventListener('click', () => {
    reorderMode = !reorderMode;
    updateReorderBanner();
    renderSidebar();                 // section arrows in the sidebar
    if (activeDrawerFolder) renderDrawerSourcesList();  // source arrows in the open drawer
    renderPreviewCollection();       // card arrows + hide/show row sort menus
  });
  document.getElementById('preview-editorview')?.addEventListener('click', openSimpleEditor);
  document.getElementById('preview-help')?.addEventListener('click', () => toggleShortcutPanel(true));
  const dl = document.getElementById('preview-download');
  if (dl) dl.addEventListener('click', () => ensureMobileCompat(compileAndDownloadJSON, { checkTmdb: false }));
  const send = document.getElementById('preview-send');
  if (send) send.addEventListener('click', () => {
    if (window.NuvioWizard && typeof window.NuvioWizard.open === 'function') window.NuvioWizard.open();
    else document.getElementById('btn-send-to-nuvio')?.click();
  });
}

// ==========================================================================
// 6. CINEMATIC WALLPAPER CROSSFADE
// ==========================================================================

function setCinematicWallpaper(folder) {
  if (!folder) return;
  const imgUrl = folder.heroBackdropUrl || folder.coverImageUrl || '';
  if (!imgUrl) return;

  const bg1 = document.getElementById('backdrop-layer-1');
  const bg2 = document.getElementById('backdrop-layer-2');
  if (!bg1 || !bg2) return;

  const isLayer1Active = bg1.classList.contains('active');
  const activeLayer = isLayer1Active ? bg1 : bg2;
  const hiddenLayer = isLayer1Active ? bg2 : bg1;

  hiddenLayer.style.backgroundImage = `url(${imgUrl})`;
  hiddenLayer.classList.add('active');
  activeLayer.classList.remove('active');
}

// ==========================================================================
// 7. SOURCE CUSTOMIZATION DRAWER
// ==========================================================================

function openSourceCustomizationDrawer(folder) {
  activeDrawerFolder = folder;

  const overlay = document.getElementById('drawer-overlay');
  const catLabel = document.getElementById('drawer-cat-label');
  const titleLabel = document.getElementById('drawer-title');
  const stack = document.getElementById('drawer-sources-stack');

  if (!overlay || !stack) return;

  const category = database[currentCategoryIdx];
  if (category) catLabel.textContent = category.title;
  titleLabel.textContent = folder.title;

  // Dynamic context hint based on source selection state
  const hintEl = document.getElementById('drawer-context-hint');
  if (hintEl) {
    const sources = folder.sources || [];
    const folderKey = getFolderKey(folder);
    const enabledCount = sources.filter(s => selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(s)]).length;
    const total = sources.length;
    if (total === 0) {
      hintEl.textContent = '';
    } else if (enabledCount === 0) {
      hintEl.textContent = "Nothing's on yet. Flip something on to feed this folder.";
    } else if (enabledCount === total) {
      hintEl.textContent = "Full send. Every feed for this folder is running.";
    } else if (enabledCount === 1 && total >= 4) {
      hintEl.textContent = "You're running lean, just one feed here.";
    } else {
      hintEl.textContent = `${enabledCount} of ${total} feeds are running.`;
    }
  }

  drawerSearch = '';
  const drawerSearchInput = document.getElementById('drawer-search-input');
  if (drawerSearchInput) drawerSearchInput.value = '';
  const drawerSearchWrap = document.getElementById('drawer-search-container');
  if (drawerSearchWrap) drawerSearchWrap.classList.remove('has-value');

  renderDrawerSourcesList();
  overlay.classList.add('open');
}

function renderDrawerSourcesList() {
  const stack = document.getElementById('drawer-sources-stack');
  if (!stack || !activeDrawerFolder) return;

  stack.innerHTML = '';
  const folder = activeDrawerFolder;
  const folderKey = getFolderKey(folder);
  const sources = folder.sources || [];

  if (sources.length === 0) {
    stack.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem; padding: 20px 0;">This folder has no individual sources to customize.</div>`;
    return;
  }

  const query = drawerSearch.toLowerCase().trim();
  const filteredSources = sources.filter((source) => query === '' || getSourceName(source).toLowerCase().includes(query));

  if (filteredSources.length === 0) {
    stack.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem; padding: 20px 0;">No sources matching "${escapeHtml(drawerSearch)}".</div>`;
    return;
  }

  // Reorder arrows are only safe to show against the full, unfiltered list.
  const showArrows = reorderMode && query === '';

  filteredSources.forEach((source) => {
    const srcIdx = sources.indexOf(source);
    const sourceKey = getSourceKey(source);
    const isSelected = selectedMap[folderKey] && selectedMap[folderKey][sourceKey];

    const row = document.createElement('div');
    row.className = `source-row-item ${isSelected ? 'selected' : ''} ${showArrows ? 'reorder-active' : ''}`;

    const mediaPill = source.mediaType ? source.mediaType : (source.type ? source.type.toUpperCase() : 'All');
    const rawProvider = source.provider ? source.provider.toLowerCase() : 'tmdb';
    const providerPill = rawProvider;
    const providerLabel = getProviderLabel(source);

    const leadControl = showArrows
      ? reorderArrowsHtml(srcIdx === 0, srcIdx === sources.length - 1)
      : `<div class="source-checkbox-container">
           <div class="source-checkbox-visual">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="20 6 9 17 4 12"></polyline>
             </svg>
           </div>
         </div>`;

    row.innerHTML = `
      ${leadControl}
      <div class="source-info-combo">
        <span class="source-row-title">${highlightMatch(getSourceName(source), query)}</span>
        <div class="source-meta-tag-row">
          <span class="source-meta-pill provider-${providerPill}" title="${providerLabel}">${providerLabel}</span>
          <span class="source-meta-pill">${mediaPill}</span>
          ${source.traktListId ? `<span class="source-meta-pill" style="font-size:0.65rem;color:var(--text-muted);">List: ${source.traktListId}</span>` : ''}
          ${source.sortBy ? `<span class="source-meta-pill" style="font-size:0.65rem;color:var(--text-muted);" title="${source.sortBy}">${sortLabel(source.sortBy)}</span>` : ''}
        </div>
      </div>
    `;

    if (showArrows) {
      row.querySelectorAll('.reorder-arrow').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const dir = parseInt(btn.getAttribute('data-dir'), 10);
          moveItem(sources, srcIdx, dir);
          renderDrawerSourcesList();
        });
      });
    } else {
      row.addEventListener('click', () => {
        if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
        selectedMap[folderKey][sourceKey] = !isSelected;
        renderDrawerSourcesList();
        renderFolderGrid();
        renderSidebar();
        renderCategoryActions();
        updateControlCenterStats();

        const stats = getCategorySelectionStats(currentCategoryIdx);
        const subtitleEl = document.getElementById('view-subtitle');
        if (subtitleEl && !isGuideActive && !isPreviewActive) {
          subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
        }
      });
    }

    stack.appendChild(row);
  });
}

function closeDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  if (overlay) overlay.classList.remove('open');
  activeDrawerFolder = null;
}

// ==========================================================================
// 8. CONTROL CENTER STATS
// ==========================================================================

function updateControlCenterStats() {
  let selectedFolders = 0;
  let totalFolders = 0;
  let selectedSources = 0;
  let totalSources = 0;

  database.forEach(category => {
    if (!category.folders) return;
    category.folders.forEach(folder => {
      totalFolders++;
      const folderKey = getFolderKey(folder);
      const sources = folder.sources || [];
      totalSources += sources.length;

      let folderHasActiveSource = false;
      sources.forEach(source => {
        if (selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(source)]) {
          selectedSources++;
          folderHasActiveSource = true;
        }
      });

      if (folderHasActiveSource) selectedFolders++;
    });
  });

  const estBytes = (selectedFolders * 1350) + (selectedSources * 420) + 5120;
  const estSizeKB = (estBytes / 1024).toFixed(1);

  setStatValue(document.getElementById('selected-folders-count'), `${selectedFolders} of ${totalFolders}`, false);
  setStatValue(document.getElementById('selected-sources-count'), `${selectedSources} of ${totalSources}`, false);
  checkSyncState();
}

// Write a stat value, and give it a brief pulse only when it actually changed
// (this runs on every render, so unconditional animation would never settle).
function setStatValue(el, html, isHtml) {
  if (!el) return;
  const current = isHtml ? el.innerHTML : el.textContent;
  if (current === html) return;
  if (isHtml) el.innerHTML = html; else el.textContent = html;
  el.classList.remove('stat-bumped');
  void el.offsetWidth;
  el.classList.add('stat-bumped');
}

// ==========================================================================
// 9. EXPORT & DOWNLOAD
// ==========================================================================

function updateRowsWarning(selectEl) {
  const existing = document.getElementById('rows-warn-badge');
  if (selectEl.value === 'ROWS') {
    if (!existing) {
      const badge = document.createElement('span');
      badge.id = 'rows-warn-badge';
      badge.className = 'rows-warn-badge';
      badge.textContent = '⚠ Doesn\'t work on Nuvio Mobile';
      selectEl.parentNode.insertAdjacentElement('afterend', badge);
    }
  } else {
    if (existing) existing.remove();
  }
}

// The view mode written to every exported collection. When the user opted into
// the mobile-optimize box, any incompatible mode is rewritten to TABBED_GRID.
function computeExportViewMode(optimize) {
  if (optimize && (selectedViewMode === 'ROWS' || selectedViewMode === 'FOLLOW_LAYOUT')) {
    return 'TABBED_GRID';
  }
  return selectedViewMode;
}

function compileAndDownloadJSON() {
  const popup = document.getElementById('popup-overlay');
  if (popup) popup.classList.add('open');

  setTimeout(() => {
    const customConfig = assembleFilteredDatabase();

    const blob = new Blob([JSON.stringify(customConfig, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const link = document.createElement('a');
    link.href = url;
    link.download = `nuvio_custom_collection_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (popup) popup.classList.remove('open');
    showToast("Your custom collection file has been downloaded.", "success");
    window.KaptainTelemetry.hit('deployments');
  }, 900);
}

// `optimize` defaults to the flag decided by the most recent compat gate, so the
// wizard's no-arg calls stay consistent with what the user chose.
function assembleFilteredDatabase(optimize) {
  const opt = (optimize === undefined) ? lastExportOptimize : optimize;
  const exportViewMode = computeExportViewMode(opt);
  const customConfig = [];

  database.forEach(category => {
    if (!category.folders) return;
    const categoryClone = { ...category };
    const filteredFolders = [];

    category.folders.forEach(folder => {
      const folderKey = getFolderKey(folder);
      const sources = folder.sources || [];
      const activeSources = [];

      sources.forEach(source => {
        if (selectedMap[folderKey] && selectedMap[folderKey][getSourceKey(source)]) {
          activeSources.push({ ...source });
        }
      });

      if (activeSources.length > 0) {
        const folderClone = { ...folder };
        folderClone.sources = activeSources;
        if (!gifsAllowedForCategory(category)) delete folderClone.focusGifUrl;
        filteredFolders.push(folderClone);
      }
    });

    if (filteredFolders.length > 0) {
      categoryClone.folders = filteredFolders;
      categoryClone.viewMode = exportViewMode;
      customConfig.push(categoryClone);
    }
  });

  return customConfig;
}

// Gate any export/push behind the mobile-compatibility check. TABBED_GRID is
// already safe, so it runs the action immediately; ROWS / FOLLOW_LAYOUT first
// show the warning modal and let the user opt into auto-optimizing.
// `checkTmdb` defaults to true but is turned off for entry points that fire
// before the user has had any chance to enter a TMDB key (e.g. the title
// screen's "Easy Install", which opens straight into the wizard) — showing
// it there would be unresolvable noise. The real push moment (wizard's
// "Load my collection into Nuvio" button) re-checks it itself, once a key
// could plausibly have been provided.
function ensureMobileCompat(actionFn, opts) {
  if (typeof actionFn !== 'function') return;
  const { checkRows = true, checkTmdb = true } = opts || {};
  const overlay = document.getElementById('compat-overlay');
  const needsRowsWarning = checkRows && (selectedViewMode === 'ROWS' || selectedViewMode === 'FOLLOW_LAYOUT');
  const needsTmdbWarning = checkTmdb && !hasTmdbKey();

  if ((!needsRowsWarning && !needsTmdbWarning) || !overlay) {
    lastExportOptimize = false;
    actionFn();
    return;
  }

  const titleEl = document.getElementById('compat-title');
  const rowsSection = document.getElementById('compat-rows-warning');
  const tmdbSection = document.getElementById('compat-tmdb-warning');
  if (rowsSection) rowsSection.style.display = needsRowsWarning ? '' : 'none';
  if (tmdbSection) tmdbSection.style.display = needsTmdbWarning ? '' : 'none';
  if (titleEl) {
    titleEl.textContent = needsRowsWarning && needsTmdbWarning
      ? 'Heads up: a couple things'
      : needsTmdbWarning
        ? 'Heads up: TMDB API key'
        : 'Heads up: Rows mode & mobile';
  }

  const checkbox = document.getElementById('compat-optimize-check');
  const continueBtn = document.getElementById('compat-continue');
  const keepBtn = document.getElementById('compat-keep');
  if (keepBtn) keepBtn.style.display = needsRowsWarning ? '' : 'none';
  if (checkbox) checkbox.checked = true;  // default to the mobile-safe choice

  const cleanup = () => {
    overlay.classList.remove('open');
    if (continueBtn) continueBtn.removeEventListener('click', onContinue);
    if (keepBtn) keepBtn.removeEventListener('click', onKeep);
    overlay.removeEventListener('click', onBackdrop);
  };
  const proceed = (optimize) => {
    // Only touch the export's optimize flag when the Rows/mobile section was
    // actually shown — a TMDB-only modal (checkRows: false) must not clobber
    // a decision already made by an earlier, separate Rows-mode check.
    if (needsRowsWarning) lastExportOptimize = optimize;
    cleanup();
    actionFn();
  };
  const onContinue = () => proceed(!!(checkbox && checkbox.checked));
  const onKeep = () => proceed(false);
  const onBackdrop = (e) => {
    if (e.target !== overlay) return;
    proceed(false);
    showToast('Kept your current view mode.', 'success');
  };

  if (continueBtn) continueBtn.addEventListener('click', onContinue);
  if (keepBtn) keepBtn.addEventListener('click', onKeep);
  overlay.addEventListener('click', onBackdrop);

  overlay.classList.add('open');
}

// Exposed for wizard.js so "Send to Nuvio" routes through the same gate.
window.KaptainExport = {
  ensureMobileCompat,
  compileAndDownloadJSON,
  assembleFilteredDatabase,
  setLastExportOptimize: (val) => { lastExportOptimize = !!val; },
};

// ==========================================================================
// 10. EVENT BINDINGS
// ==========================================================================

// ---- Keyboard shortcuts help --------------------------------------------
function toggleShortcutPanel(force) {
  const overlay = document.getElementById('shortcut-overlay');
  if (!overlay) return;
  const willOpen = (force === undefined) ? !overlay.classList.contains('open') : force;
  overlay.classList.toggle('open', willOpen);
}

function bindGlobalEvents() {
  // Search filter (+ clear button visibility)
  const searchInput = document.getElementById('dashboard-search');
  const searchWrap = document.getElementById('search-container');
  const searchClear = document.getElementById('search-clear');
  const syncSearchClear = () => {
    if (searchWrap) searchWrap.classList.toggle('has-value', !!(searchInput && searchInput.value));
  };
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      syncSearchClear();
      renderFolderGrid();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      currentSearch = '';
      syncSearchClear();
      renderFolderGrid();
    });
  }

  // Card size zoom slider
  const zoomSlider = document.getElementById('grid-zoom');
  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
      gridSize = parseInt(e.target.value);
      const grid = document.getElementById('media-grid');
      if (grid) {
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${gridSize}px, 1fr))`;
      }
    });
  }

  // Drawer close
  const drawerOverlay = document.getElementById('drawer-overlay');
  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
  const drawerCloseBtn = document.getElementById('drawer-close');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);

  // Drawer select-all / select-none (scoped to the open folder's sources)
  const drawerRefreshAfterToggle = () => {
    renderDrawerSourcesList();
    renderFolderGrid();
    renderSidebar();
    renderCategoryActions();
    updateControlCenterStats();
  };
  const drawerSelectAll = document.getElementById('drawer-select-all');
  if (drawerSelectAll) {
    drawerSelectAll.addEventListener('click', () => {
      if (!activeDrawerFolder) return;
      const folderKey = getFolderKey(activeDrawerFolder);
      if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
      (activeDrawerFolder.sources || []).forEach((source) => {
        selectedMap[folderKey][getSourceKey(source)] = true;
      });
      drawerRefreshAfterToggle();
    });
  }
  const drawerSelectNone = document.getElementById('drawer-select-none');
  if (drawerSelectNone) {
    drawerSelectNone.addEventListener('click', () => {
      if (!activeDrawerFolder) return;
      const folderKey = getFolderKey(activeDrawerFolder);
      if (!selectedMap[folderKey]) selectedMap[folderKey] = {};
      (activeDrawerFolder.sources || []).forEach((source) => {
        selectedMap[folderKey][getSourceKey(source)] = false;
      });
      drawerRefreshAfterToggle();
    });
  }

  // Drawer source search filter (+ clear button visibility)
  const drawerSearchInput = document.getElementById('drawer-search-input');
  const drawerSearchWrap = document.getElementById('drawer-search-container');
  const drawerSearchClear = document.getElementById('drawer-search-clear');
  const syncDrawerSearchClear = () => {
    if (drawerSearchWrap) drawerSearchWrap.classList.toggle('has-value', !!(drawerSearchInput && drawerSearchInput.value));
  };
  if (drawerSearchInput) {
    drawerSearchInput.addEventListener('input', (e) => {
      drawerSearch = e.target.value;
      syncDrawerSearchClear();
      renderDrawerSourcesList();
    });
  }
  if (drawerSearchClear) {
    drawerSearchClear.addEventListener('click', () => {
      if (drawerSearchInput) { drawerSearchInput.value = ''; drawerSearchInput.focus(); }
      drawerSearch = '';
      syncDrawerSearchClear();
      renderDrawerSourcesList();
    });
  }

  // Download button (gated by the mobile-compatibility check)
  const btnCompile = document.getElementById('btn-compile-download');
  if (btnCompile) btnCompile.addEventListener('click', () => ensureMobileCompat(compileAndDownloadJSON, { checkTmdb: false }));

  // Mobile-only FAB — collapses the Browse bar (stats + Download + Send to
  // Nuvio) behind one button on phones. The bar's own DOM is static (never
  // rebuilt), so a plain class toggle is enough; no extra state variable.
  const controlFab = document.getElementById('control-fab');
  const controlBar = document.getElementById('control-center-bar');
  if (controlFab && controlBar) {
    controlFab.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = controlBar.classList.toggle('open');
      controlFab.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (controlBar.classList.contains('open') && !controlBar.contains(e.target)) {
        controlBar.classList.remove('open');
        controlFab.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // View Mode selector (per-browser; persisted)
  const viewModeSelect = document.getElementById('viewmode-select');
  if (viewModeSelect) {
    viewModeSelect.value = selectedViewMode;
    updateRowsWarning(viewModeSelect);
    viewModeSelect.addEventListener('change', () => {
      selectedViewMode = viewModeSelect.value;
      try { localStorage.setItem('kaptain_view_mode', selectedViewMode); } catch (e) { /* ignore */ }
      updateRowsWarning(viewModeSelect);
    });
  }

  // Folder sort (operates on the current section)
  const folderSort = document.getElementById('folder-sort');
  if (folderSort) {
    folderSort.addEventListener('change', () => applyFolderSort(folderSort.value));
  }

  // Source sort (drawer)
  const drawerSort = document.getElementById('drawer-sort');
  if (drawerSort) {
    drawerSort.addEventListener('change', () => {
      if (activeDrawerFolder && (drawerSort.value === 'az' || drawerSort.value === 'za')) {
        sortByTitle(activeDrawerFolder.sources || [], drawerSort.value);
        renderDrawerSourcesList();
      }
    });
  }

  // Reorder toggle
  const btnReorder = document.getElementById('btn-reorder-toggle');
  if (btnReorder) {
    btnReorder.addEventListener('click', () => {
      reorderMode = !reorderMode;
      updateReorderBanner();
      btnReorder.classList.toggle('active', reorderMode);
      renderSidebar();
      renderFolderGrid();
      if (activeDrawerFolder) renderDrawerSourcesList();
      const subtitleEl = document.getElementById('view-subtitle');
      if (subtitleEl && !isGuideActive && !isPreviewActive) {
        if (reorderMode) {
          subtitleEl.textContent = 'Reorder mode: use the ▲ ▼ arrows to move sections, folders & sources. Click Reorder again to finish.';
        } else {
          const stats = getCategorySelectionStats(currentCategoryIdx);
          subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
        }
      }
    });
  }

  // Mobile top-bar "more" dropdown (view mode / sort / reorder / zoom)
  const topbarMoreToggle = document.getElementById('topbar-more-toggle');
  const topbarMorePanel = document.getElementById('topbar-more-panel');
  if (topbarMoreToggle && topbarMorePanel) {
    topbarMoreToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = topbarMorePanel.classList.toggle('open');
      topbarMoreToggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!topbarMorePanel.classList.contains('open')) return;
      if (e.target === topbarMoreToggle || topbarMoreToggle.contains(e.target)) return;
      if (topbarMorePanel.contains(e.target)) return;
      topbarMorePanel.classList.remove('open');
      topbarMoreToggle.setAttribute('aria-expanded', 'false');
    });
  }

  // Sidebar overlay toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) sidebarToggle.addEventListener('click', () =>
    document.querySelector('.sidebar').classList.contains('open') ? closeSidebar() : openSidebar()
  );
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebar);
  document.getElementById('category-scroller')?.addEventListener('click', () =>
    setTimeout(closeSidebar, 120)
  );

  // Replay walkthrough button
  const btnReplay = document.getElementById('btn-replay-tour');
  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      startWalkthrough();
    });
  }

  // Title screen actions
  document.getElementById('title-changelog-dismiss')?.addEventListener('click', dismissChangelogBanner);
  document.getElementById('title-screen-walkthrough')?.addEventListener('click', () => {
    hideTitleScreen();
    startWalkthrough();
  });
  document.getElementById('title-screen-start')?.addEventListener('click', () => {
    const prevAnswers = localStorage.getItem('kaptain_quiz_answers');
    const quizOverlay = document.getElementById('quiz-overlay');
    if (!prevAnswers && quizOverlay) {
      quizOverlay.hidden = false;
      initQuizScreen(1);
    } else {
      hideTitleScreen();
    }
  });
  document.getElementById('title-screen-import-all')?.addEventListener('click', () => {
    hideTitleScreen();
    initializeSelections();
    renderSidebar();
    if (isPreviewActive) renderPreviewCollection();
    window.NuvioWizard && window.NuvioWizard.open({ skipChoose: true });
  });
  document.getElementById('title-screen-collection-only')?.addEventListener('click', () => {
    hideTitleScreen();
    initializeSelections();
    renderSidebar();
    if (isPreviewActive) renderPreviewCollection();
    window.NuvioWizard && window.NuvioWizard.open({ skipChoose: true, flow: 'collection-only' });
  });
  // Quick (KISS) editor entry + controls
  bindSimpleEditorEvents();

  // Walkthrough button handlers
  const btnNext = document.getElementById('wt-btn-next');
  const btnPrev = document.getElementById('wt-btn-prev');
  const btnSkip = document.getElementById('wt-btn-skip');

  if (btnNext) btnNext.addEventListener('click', walkthroughNext);
  if (btnPrev) btnPrev.addEventListener('click', walkthroughPrev);
  if (btnSkip) btnSkip.addEventListener('click', endWalkthrough);

  // Keyboard shortcuts help panel
  const shortcutOverlay = document.getElementById('shortcut-overlay');
  if (shortcutOverlay) {
    shortcutOverlay.addEventListener('click', (e) => { if (e.target === shortcutOverlay) toggleShortcutPanel(false); });
    document.getElementById('shortcut-close')?.addEventListener('click', () => toggleShortcutPanel(false));
  }

  // TV remote / arrow-key navigation inside the Nuvio preview
  document.addEventListener('keydown', handlePreviewKeydown);

  // "?" toggles the shortcuts help (ignored while typing in a field)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '?') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    e.preventDefault();
    toggleShortcutPanel();
  });

  // ESC key to close the shortcuts panel, drawer, or end the walkthrough
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const shortcuts = document.getElementById('shortcut-overlay');
      if (shortcuts && shortcuts.classList.contains('open')) { toggleShortcutPanel(false); return; }
      if (document.getElementById('preview-detail')) { closePreviewDetail(); return; }
      if (walkthroughActive) {
        endWalkthrough();
      } else {
        closeDrawer();
      }
    }
  });
}

// ==========================================================================
// 10b. CINEMATIC TITLE SCREEN
// ==========================================================================

function showTitleScreen() {
  const overlay = document.getElementById('title-screen-overlay');
  const versionEl = document.getElementById('title-screen-version');
  if (versionEl) versionEl.textContent = KAPTAIN_UPDATED;
  if (overlay) overlay.classList.add('active');
  renderChangelogBanner();
}

function hideTitleScreen() {
  document.getElementById('title-screen-overlay')?.classList.remove('active');
}

function getLastSeenVersion() {
  try { return localStorage.getItem('kaptain_last_seen_version'); } catch (e) { return null; }
}

function setLastSeenVersion(version) {
  try { localStorage.setItem('kaptain_last_seen_version', version); } catch (e) {}
}

function renderChangelogBanner() {
  const banner = document.getElementById('title-screen-changelog');
  const listEl = document.getElementById('title-changelog-list');
  if (!banner || !listEl) return;

  const lastSeen = getLastSeenVersion();

  if (lastSeen == null) {
    // First-ever visit: nothing to compare against, so stay quiet and just start tracking.
    setLastSeenVersion(KAPTAIN_VERSION);
    banner.style.display = 'none';
    return;
  }

  if (lastSeen === KAPTAIN_VERSION) {
    banner.style.display = 'none';
    return;
  }

  const idx = CHANGELOG.findIndex((entry) => entry.version === lastSeen);
  // If their stored version isn't in the list at all (very stale), just show the latest entry
  // rather than dumping the entire history.
  const newEntries = idx === -1 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, idx);

  if (newEntries.length === 0) {
    banner.style.display = 'none';
    return;
  }

  listEl.innerHTML = newEntries.flatMap((entry) => entry.items).map((item) => `<li>${item}</li>`).join('');
  banner.style.display = '';
}

function dismissChangelogBanner() {
  setLastSeenVersion(KAPTAIN_VERSION);
  const banner = document.getElementById('title-screen-changelog');
  if (banner) banner.style.display = 'none';
}

// ==========================================================================
// 10c. QUICK (KISS) EDITOR — dense, single-page manager + inline settings
// ==========================================================================
// Reuses the same `database` / `selectedMap` and read helpers as the cinematic
// editor, but renders its own compact DOM and uses no-op-free selection mutators
// (the cinematic toggles re-render the hidden grid, so we avoid them here).

let seExpanded = new Set();            // folder keys currently expanded
let seAddons = null;                   // [{name,url,note,checked}] addon checklist
const seSettings = { profileName: '', avatarUrl: '', torboxKey: '', tmdbKey: '', mdblistKey: '' };

// TMDB key is only ever collected via the Quick Editor's settings field — the
// mobile-compat export gate checks this to warn when mobile playback will break.
// Reads the live input directly too, in case the field was edited but seGatherSettings()
// (called on Send/addon-add) hasn't run yet.
function hasTmdbKey() {
  const live = document.getElementById('se-tmdb-key');
  const val = (live ? live.value : seSettings.tmdbKey) || '';
  return !!val.trim();
}

function seFindFolder(fkey, ci) {
  return (database[ci] && database[ci].folders || []).find(f => getFolderKey(f) === fkey);
}
function seSetFolder(folder, on) {
  const k = getFolderKey(folder);
  if (!selectedMap[k]) selectedMap[k] = {};
  (folder.sources || []).forEach(s => { selectedMap[k][getSourceKey(s)] = on; });
}
function seSetCategory(ci, on) {
  (database[ci] && database[ci].folders || []).forEach(f => seSetFolder(f, on));
}

function openSimpleEditor() {
  hideTitleScreen();
  const ov = document.getElementById('simple-editor-overlay');
  if (!ov) return;
  ov.classList.add('open');
  renderSimpleCollection();
  renderSimpleSettings();
}
// Also used by the Quick Editor's own "‹ Menu" back button — routing through
// the title screen here used to wipe selectedMap (its CTAs call
// initializeSelections()), silently discarding the user's curation.
function backToCinematicEditor() {
  document.getElementById('simple-editor-overlay')?.classList.remove('open');
  hideTitleScreen();
  isPreviewActive = true;
  renderPreviewCollection();
}

function seSearchQuery() {
  return (document.getElementById('se-search')?.value || '').toLowerCase().trim();
}

function renderSimpleCollection() {
  const host = document.getElementById('se-collection');
  if (!host) return;
  const q = seSearchQuery();
  let html = '';
  database.forEach((cat, ci) => {
    const folders = (cat.folders || []).filter(f => !q || (f.title || '').toLowerCase().includes(q));
    if (q && folders.length === 0) return;
    const stats = getCategorySelectionStats(ci);
    html += `<div class="se-cat" data-ci="${ci}">
      <div class="se-cat-head">
        <span class="se-cat-name">${escapeHtml((cat.emoji ? cat.emoji + ' ' : '') + (cat.title || ''))}</span>
        <span class="se-cat-count" id="se-catcount-${ci}">${stats.selectedFolders}/${stats.totalFolders}</span>
        <button class="se-mini-btn" data-catall="${ci}">All</button>
        <button class="se-mini-btn" data-catnone="${ci}">None</button>
      </div>
      <div class="se-folders">${folders.map(f => seFolderRowHtml(f, ci)).join('')}</div>
    </div>`;
  });
  host.innerHTML = html || '<div class="se-empty">No folders match your search.</div>';
}

function seFolderRowHtml(folder, ci) {
  const key = getFolderKey(folder);
  const st = getFolderSourceCountStats(folder);
  const on = st.active > 0;
  const expanded = seExpanded.has(key);
  return `<div class="se-folder ${on ? 'on' : ''}" data-fkey="${escapeHtml(key)}" data-ci="${ci}">
    <div class="se-folder-row">
      <label class="se-folder-main">
        <input type="checkbox" class="se-folder-check" ${on ? 'checked' : ''}>
        <span class="se-folder-title">${escapeHtml(folder.title || 'Untitled')}</span>
      </label>
      <span class="se-folder-count">${st.active}/${st.total}</span>
      <button class="se-folder-expand" title="Edit sources">${expanded ? '▾' : '▸'}</button>
    </div>
    <div class="se-sources" ${expanded ? '' : 'hidden'}>${expanded ? seSourcesHtml(folder) : ''}</div>
  </div>`;
}

function seSourcesHtml(folder) {
  const fkey = getFolderKey(folder);
  return (folder.sources || []).map(src => {
    const skey = getSourceKey(src);
    const on = selectedMap[fkey] && selectedMap[fkey][skey];
    return `<label class="se-source">
      <input type="checkbox" class="se-source-check" data-skey="${escapeHtml(skey)}" ${on ? 'checked' : ''}>
      <span class="se-source-title">${escapeHtml(getSourceName(src))}</span>
      <span class="se-source-meta">${escapeHtml(src.provider === 'addon' ? getProviderLabel(src) : [src.provider, src.mediaType].filter(Boolean).join(' · '))}</span>
    </label>`;
  }).join('');
}

function seUpdateFolderRow(row, folder, ci) {
  const st = getFolderSourceCountStats(folder);
  row.classList.toggle('on', st.active > 0);
  const cnt = row.querySelector('.se-folder-count');
  if (cnt) cnt.textContent = `${st.active}/${st.total}`;
  const chk = row.querySelector('.se-folder-check');
  if (chk) chk.checked = st.active > 0;
  const el = document.getElementById('se-catcount-' + ci);
  if (el) { const s = getCategorySelectionStats(ci); el.textContent = `${s.selectedFolders}/${s.totalFolders}`; }
}

function seToggleSources(row) {
  const fkey = row.dataset.fkey;
  const folder = seFindFolder(fkey, +row.dataset.ci);
  const box = row.querySelector('.se-sources');
  const exp = row.querySelector('.se-folder-expand');
  if (seExpanded.has(fkey)) {
    seExpanded.delete(fkey); box.hidden = true; box.innerHTML = ''; exp.textContent = '▸';
  } else {
    seExpanded.add(fkey); box.innerHTML = seSourcesHtml(folder); box.hidden = false; exp.textContent = '▾';
  }
}

// ----- settings panel -----
function seEnsureAddons() {
  if (!seAddons) {
    const src = (window.NuvioWizard && window.NuvioWizard.SUGGESTED_ADDONS) || [];
    seAddons = src.map(a => ({ name: a.name, url: a.url, note: a.note || '', checked: !!a.recommended }));
  }
  return seAddons;
}
function seGatherSettings() {
  const g = id => document.getElementById(id);
  if (g('se-profile-name')) seSettings.profileName = g('se-profile-name').value.trim();
  if (g('se-avatar-url')) seSettings.avatarUrl = g('se-avatar-url').value.trim();
  if (g('se-torbox-key')) seSettings.torboxKey = g('se-torbox-key').value.trim();
  if (g('se-tmdb-key')) seSettings.tmdbKey = g('se-tmdb-key').value.trim();
  if (g('se-mdblist-key')) seSettings.mdblistKey = g('se-mdblist-key').value.trim();
}
function seAddonRowHtml(a, i) {
  return `<label class="se-addon">
    <input type="checkbox" class="se-addon-check" data-i="${i}" ${a.checked ? 'checked' : ''}>
    <span class="se-addon-name">${escapeHtml(a.name)}</span>
    <button class="se-addon-rm" data-rm="${i}" title="Remove">&times;</button>
  </label>`;
}
function renderSimpleSettings() {
  const host = document.getElementById('se-settings');
  if (!host) return;
  const addons = seEnsureAddons();
  const v = s => escapeHtml(s || '').replace(/"/g, '&quot;');
  host.innerHTML = `
    <p class="se-settings-intro">The full settings panel: edit folders, sources, and API keys directly. No wizard steps.</p>
    <h3 class="se-sec-title">Profile</h3>
    <label class="se-field">Profile name
      <input id="se-profile-name" class="se-input" value="${v(seSettings.profileName)}" placeholder="Kaptain's Collection">
    </label>
    <label class="se-field">Profile image URL <span class="se-hint">(public link)</span>
      <input id="se-avatar-url" class="se-input" value="${v(seSettings.avatarUrl)}" placeholder="https://…/image.jpg">
    </label>
    <div class="se-avatar-wrap"><img id="se-avatar-preview" class="se-avatar-preview" alt=""></div>

    <h3 class="se-sec-title">Streaming</h3>
    <label class="se-field">Torbox API key
      <input id="se-torbox-key" class="se-input" value="${v(seSettings.torboxKey)}" placeholder="xxxxxxxx-xxxx-…" autocomplete="off" spellcheck="false">
    </label>
    <div class="se-key-status" id="se-torbox-status"></div>
    <div class="se-field">
      <span class="se-field-label">Scraper addons</span>
      <div id="se-addon-list" class="se-addon-list">${addons.map((a, i) => seAddonRowHtml(a, i)).join('')}</div>
      <div class="se-addon-add">
        <input id="se-addon-name" class="se-input" placeholder="Name">
        <input id="se-addon-url" class="se-input" placeholder="manifest URL">
        <button id="se-addon-add-btn" class="se-mini-btn">Add</button>
      </div>
    </div>

    <h3 class="se-sec-title">Integrations</h3>
    <label class="se-field">TMDB API key <span class="se-hint">(optional)</span>
      <input id="se-tmdb-key" class="se-input" value="${v(seSettings.tmdbKey)}" placeholder="TMDB v4 key" autocomplete="off">
    </label>
    <label class="se-field">MDBList API key <span class="se-hint">(optional)</span>
      <input id="se-mdblist-key" class="se-input" value="${v(seSettings.mdblistKey)}" placeholder="MDBList key" autocomplete="off">
    </label>
    <p class="se-note">Trakt is connected inside the Nuvio app (it needs a sign-in).</p>

    <h3 class="se-sec-title">Genres</h3>
    <p class="se-note" style="margin-bottom:8px;">Toggle a genre on/off everywhere it appears — Streaming Services, Genres, Networks, all at once.</p>
    <div class="se-genre-list">${getAllGenres().map(g => {
      const st = getGenreSelectionState(g);
      return `<label class="se-genre-row">
        <input type="checkbox" class="se-genre-check" data-genre="${v(g)}" ${st ? 'checked' : ''} ${st === null ? 'data-indeterminate="1"' : ''}>
        <span>${v(g)}</span>
      </label>`;
    }).join('')}</div>

    <h3 class="se-sec-title">Hover Effects</h3>
    <p class="se-note" style="margin-bottom:8px;">Turn off the animated hover/focus effect on folder cards, in Nuvio itself as well as here.</p>
    <div class="se-genre-list">
      <label class="se-genre-row">
        <input type="checkbox" id="se-gif-disable-streaming" ${gifDisableStreaming ? 'checked' : ''}>
        <span>Disable on Streaming Services</span>
      </label>
      <label class="se-genre-row">
        <input type="checkbox" id="se-gif-disable-other" ${gifDisableOther ? 'checked' : ''}>
        <span>Disable everywhere else</span>
      </label>
    </div>`;
  wireSimpleSettings();
  document.querySelectorAll('.se-genre-check[data-indeterminate]').forEach(cb => { cb.indeterminate = true; });
}
function wireSimpleSettings() {
  const tk = document.getElementById('se-torbox-key');
  const stat = document.getElementById('se-torbox-status');
  if (tk && stat) {
    const upd = () => { stat.innerHTML = (window.NuvioWizard && window.NuvioWizard.torboxStatusHtml) ? window.NuvioWizard.torboxStatusHtml(tk.value) : ''; };
    tk.addEventListener('input', upd); upd();
  }
  const av = document.getElementById('se-avatar-url');
  const img = document.getElementById('se-avatar-preview');
  if (av && img) {
    const upd = () => { const u = av.value.trim(); if (u) { img.src = u; img.style.display = 'block'; } else { img.style.display = 'none'; } };
    av.addEventListener('input', upd); upd();
  }
  const list = document.getElementById('se-addon-list');
  if (list) {
    list.addEventListener('change', e => {
      if (e.target.classList.contains('se-addon-check')) { const i = +e.target.dataset.i; if (seAddons[i]) seAddons[i].checked = e.target.checked; }
    });
    list.addEventListener('click', e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { seGatherSettings(); seAddons.splice(+rm.dataset.rm, 1); renderSimpleSettings(); }
    });
  }
  const addBtn = document.getElementById('se-addon-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    const n = document.getElementById('se-addon-name');
    const u = document.getElementById('se-addon-url');
    const url = (u && u.value || '').trim();
    if (!url) { showToast('Enter the addon’s manifest link to add it.', 'error'); return; }
    seGatherSettings();
    seEnsureAddons().push({ name: (n && n.value || '').trim() || url, url, note: '', checked: true });
    renderSimpleSettings();
  });
  document.querySelectorAll('.se-genre-check').forEach(cb => {
    cb.addEventListener('change', () => {
      applyGenreToggle(cb.dataset.genre, cb.checked);
      renderSimpleSettings();
      renderSimpleCollection();
    });
  });
  const gifStreamingCb = document.getElementById('se-gif-disable-streaming');
  if (gifStreamingCb) gifStreamingCb.addEventListener('change', () => {
    gifDisableStreaming = gifStreamingCb.checked;
    try { localStorage.setItem('kaptain_gif_disable_streaming', gifDisableStreaming ? '1' : '0'); } catch (e) {}
    renderFolderGrid();
    renderSimpleCollection();
  });
  const gifOtherCb = document.getElementById('se-gif-disable-other');
  if (gifOtherCb) gifOtherCb.addEventListener('change', () => {
    gifDisableOther = gifOtherCb.checked;
    try { localStorage.setItem('kaptain_gif_disable_other', gifDisableOther ? '1' : '0'); } catch (e) {}
    renderFolderGrid();
    renderSimpleCollection();
  });
}

function seSend() {
  seGatherSettings();
  let compiled = [];
  try { compiled = assembleFilteredDatabase(); } catch (e) { /* ignore */ }
  if (!compiled.length) { showToast('Pick at least one folder before sending.', 'error'); return; }

  // Close the Quick Editor before opening wizard/compat overlays — they sit
  // at lower z-indexes (200/250) than the Quick Editor overlay (900) and would
  // otherwise appear hidden behind it.
  document.getElementById('simple-editor-overlay')?.classList.remove('open');
  hideTitleScreen();
  isPreviewActive = true;
  renderPreviewCollection();

  const prefill = {
    profileName: seSettings.profileName || undefined,
    avatarUrl: seSettings.avatarUrl || undefined,
    torboxKey: seSettings.torboxKey || undefined,
    tmdbKey: seSettings.tmdbKey || undefined,
    tmdbEnabled: !!seSettings.tmdbKey,
    mdblistKey: seSettings.mdblistKey || undefined,
    addons: seEnsureAddons(),
  };
  const launch = () => { if (window.NuvioWizard) window.NuvioWizard.open({ skipChoose: true, prefill }); };
  if (window.KaptainExport && typeof window.KaptainExport.ensureMobileCompat === 'function') {
    window.KaptainExport.ensureMobileCompat(launch);
  } else { launch(); }
}

function bindSimpleEditorEvents() {
  document.getElementById('title-screen-simple')?.addEventListener('click', openSimpleEditor);
  document.getElementById('btn-shortcuts-hint')?.addEventListener('click', () => toggleShortcutPanel(true));
  document.getElementById('se-back')?.addEventListener('click', backToCinematicEditor);
  document.getElementById('se-cinematic')?.addEventListener('click', backToCinematicEditor);
  document.getElementById('se-send')?.addEventListener('click', seSend);
  document.getElementById('se-search')?.addEventListener('input', renderSimpleCollection);
  document.getElementById('se-all')?.addEventListener('click', () => { database.forEach((_, ci) => seSetCategory(ci, true)); renderSimpleCollection(); });
  document.getElementById('se-none')?.addEventListener('click', () => { database.forEach((_, ci) => seSetCategory(ci, false)); renderSimpleCollection(); });

  const host = document.getElementById('se-collection');
  if (host) {
    host.addEventListener('change', e => {
      const row = e.target.closest('.se-folder');
      if (!row) return;
      const ci = +row.dataset.ci;
      const folder = seFindFolder(row.dataset.fkey, ci);
      if (!folder) return;
      if (e.target.classList.contains('se-folder-check')) {
        seSetFolder(folder, e.target.checked);
        // refresh source checkboxes if expanded
        if (seExpanded.has(row.dataset.fkey)) row.querySelector('.se-sources').innerHTML = seSourcesHtml(folder);
        seUpdateFolderRow(row, folder, ci);
      } else if (e.target.classList.contains('se-source-check')) {
        const fkey = getFolderKey(folder);
        if (!selectedMap[fkey]) selectedMap[fkey] = {};
        selectedMap[fkey][e.target.dataset.skey] = e.target.checked;
        seUpdateFolderRow(row, folder, ci);
      }
    });
    host.addEventListener('click', e => {
      const exp = e.target.closest('.se-folder-expand');
      if (exp) { seToggleSources(exp.closest('.se-folder')); return; }
      const all = e.target.closest('[data-catall]');
      if (all) { seSetCategory(+all.dataset.catall, true); renderSimpleCollection(); return; }
      const none = e.target.closest('[data-catnone]');
      if (none) { seSetCategory(+none.dataset.catnone, false); renderSimpleCollection(); return; }
    });
  }
}

// ==========================================================================
// 11. GUIDED WALKTHROUGH ENGINE
// ==========================================================================

function startWalkthrough() {
  // Capture view state before starting the walkthrough
  preWalkthroughState = {
    currentCategoryIdx: currentCategoryIdx,
    isPreviewActive: isPreviewActive,
    isGuideActive: isGuideActive
  };
  walkthroughActive = true;
  walkthroughStep = 0;
  showWalkthroughStep(0);
}

function showWalkthroughStep(index) {
  const step = WALKTHROUGH_STEPS[index];
  if (!step) return;

  walkthroughStep = index;

  // Walkthrough UX integration: automatically switch to the Preview view on the preview step
  if (step.view === 'preview') {
    isPreviewActive = true;
    isGuideActive = false;
    switchCategory(-2);
  } else {
    // If we are on other steps but the preview view was temporarily activated, restore the previous state
    if (isPreviewActive && preWalkthroughState && !preWalkthroughState.isPreviewActive) {
      isPreviewActive = preWalkthroughState.isPreviewActive;
      isGuideActive = preWalkthroughState.isGuideActive;
      currentCategoryIdx = preWalkthroughState.currentCategoryIdx;
      switchCategory(currentCategoryIdx);
    }
  }

  const overlay = document.getElementById('walkthrough-overlay');
  const spotlight = document.getElementById('walkthrough-spotlight');
  const tooltip = document.getElementById('walkthrough-tooltip');
  const titleEl = document.getElementById('wt-title');
  const bodyEl = document.getElementById('wt-body');
  const dotsEl = document.getElementById('wt-dots');
  const labelEl = document.getElementById('wt-step-label');
  const miniCounter = document.getElementById('wt-mini-counter');
  const btnNext = document.getElementById('wt-btn-next');
  const btnPrev = document.getElementById('wt-btn-prev');
  const btnSkip = document.getElementById('wt-btn-skip');

  // Show overlay
  overlay.classList.add('active');

  // Fade out tooltip while repositioning
  tooltip.classList.remove('visible');

  // Resolve the target now (sidebar contents are always in the DOM, just
  // translated off-screen when closed) so we can open/close the sidebar
  // immediately and give its slide transition time to finish before any
  // position is measured below.
  const targetEl = step.target ? document.querySelector(step.target) : null;
  const needsSidebar = !!(targetEl && targetEl.closest('.sidebar'));
  if (needsSidebar) openSidebar(); else closeSidebar();

  // On phones, the entire preview bar (⋯ / Download / Send to Nuvio, plus
  // whatever ⋯ reveals) lives behind a FAB — expand it before checking the
  // nested "more" panel below. No-op on desktop (always visible there).
  const needsPreviewBar = !!(targetEl && targetEl.closest('.nv-preview-content'));
  if (needsPreviewBar) openPreviewBar(); else closePreviewBar();

  // On phones, the device toggle / reorder / layout / help controls live
  // inside the collapsed "more" panel — expand it before measuring so the
  // spotlight lands on a visible target. No-op on desktop (panel is always
  // visible there regardless of the .open class).
  const needsPreviewSecondary = !!(targetEl && targetEl.closest('#nv-preview-secondary'));
  if (needsPreviewSecondary) openPreviewSecondary(); else closePreviewSecondary();

  // The sidebar's slide transition is --transition-normal (300ms); give it
  // room to finish so we never measure a target mid-animation.
  const delay = needsSidebar ? 360 : 130;

  setTimeout(() => {
    // Update content
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    btnNext.textContent = step.nextLabel || 'Next';

    // Mini counter (replaces old "Step X of N" label)
    if (miniCounter) {
      miniCounter.textContent = index === 0 ? '' : `${index} · ${WALKTHROUGH_STEPS.length - 1}`;
    }
    if (labelEl) labelEl.textContent = '';

    // Dots
    dotsEl.innerHTML = WALKTHROUGH_STEPS.map((_, i) =>
      `<span class="wt-dot ${i === index ? 'active' : i < index ? 'done' : ''}"></span>`
    ).join('');

    // Show/hide prev
    btnPrev.style.display = index > 0 ? 'inline-flex' : 'none';

    // Show/hide skip (not on last step)
    btnSkip.style.display = index < WALKTHROUGH_STEPS.length - 1 ? 'inline-flex' : 'none';

    if (!step.target || !targetEl) {
      // Centered modal, no spotlight. Compute the centered position in JS
      // (rather than a CSS `transform: translate(-50%,-50%)`) so it never
      // fights the entrance fade's own transform when switching steps.
      spotlight.classList.add('hidden');
      tooltip.classList.add('wt-centered');
      tooltip.style.top = '';
      tooltip.style.left = '';
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      tooltip.style.top = Math.max(20, (window.innerHeight - th) / 2) + 'px';
      tooltip.style.left = Math.max(20, (window.innerWidth - tw) / 2) + 'px';
    } else {
      tooltip.classList.remove('wt-centered');

      // Scroll target element into view so it is completely visible and not clipped by overflow containers
      targetEl.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });

      spotlight.classList.remove('hidden');
      const rect = targetEl.getBoundingClientRect();
      const pad = 14;

      spotlight.style.top = (rect.top - pad) + 'px';
      spotlight.style.left = (rect.left - pad) + 'px';
      spotlight.style.width = (rect.width + pad * 2) + 'px';
      spotlight.style.height = Math.min(rect.height + pad * 2, window.innerHeight * 0.7) + 'px';

      // Position tooltip so it never overlaps the spotlighted box
      positionWalkthroughTooltip(rect, step.position, pad);
    }

    // Fade tooltip in
    requestAnimationFrame(() => {
      tooltip.classList.add('visible');
    });
  }, delay);
}

function positionWalkthroughTooltip(targetRect, position, pad) {
  const tooltip = document.getElementById('walkthrough-tooltip');
  const gap = 24;
  const margin = 20;

  // Reset before measuring so the tooltip's own (responsive) size is current
  tooltip.style.top = '';
  tooltip.style.left = '';

  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // The spotlight is padded outward from the raw target rect; that's the
  // box the tooltip must stay clear of.
  const box = {
    top: targetRect.top - pad,
    bottom: targetRect.bottom + pad,
    left: targetRect.left - pad,
    right: targetRect.right + pad
  };

  const spaceRight = vw - box.right;
  const spaceLeft = box.left;
  const spaceBelow = vh - box.bottom;
  const spaceAbove = box.top;

  // Flip to the opposite side when the requested side doesn't have room
  let side = position;
  if (side === 'right' && spaceRight < tw + gap && spaceLeft >= tw + gap) side = 'left';
  if (side === 'left' && spaceLeft < tw + gap && spaceRight >= tw + gap) side = 'right';
  if (side === 'bottom' && spaceBelow < th + gap && spaceAbove >= th + gap) side = 'top';
  if (side === 'top' && spaceAbove < th + gap && spaceBelow >= th + gap) side = 'bottom';

  let top, left;
  switch (side) {
    case 'right':
      left = box.right + gap;
      top = targetRect.top;
      break;
    case 'left':
      left = box.left - gap - tw;
      top = targetRect.top;
      break;
    case 'top':
      top = box.top - gap - th;
      left = targetRect.left;
      break;
    case 'bottom':
    default:
      top = box.bottom + gap;
      left = targetRect.left;
      break;
  }

  // Clamp to the viewport
  left = Math.max(margin, Math.min(left, vw - tw - margin));
  top = Math.max(margin, Math.min(top, vh - th - margin));

  // If clamping pulled the tooltip back over the spotlighted box, nudge it
  // clear on whichever axis still has room rather than let it overlap.
  const overlaps = left < box.right && left + tw > box.left && top < box.bottom && top + th > box.top;
  if (overlaps) {
    if (side === 'left' || side === 'right') {
      top = (box.bottom + gap + th <= vh - margin) ? box.bottom + gap : Math.max(margin, box.top - gap - th);
    } else {
      left = (box.right + gap + tw <= vw - margin) ? box.right + gap : Math.max(margin, box.left - gap - tw);
    }
  }

  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
}

function walkthroughNext() {
  if (walkthroughStep < WALKTHROUGH_STEPS.length - 1) {
    showWalkthroughStep(walkthroughStep + 1);
  } else {
    endWalkthrough();
  }
}

function walkthroughPrev() {
  if (walkthroughStep > 0) {
    showWalkthroughStep(walkthroughStep - 1);
  }
}

function endWalkthrough() {
  walkthroughActive = false;
  closeSidebar();
  closePreviewSecondary();
  closePreviewBar();

  const overlay = document.getElementById('walkthrough-overlay');
  const tooltip = document.getElementById('walkthrough-tooltip');
  const spotlight = document.getElementById('walkthrough-spotlight');

  if (tooltip) tooltip.classList.remove('visible');

  setTimeout(() => {
    if (overlay) overlay.classList.remove('active');
    if (spotlight) spotlight.classList.add('hidden');
    if (tooltip) tooltip.classList.remove('wt-centered');
  }, 500);

  // Restore pre-walkthrough view if we were in the preview step
  if (preWalkthroughState) {
    isPreviewActive = preWalkthroughState.isPreviewActive;
    isGuideActive = preWalkthroughState.isGuideActive;
    currentCategoryIdx = preWalkthroughState.currentCategoryIdx;
    switchCategory(currentCategoryIdx);
    preWalkthroughState = null;

    // Smoothly reset sidebar scroll position to top
    const scroller = document.getElementById('category-scroller');
    if (scroller) {
      scroller.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }

  // Mark as completed
  localStorage.setItem('kaptain_tour_done', '1');

  showToast("Pick your folders and customize away.", "success");

  // One-time navigation hint (shown only after the very first tour completion)
  if (!localStorage.getItem('kaptain_nav_hint_shown')) {
    localStorage.setItem('kaptain_nav_hint_shown', '1');
    setTimeout(() => showToast('Tip: use arrow keys or swipe to navigate sections.', 'success'), 3500);
  }
}

function showUndoToast(folder) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast-undo';

  const name = folder.title || 'Folder';
  toast.innerHTML = `
    <div class="toast-message">Removed <strong>${name}</strong></div>
    <button class="toast-undo-btn">Undo</button>
    <button class="toast-close">&times;</button>
  `;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  };

  toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
    toggleWholeFolderSelection(folder, true);
    dismiss();
  });
  toast.querySelector('.toast-close').addEventListener('click', dismiss);

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(dismiss, 5000);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'success'
    ? `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-message">${message}</div>
    <button class="toast-close">&times;</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  });

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }
  }, 4500);
}

// ==========================================================================
// FEATURE B: SYNC STATE INDICATOR
// ==========================================================================

function getSelectedFolderIds() {
  return Object.keys(selectedMap).filter(key => {
    const sources = selectedMap[key];
    return sources && Object.values(sources).some(Boolean);
  });
}

function checkSyncState() {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  const raw = localStorage.getItem('kaptain_last_push');
  if (!raw) { dot.className = 'sync-dot'; dot.title = ''; return; }
  try {
    const saved = JSON.parse(raw);
    const savedIds = (saved.folderIds || []).slice().sort().join('\n');
    const currentIds = getSelectedFolderIds().slice().sort().join('\n');
    if (savedIds === currentIds) {
      dot.className = 'sync-dot synced';
      const mins = Math.round((Date.now() - saved.timestamp) / 60000);
      const timeStr = mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
      dot.title = `Nuvio is up to date · Pushed ${timeStr}`;
    } else {
      dot.className = 'sync-dot out-of-sync';
      const current = new Set(getSelectedFolderIds());
      const prev = new Set(saved.folderIds || []);
      const added = [...current].filter(id => !prev.has(id)).length;
      const removed = [...prev].filter(id => !current.has(id)).length;
      const parts = [];
      if (added) parts.push(`+${added} folder${added !== 1 ? 's' : ''}`);
      if (removed) parts.push(`-${removed} folder${removed !== 1 ? 's' : ''}`);
      dot.title = (parts.length ? parts.join(', ') + ' since last push.' : 'Selection changed.') + ' Click to update.';
    }
  } catch (e) {
    dot.className = 'sync-dot'; dot.title = '';
  }
}

function handleSendToNuvioClick() {
  const dot = document.getElementById('sync-dot');
  if (dot && dot.classList.contains('out-of-sync')) {
    openQuickPushModal();
  } else {
    if (window.NuvioWizard && typeof window.NuvioWizard.open === 'function') {
      window.NuvioWizard.open();
    }
  }
}

function openQuickPushModal() {
  const overlay = document.getElementById('quick-push-overlay');
  const desc = document.getElementById('quick-push-desc');
  if (!overlay) return;

  const raw = localStorage.getItem('kaptain_last_push');
  if (desc && raw) {
    try {
      const saved = JSON.parse(raw);
      const current = new Set(getSelectedFolderIds());
      const prev = new Set(saved.folderIds || []);
      const added = [...current].filter(id => !prev.has(id)).length;
      const removed = [...prev].filter(id => !current.has(id)).length;
      const parts = [];
      if (added) parts.push(`${added} folder${added !== 1 ? 's' : ''} added`);
      if (removed) parts.push(`${removed} folder${removed !== 1 ? 's' : ''} removed`);
      desc.textContent = parts.length ? parts.join(', ') + ' since your last push.' : 'Your selection has changed since the last push.';
    } catch (e) { desc.textContent = 'Your selection has changed since the last push.'; }
  }

  overlay.hidden = false;
}

function closeQuickPushModal() {
  const overlay = document.getElementById('quick-push-overlay');
  if (overlay) overlay.hidden = true;
}

async function performQuickPush() {
  const btn = document.getElementById('quick-push-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Pushing…'; }

  try {
    const raw = localStorage.getItem('kaptain_last_push');
    if (!raw) throw new Error('no_state');
    const saved = JSON.parse(raw);
    const { token, profileId } = saved;
    if (!token || !profileId) throw new Error('no_auth');

    const collections = assembleFilteredDatabase();
    if (!collections || !collections.length) throw new Error('Nothing selected.');

    await window.NuvioPush.pushCollections(token, profileId, collections);

    localStorage.setItem('kaptain_last_push', JSON.stringify({
      ...saved, timestamp: Date.now(), folderIds: getSelectedFolderIds(),
    }));
    checkSyncState();
    closeQuickPushModal();
    showToast('Nuvio updated.', 'success');
  } catch (e) {
    closeQuickPushModal();
    const msg = (e && e.message) || '';
    const isAuthErr = msg === 'no_auth' || msg === 'no_state' || /401|403|unauthorized|expired/i.test(msg);
    showToast(isAuthErr ? 'Session expired. Running full Setup.' : `Couldn't reach Nuvio. Trying full Setup.`, 'error');
    setTimeout(() => {
      if (window.NuvioWizard && typeof window.NuvioWizard.open === 'function') window.NuvioWizard.open();
    }, 600);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Now'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const qpCancel = document.getElementById('quick-push-cancel');
  const qpConfirm = document.getElementById('quick-push-confirm');
  if (qpCancel) qpCancel.addEventListener('click', () => {
    closeQuickPushModal();
    if (window.NuvioWizard && typeof window.NuvioWizard.open === 'function') window.NuvioWizard.open();
  });
  if (qpConfirm) qpConfirm.addEventListener('click', performQuickPush);
  const qpOverlay = document.getElementById('quick-push-overlay');
  if (qpOverlay) qpOverlay.addEventListener('click', (e) => { if (e.target === qpOverlay) closeQuickPushModal(); });
});

// ==========================================================================
// FEATURE C: COMMAND PALETTE
// ==========================================================================

let _commandPaletteOpen = false;
let _commandHighlightIdx = 0;

function _buildCommandRegistry() {
  const reg = [];
  database.forEach((cat, i) => {
    reg.push({
      label: `Go to ${cat.title}`,
      keywords: [cat.title.toLowerCase(), 'go', 'jump'],
      icon: cat.icon || '📁', group: 'Navigate',
      action: () => { switchCategory(i); closeSidebar(); }
    });
  });
  reg.push({ label: 'Select All in this section', keywords: ['select', 'all', 'check'], icon: '✓', group: 'Selection', action: () => { toggleCategorySelection(currentCategoryIdx, true); renderCategoryActions(); renderFolderGrid(); updateControlCenterStats(); } });
  reg.push({ label: 'Select None in this section', keywords: ['none', 'uncheck', 'deselect', 'clear', 'remove'], icon: '○', group: 'Selection', action: () => { toggleCategorySelection(currentCategoryIdx, false); renderCategoryActions(); renderFolderGrid(); updateControlCenterStats(); } });
  reg.push({ label: 'View: Rows', keywords: ['view', 'rows', 'layout', 'tv'], icon: '▬', group: 'View', action: () => { const s = document.getElementById('viewmode-select'); if (s) { s.value = 'ROWS'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'View: Tabbed Grid', keywords: ['view', 'tabbed', 'grid', 'mobile', 'phone'], icon: '▦', group: 'View', action: () => { const s = document.getElementById('viewmode-select'); if (s) { s.value = 'TABBED_GRID'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'View: Auto', keywords: ['view', 'auto'], icon: '⊞', group: 'View', action: () => { const s = document.getElementById('viewmode-select'); if (s) { s.value = 'FOLLOW_LAYOUT'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'Sort: Custom order', keywords: ['sort', 'custom'], icon: '↕', group: 'Sort', action: () => { const s = document.getElementById('folder-sort'); if (s) { s.value = 'custom'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'Sort: A–Z', keywords: ['sort', 'alphabetical', 'a-z', 'az'], icon: 'A', group: 'Sort', action: () => { const s = document.getElementById('folder-sort'); if (s) { s.value = 'az'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'Sort: Selected first', keywords: ['sort', 'selected', 'checked', 'first'], icon: '★', group: 'Sort', action: () => { const s = document.getElementById('folder-sort'); if (s) { s.value = 'selected'; s.dispatchEvent(new Event('change')); } } });
  reg.push({ label: 'Send to Nuvio', keywords: ['send', 'push', 'nuvio', 'upload', 'stream'], icon: '📡', group: 'Actions', action: () => handleSendToNuvioClick() });
  reg.push({ label: 'Save File', keywords: ['save', 'download', 'export', 'file'], icon: '💾', group: 'Actions', action: () => document.getElementById('btn-compile-download')?.click() });
  reg.push({ label: 'Start walkthrough', keywords: ['tour', 'walkthrough', 'guide', 'help', 'replay', 'walk'], icon: '?', group: 'Actions', action: () => document.getElementById('btn-replay-tour')?.click() });
  return reg;
}

function _fuzzyScore(query, cmd) {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const label = cmd.label.toLowerCase();
  const kws = (cmd.keywords || []).join(' ');
  if (label.startsWith(q)) return 4;
  if (label.includes(q)) return 3;
  if (kws.includes(q)) return 2;
  const words = q.split(/\s+/);
  if (words.length > 1 && words.every(w => (label + ' ' + kws).includes(w))) return 1;
  return 0;
}

function _renderCommandResults(query) {
  const container = document.getElementById('command-results');
  if (!container) return;
  const registry = _buildCommandRegistry();
  const results = registry
    .map(cmd => ({ cmd, score: _fuzzyScore(query, cmd) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.cmd);

  if (!results.length) {
    container.innerHTML = '<div style="padding:14px 18px;color:var(--text-dark);font-size:0.85rem;">No commands match that.</div>';
    _commandHighlightIdx = 0;
    return;
  }

  _commandHighlightIdx = 0;
  let html = '', lastGroup = '';
  results.forEach((cmd, i) => {
    if (cmd.group !== lastGroup) {
      html += `<div class="command-group-label">${cmd.group}</div>`;
      lastGroup = cmd.group;
    }
    html += `<div class="command-result${i === 0 ? ' highlighted' : ''}" data-idx="${i}"><span class="command-result-icon">${cmd.icon || '·'}</span><span class="command-result-label">${cmd.label}</span></div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.command-result').forEach((el, i) => {
    el.addEventListener('mouseenter', () => _setCommandHighlight(i));
    el.addEventListener('click', () => { closeCommandPalette(); setTimeout(() => results[i].action(), 50); });
  });

  return results;
}

let _cmdResultsCache = null;
function _setCommandHighlight(idx) {
  const els = document.querySelectorAll('.command-result');
  els.forEach((el, i) => el.classList.toggle('highlighted', i === idx));
  _commandHighlightIdx = idx;
}

function openCommandPalette() {
  if (_commandPaletteOpen) return;
  _commandPaletteOpen = true;
  const overlay = document.getElementById('command-palette-overlay');
  const input = document.getElementById('command-input');
  if (!overlay) return;
  overlay.hidden = false;
  if (input) { input.value = ''; input.focus(); }
  _cmdResultsCache = _renderCommandResults('');
}

function closeCommandPalette() {
  _commandPaletteOpen = false;
  const overlay = document.getElementById('command-palette-overlay');
  if (overlay) overlay.hidden = true;
}

function _isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    const cmdK = (e.metaKey || e.ctrlKey) && e.key === 'k';
    const bareK = e.key === 'k' && !_isInputFocused() && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (cmdK || bareK) {
      e.preventDefault();
      _commandPaletteOpen ? closeCommandPalette() : openCommandPalette();
      return;
    }
    if (!_commandPaletteOpen) return;
    if (e.key === 'Escape') { closeCommandPalette(); return; }
    const results = document.querySelectorAll('.command-result');
    if (e.key === 'ArrowDown') { e.preventDefault(); _setCommandHighlight(Math.min(_commandHighlightIdx + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _setCommandHighlight(Math.max(_commandHighlightIdx - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.command-result.highlighted')?.click(); }
  });

  const cmdInput = document.getElementById('command-input');
  if (cmdInput) cmdInput.addEventListener('input', () => { _cmdResultsCache = _renderCommandResults(cmdInput.value); });

  const cmdOverlay = document.getElementById('command-palette-overlay');
  if (cmdOverlay) cmdOverlay.addEventListener('click', (e) => { if (e.target === cmdOverlay) closeCommandPalette(); });
});

// ==========================================================================
// FEATURE A: SMART START QUIZ
// ==========================================================================

const _quizAnswers = {};

const _quizScorers = {
  movies:    (f) => (f.sources || []).some(s => s.type === 'movie' || !s.type) ? 2 : 0,
  series:    (f) => (f.sources || []).some(s => s.type === 'series') ? 2 : -1,
  action:    (f, cat) => /action|thriller|heist|spy|crime|adventure/i.test(f.title + cat.title) ? 3 : 0,
  comedy:    (f, cat) => /comedy|humor|sitcom/i.test(f.title + cat.title) ? 3 : 0,
  drama:     (f, cat) => /drama/i.test(f.title + cat.title) ? 3 : 0,
  scifi:     (f, cat) => /sci.fi|fantasy|marvel|dc|superhero/i.test(f.title + cat.title) ? 3 : 0,
  horror:    (f, cat) => /horror|scary|fear|terror/i.test(f.title + cat.title) ? 3 : 0,
  docs:      (f, cat) => /documentary|docuseries|true crime|nature/i.test(f.title + cat.title) ? 3 : 0,
  reality:   (f, cat) => /reality|competition|game show|dating/i.test(f.title + cat.title) ? 3 : 0,
  animation: (f, cat) => /animation|animated|pixar|cartoon/i.test(f.title + cat.title) ? 3 : 0,
  anime:     (f, cat) => /anime/i.test(cat.title) ? 5 : /anime/i.test(f.title) ? 3 : 0,
  international: (f, cat) => /international cinema/i.test(cat.title) ? 5 : 0,
  awards:    (f, cat) => /award/i.test(cat.title) ? 5 : /oscar|emmy|cannes|golden globe/i.test(f.title) ? 3 : 0,
  newreleases: (f) => /new|trending|popular/i.test(f.title) ? 2 : 0,
};

function _runSmartStart(answers) {
  const scored = [];
  database.forEach(cat => {
    (cat.folders || []).forEach(folder => {
      let score = 1;
      const ct = answers.contentType;
      if (ct === 'movies' || ct === 'series') score += _quizScorers[ct](folder);
      (answers.genres || []).forEach(g => { if (_quizScorers[g]) score += _quizScorers[g](folder, cat); });
      (answers.musthaves || []).forEach(m => { if (_quizScorers[m]) score += _quizScorers[m](folder, cat); });
      if (/discover/i.test(cat.title)) score += 2;
      scored.push({ folder, cat, score });
    });
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 20);

  database.forEach(cat => {
    (cat.folders || []).forEach(folder => {
      const key = getFolderKey(folder);
      if (selectedMap[key]) Object.keys(selectedMap[key]).forEach(sk => { selectedMap[key][sk] = false; });
    });
  });
  top.forEach(({ folder }) => {
    const key = getFolderKey(folder);
    if (!selectedMap[key]) selectedMap[key] = {};
    (folder.sources || []).forEach(s => { selectedMap[key][getSourceKey(s)] = true; });
  });

  const device = answers.device;
  const vmSelect = document.getElementById('viewmode-select');
  if (vmSelect && device) {
    if (device === 'tv') { vmSelect.value = 'ROWS'; vmSelect.dispatchEvent(new Event('change')); }
    else if (device === 'phone') { vmSelect.value = 'TABBED_GRID'; vmSelect.dispatchEvent(new Event('change')); }
  }

  try { localStorage.setItem('kaptain_quiz_answers', JSON.stringify(answers)); } catch (_) {}
  return top.length;
}

function initQuizScreen(num) {
  const overlay = document.getElementById('quiz-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.quiz-step').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-screen') === String(num));
  });
  const dots = overlay.querySelectorAll('.quiz-progress-dot');
  dots.forEach((d, i) => d.classList.toggle('done', i < num - 1));
}

document.addEventListener('DOMContentLoaded', () => {
  const quizOverlay = document.getElementById('quiz-overlay');
  if (!quizOverlay) return;

  // Build progress dots
  const progressEl = document.getElementById('quiz-progress');
  if (progressEl) progressEl.innerHTML = [1, 2, 3, 4].map(() => '<div class="quiz-progress-dot"></div>').join('');

  // Pill toggle
  quizOverlay.addEventListener('click', (e) => {
    const pill = e.target.closest('.quiz-pill');
    if (!pill) return;
    const grid = pill.closest('.quiz-pill-grid');
    if (!grid) return;
    if (grid.getAttribute('data-multi') !== 'true') {
      grid.querySelectorAll('.quiz-pill').forEach(p => p.classList.remove('selected'));
    }
    pill.classList.toggle('selected');
  });

  // Next / finish
  quizOverlay.addEventListener('click', (e) => {
    const btn = e.target.closest('.quiz-next');
    if (!btn) return;
    const nextScreen = btn.getAttribute('data-next');
    const activeStep = quizOverlay.querySelector('.quiz-step.active');
    if (activeStep) {
      const grid = activeStep.querySelector('.quiz-pill-grid');
      if (grid) {
        const key = grid.getAttribute('data-key');
        const isMulti = grid.getAttribute('data-multi') === 'true';
        const selected = [...grid.querySelectorAll('.quiz-pill.selected')].map(p => p.getAttribute('data-value'));
        _quizAnswers[key] = isMulti ? selected : (selected[0] || null);
      }
    }
    if (nextScreen === 'done') {
      initQuizScreen('loading');
      setTimeout(() => {
        const count = _runSmartStart(_quizAnswers);
        quizOverlay.hidden = true;
        hideTitleScreen();
        renderSidebar();
        renderFolderGrid();
        updateControlCenterStats();
        if (count > 0) setTimeout(() => showToast(`Picked ${count} folders to get you started. Swap any out.`, 'success'), 400);
      }, 1600);
    } else {
      initQuizScreen(parseInt(nextScreen));
    }
  });

  // Skip / close
  function skipQuiz() {
    quizOverlay.hidden = true;
    Object.keys(_quizAnswers).forEach(k => delete _quizAnswers[k]);
    hideTitleScreen();
  }
  quizOverlay.addEventListener('click', (e) => {
    if (e.target.closest('.quiz-skip')) skipQuiz();
    else if (e.target === quizOverlay) skipQuiz();
  });
});
