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

// Nuvio TV/Mobile emulator (Preview) state
let previewDevice = (() => { try { return localStorage.getItem('kaptain_preview_device') || 'tv'; } catch (e) { return 'tv'; } })();
let featuredKey = null;            // folderKey shown in the preview hero
let previewRows = [];              // array of arrays of focusable elements (focus engine)
let previewPos = { r: 0, c: 0 };   // current focus position
let activeCatIdx = 0;              // sidebar jump-nav highlight
const categorySort = {};           // { catIdx: 'custom'|'az'|'za'|'selected' } — per-row sort preset

const CARD_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const CARD_MINUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

// Ordering State
let reorderMode = false;   // when true, up/down arrows appear at every level

// View Mode State (per-browser; never shared with other visitors)
let selectedViewMode = localStorage.getItem('kaptain_view_mode') || 'ROWS';
let lastExportOptimize = false;  // decided per-export by the mobile-compat gate

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
    title: "Welcome to Kaptain's Collection",
    body: "This is a live preview of your Nuvio home screen. Browse the cards, add or remove what you want, and send it straight to Nuvio. Quick tour, about 30 seconds.",
    target: null,
    position: 'center',
    nextLabel: 'Show Me Around'
  },
  {
    title: 'Jump to a Section',
    body: 'These are your sections — Trending, Streaming, Genres, and more. Click any one to jump straight to its row. The toggle beside each adds or removes the whole section at once.',
    target: '#category-scroller',
    position: 'right',
    nextLabel: 'Next'
  },
  {
    title: 'Add & Remove Folders',
    body: "Every folder shows here as a card. Bright cards are in your collection; dimmed ones aren't. Hover or focus a card and use the + or − button to add or remove it. Click a card to see what's inside, or the gear to pick individual sources.",
    target: '#content-canvas',
    position: 'left',
    nextLabel: 'Next'
  },
  {
    title: 'TV or Phone',
    body: "Flip between how your collection will look on a TV and on a phone. Use your arrow keys to move around just like a real remote — the focused card becomes the hero up top.",
    target: '.nv-device-toggle',
    position: 'bottom',
    nextLabel: 'Next'
  },
  {
    title: 'Send Straight to Nuvio',
    body: "When you're happy, Send to Nuvio signs you in (or creates an account) and loads your collection instantly — synced to all your devices. Prefer to keep your login to yourself? Download the file and import it manually.",
    target: '#preview-send',
    position: 'bottom',
    nextLabel: 'Got It'
  }
];

// ==========================================================================
// 1. BOOTSTRAP
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initializeDatabase();
  bindGlobalEvents();
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

  // Check if walkthrough should auto-start
  setTimeout(() => {
    if (!localStorage.getItem('kaptain_tour_done')) {
      startWalkthrough();
    }
  }, 700);
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
  return source.title || "Default Source";
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

    const rightGroup = reorderMode
      ? `<div class="cat-right-group">${reorderArrowsHtml(idx === 0, idx === database.length - 1)}</div>`
      : `<div class="cat-right-group">
           <span class="cat-badge">${stats.selectedFolders}/${stats.totalFolders}</span>
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

  // Divider
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--border);margin:14px 12px;';
  scroller.appendChild(divider);

  // Setup Guide tab
  const guideItem = document.createElement('button');
  guideItem.className = `cat-nav-item ${isGuideActive ? 'active' : ''}`;
  guideItem.innerHTML = `
    <div class="cat-info-combo">
      <span class="cat-emoji">📖</span>
      <span class="cat-name">Setup Guide</span>
    </div>
  `;
  guideItem.addEventListener('click', () => {
    isPreviewActive = false;
    isGuideActive = true;
    switchCategory(-1);
  });
  scroller.appendChild(guideItem);
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
    titleEl.textContent = "Kaptain's Collection";
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
  } else if (isGuideActive) {
    titleEl.textContent = 'Setup Guide';
    subtitleEl.textContent = 'How to import your custom collection into Nuvio';
    setMode('guide');
    if (controlCenter) {
      controlCenter.style.opacity = '0';
      controlCenter.style.pointerEvents = 'none';
      const panel = controlCenter.querySelector('.control-center-panel');
      if (panel) panel.style.pointerEvents = 'none';
    }
    if (actionsGroup) actionsGroup.innerHTML = '';
    renderSetupGuide();
  } else {
    isPreviewActive = false;
    const category = database[currentCategoryIdx];
    if (category) {
      const stats = getCategorySelectionStats(currentCategoryIdx);
      titleEl.textContent = category.title;
      subtitleEl.textContent = reorderMode
        ? 'Reorder mode — use the ▲ ▼ arrows to move sections, folders & sources. Click Reorder again to finish.'
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

    // Reset the folder-sort dropdown to "Custom" for the newly entered section
    const folderSort = document.getElementById('folder-sort');
    if (folderSort) folderSort.value = 'custom';

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

  filteredFolders.forEach(folder => {
    const card = document.createElement('div');
    const folderKey = getFolderKey(folder);
    const sourceStats = getFolderSourceCountStats(folder);
    const isSelected = sourceStats.active > 0;
    const realIdx = category.folders.indexOf(folder);

    card.className = `folder-card ${isSelected ? 'selected' : ''} ${showArrows ? 'reorder-active' : ''}`;

    const shape = folder.tileShape || "LANDSCAPE";
    card.classList.add(`aspect-${shape.toLowerCase()}`);

    const baseImg = folder.coverImageUrl || '';
    const hoverGif = folder.focusGifUrl || baseImg;

    const logoOverlayHtml = folder.titleLogoUrl
      ? `<div class="card-logo-overlay"><img src="${folder.titleLogoUrl}" alt="${folder.title}" class="card-logo-img"></div>`
      : `<h4 class="card-text-title">${folder.title}</h4>`;

    const controlsHeader = showArrows
      ? `<div class="card-controls-header">
           ${reorderArrowsHtml(realIdx === 0, realIdx === category.folders.length - 1)}
           <div class="card-source-count-badge" title="Active sources">${sourceStats.active}/${sourceStats.total}</div>
         </div>`
      : `<div class="card-controls-header">
           <div class="custom-checkbox-wrapper" title="${isSelected ? 'Remove from collection' : 'Add to collection'}">
             <div class="checkbox-visual">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                 <polyline points="20 6 9 17 4 12"></polyline>
               </svg>
             </div>
           </div>
           <div class="card-source-count-badge" title="Active sources">${sourceStats.active}/${sourceStats.total}</div>
           <button class="gear-button" title="Customize sources">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
               <circle cx="12" cy="12" r="3"></circle>
               <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
             </svg>
           </button>
         </div>`;

    card.innerHTML = `
      <div class="card-artwork-wrapper">
        <img src="${baseImg}" class="card-cover-img" alt="${folder.title}" loading="lazy">
        ${folder.focusGifUrl ? `<img src="${hoverGif}" class="card-gif-img" alt="${folder.title} preview" loading="lazy">` : ''}
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
        });
      });
    } else {
      // Checkbox → toggle folder
      const checkboxBtn = card.querySelector('.custom-checkbox-wrapper');
      checkboxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWholeFolderSelection(folder, !isSelected);
      });

      // Gear → open drawer
      const gearBtn = card.querySelector('.gear-button');
      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSourceCustomizationDrawer(folder);
      });

      // Card body → open drawer
      card.addEventListener('click', () => {
        openSourceCustomizationDrawer(folder);
      });
    }

    grid.appendChild(card);
  });
}

// Apply a sort preset to the current category's folders, then re-render.
function applyFolderSort(mode) {
  const category = database[currentCategoryIdx];
  if (!category || !category.folders) return;
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
  container.innerHTML = `
    <div class="no-results-box">
      <svg class="no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
      <h4 class="no-results-title">No Folders Found</h4>
      <p class="no-results-desc">${descText}</p>
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
// 5. SETUP GUIDE
// ==========================================================================

function renderSetupGuide() {
  const canvas = document.getElementById('content-canvas');
  if (!canvas || !isGuideActive) return;

  canvas.innerHTML = `
    <div class="guide-panel-container">
      <div class="guide-section-intro">
        <h3 class="brand-title" style="font-size: 1.4rem; margin-bottom: 8px; text-transform: none; letter-spacing: 0;">How to Import Your Collection</h3>
        <p style="color: var(--text-secondary); line-height: 1.5;">
          Once you've picked the folders and sources you want, follow these steps to load them into your Nuvio app.
        </p>
      </div>

      <div class="guide-step-card">
        <div class="guide-step-num-badge">01</div>
        <div class="guide-step-content">
          <h4 class="guide-step-title">Download Your Custom File</h4>
          <p class="guide-step-desc">
            Use the grid to check or uncheck folders. Click the gear icon on any folder to fine-tune individual sources. When you're happy, click <strong>Download Collection</strong> at the bottom. Your file (<strong>nuvio_custom_collection.json</strong>) will download instantly.
          </p>
        </div>
      </div>

      <div class="guide-step-card">
        <div class="guide-step-num-badge">02</div>
        <div class="guide-step-content">
          <h4 class="guide-step-title">Choose How to Add It</h4>
          <p class="guide-step-desc">There are two easy ways to get your picks into Nuvio:</p>
          <div class="guide-methods-grid">
            <div class="guide-method-box">
              <span class="guide-method-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>
                Send to Nuvio (easiest)
              </span>
              <p class="guide-method-desc">Click <strong>Send to Nuvio</strong> to sign in (or create an account) and load your collection straight in — synced to all your devices.</p>
            </div>
            <div class="guide-method-box">
              <span class="guide-method-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Upload the JSON File
              </span>
              <p class="guide-method-desc">Prefer to keep your login to yourself? Click <strong>Download</strong> and upload the file through Nuvio's import screen.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="guide-step-card">
        <div class="guide-step-num-badge">03</div>
        <div class="guide-step-content">
          <h4 class="guide-step-title">Import in Nuvio</h4>
          <p class="guide-step-desc">If you downloaded the file, head to the import settings in Nuvio:</p>
          <ul class="guide-step-list">
            <li>Open the Nuvio configuration or admin panel.</li>
            <li>Find the <strong>Import / Database</strong> settings.</li>
            <li><strong>File upload:</strong> Browse for your downloaded JSON and import it.</li>
            <li>(Using <strong>Send to Nuvio</strong> instead? You can skip this — it's already loaded.)</li>
          </ul>
        </div>
      </div>

      <div class="guide-step-card">
        <div class="guide-step-num-badge">04</div>
        <div class="guide-step-content">
          <h4 class="guide-step-title">You're All Set</h4>
          <p class="guide-step-desc">
            Launch Stremio, check that your folders are loading, and enjoy your customized collection. Come back here anytime to adjust your picks.
          </p>
        </div>
      </div>
    </div>
  `;
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
  bar.className = 'nv-preview-bar';
  bar.innerHTML = `
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
    <div class="nv-preview-actions">
      <button class="nv-reorder-toggle ${reorderMode ? 'active' : ''}" id="preview-reorder" title="Reorder mode — show up/down arrows to move sections, folders & sources by hand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
        <span>Reorder</span>
      </button>
      <div class="nv-viewmode-combo" title="How your folders lay out inside Nuvio — also written to your export. Tabbed Grid is the mobile-safe pick.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--text-muted);"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <select id="preview-viewmode" class="topbar-select" aria-label="View mode">
          <option value="ROWS">Rows</option>
          <option value="TABBED_GRID">Tabbed Grid</option>
          <option value="FOLLOW_LAYOUT">Follow Layout</option>
        </select>
      </div>
      <button class="btn-secondary nv-mini-btn" id="preview-download" title="Download your collection file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px;"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>
        <span>Download</span>
      </button>
      <button class="btn-primary nv-mini-btn" id="preview-send" title="Send your collection straight to Nuvio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>
        <span>Send to Nuvio</span>
      </button>
    </div>
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

  // One catalog row per category — every folder is shown; ones not in the
  // collection appear dimmed with an Add toggle.
  database.forEach((category, idx) => {
    if (!category.folders || category.folders.length === 0) return;
    const items = category.folders.map(folder => ({ folder, category, catIdx: idx }));
    scroll.appendChild(buildCatalogRow(category.title, items, idx));
  });

  screen.appendChild(scroll);
  screen.appendChild(buildMobileTabBar());
  frame.appendChild(screen);
  container.appendChild(frame);
  canvas.appendChild(container);

  bindPreviewControls();
  collectPreviewFocusRows();
  setPreviewHero(featured.folder, featured.category);
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
      <p class="nv-hero-meta"><span class="nv-badge-live" id="nv-hero-meta"></span></p>
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
  eyebrow.textContent = "Kaptain's Collection";
  meta.textContent = `● ${stats.active}/${stats.total} sources`;
}

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
  const gifHtml = (folder.focusGifUrl && folder.focusGifEnabled !== false)
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
      <button class="nv-card-act act-feature ${isFeatured ? 'on' : ''}" title="Feature in hero" aria-label="Feature">
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
    <span class="nv-card-meta">${isOn ? stats.active : ''}</span>
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
  updateControlCenterStats();
  renderSidebar();   // refresh the per-category counts
}

// Sync a single card's visuals to the folder's current selection state.
function refreshCardState(card, folder) {
  const stats = getFolderSourceCountStats(folder);
  const on = stats.active > 0;
  card.classList.toggle('nv-off', !on);
  const meta = card.querySelector('.nv-card-meta');
  if (meta) meta.textContent = on ? stats.active : '';
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
    return `<span class="nv-chip ${on ? 'on' : 'off'}"><span class="nv-chip-dot provider-${provider}"></span>${src.title || 'Source'}</span>`;
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
  const noteText = generatedAt
    ? `Real titles from your sources · Updated ${formatPreviewAge(generatedAt)}`
    : 'Placeholder layout — your lists fill with live titles once the collection is in Nuvio.';

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
        <p class="nv-detail-desc">${folder.description || 'A curated folder in your Nuvio collection. The sources below feed it fresh titles automatically.'}</p>
        <p class="nv-detail-section-label">Sources feeding this folder · ${stats.active}/${stats.total}</p>
        <div class="nv-detail-chips">${sourceChips}</div>
        <div class="nv-detail-inside">
          <p class="nv-detail-inside-head">How it lays out inside Nuvio · ${previewLayoutLabel(layout)} <span class="nv-inside-hint">— set by your View Mode</span></p>
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

function bindPreviewControls() {
  const vm = document.getElementById('preview-viewmode');
  if (vm) {
    vm.value = selectedViewMode;
    vm.addEventListener('change', () => {
      selectedViewMode = vm.value;
      try { localStorage.setItem('kaptain_view_mode', selectedViewMode); } catch (e) { /* ignore */ }
      const editorSel = document.getElementById('viewmode-select');
      if (editorSel) editorSel.value = selectedViewMode;
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
    renderSidebar();                 // section arrows in the sidebar
    if (activeDrawerFolder) renderDrawerSourcesList();  // source arrows in the open drawer
    renderPreviewCollection();       // card arrows + hide/show row sort menus
  });
  const dl = document.getElementById('preview-download');
  if (dl) dl.addEventListener('click', () => ensureMobileCompat(compileAndDownloadJSON));
  const send = document.getElementById('preview-send');
  if (send) send.addEventListener('click', () => {
    if (window.KaptainWizard && typeof window.KaptainWizard.open === 'function') window.KaptainWizard.open();
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

  sources.forEach((source, srcIdx) => {
    const sourceKey = getSourceKey(source);
    const isSelected = selectedMap[folderKey] && selectedMap[folderKey][sourceKey];

    const row = document.createElement('div');
    row.className = `source-row-item ${isSelected ? 'selected' : ''} ${reorderMode ? 'reorder-active' : ''}`;

    const mediaPill = source.mediaType ? source.mediaType : 'All';
    const providerPill = source.provider ? source.provider.toLowerCase() : 'tmdb';

    const leadControl = reorderMode
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
        <span class="source-row-title">${source.title}</span>
        <div class="source-meta-tag-row">
          <span class="source-meta-pill provider-${providerPill}">${providerPill}</span>
          <span class="source-meta-pill">${mediaPill}</span>
          ${source.traktListId ? `<span class="source-meta-pill" style="font-size:0.65rem;color:var(--text-muted);">List: ${source.traktListId}</span>` : ''}
          ${source.sortBy ? `<span class="source-meta-pill" style="font-size:0.65rem;color:var(--text-muted);">Sort: ${source.sortBy}</span>` : ''}
        </div>
      </div>
    `;

    if (reorderMode) {
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

  document.getElementById('selected-folders-count').innerHTML = `${selectedFolders}<span>/</span>${totalFolders}`;
  document.getElementById('selected-sources-count').innerHTML = `${selectedSources}<span>/</span>${totalSources}`;
  document.getElementById('selected-est-size').textContent = `${estSizeKB} KB`;
}

// ==========================================================================
// 9. EXPORT & DOWNLOAD
// ==========================================================================

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

    const link = document.createElement('a');
    link.href = url;
    link.download = "nuvio_custom_collection.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (popup) popup.classList.remove('open');
    showToast("Your custom collection file has been downloaded.", "success");
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
function ensureMobileCompat(actionFn) {
  if (typeof actionFn !== 'function') return;
  const overlay = document.getElementById('compat-overlay');
  const needsWarning = selectedViewMode === 'ROWS' || selectedViewMode === 'FOLLOW_LAYOUT';

  if (!needsWarning || !overlay) {
    lastExportOptimize = false;
    actionFn();
    return;
  }

  const checkbox = document.getElementById('compat-optimize-check');
  const continueBtn = document.getElementById('compat-continue');
  const keepBtn = document.getElementById('compat-keep');
  if (checkbox) checkbox.checked = true;  // default to the mobile-safe choice

  const cleanup = () => {
    overlay.classList.remove('open');
    if (continueBtn) continueBtn.removeEventListener('click', onContinue);
    if (keepBtn) keepBtn.removeEventListener('click', onKeep);
    overlay.removeEventListener('click', onBackdrop);
  };
  const proceed = (optimize) => {
    lastExportOptimize = optimize;
    cleanup();
    actionFn();
  };
  const onContinue = () => proceed(!!(checkbox && checkbox.checked));
  const onKeep = () => proceed(false);
  const onBackdrop = (e) => { if (e.target === overlay) cleanup(); };

  if (continueBtn) continueBtn.addEventListener('click', onContinue);
  if (keepBtn) keepBtn.addEventListener('click', onKeep);
  overlay.addEventListener('click', onBackdrop);

  overlay.classList.add('open');
}

// Exposed for wizard.js so "Send to Nuvio" routes through the same gate.
window.KaptainExport = { ensureMobileCompat, compileAndDownloadJSON, assembleFilteredDatabase };

// ==========================================================================
// 10. EVENT BINDINGS
// ==========================================================================

function bindGlobalEvents() {
  // Search filter
  const searchInput = document.getElementById('dashboard-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
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

  // Download button (gated by the mobile-compatibility check)
  const btnCompile = document.getElementById('btn-compile-download');
  if (btnCompile) btnCompile.addEventListener('click', () => ensureMobileCompat(compileAndDownloadJSON));

  // View Mode selector (per-browser; persisted)
  const viewModeSelect = document.getElementById('viewmode-select');
  if (viewModeSelect) {
    viewModeSelect.value = selectedViewMode;
    viewModeSelect.addEventListener('change', () => {
      selectedViewMode = viewModeSelect.value;
      try { localStorage.setItem('kaptain_view_mode', selectedViewMode); } catch (e) { /* ignore */ }
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
      btnReorder.classList.toggle('active', reorderMode);
      renderSidebar();
      renderFolderGrid();
      if (activeDrawerFolder) renderDrawerSourcesList();
      const subtitleEl = document.getElementById('view-subtitle');
      if (subtitleEl && !isGuideActive && !isPreviewActive) {
        if (reorderMode) {
          subtitleEl.textContent = 'Reorder mode — use the ▲ ▼ arrows to move sections, folders & sources. Click Reorder again to finish.';
        } else {
          const stats = getCategorySelectionStats(currentCategoryIdx);
          subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
        }
      }
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

  // Walkthrough button handlers
  const btnNext = document.getElementById('wt-btn-next');
  const btnPrev = document.getElementById('wt-btn-prev');
  const btnSkip = document.getElementById('wt-btn-skip');

  if (btnNext) btnNext.addEventListener('click', walkthroughNext);
  if (btnPrev) btnPrev.addEventListener('click', walkthroughPrev);
  if (btnSkip) btnSkip.addEventListener('click', endWalkthrough);

  // TV remote / arrow-key navigation inside the Nuvio preview
  document.addEventListener('keydown', handlePreviewKeydown);

  // ESC key to close drawer or end walkthrough
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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
  const btnNext = document.getElementById('wt-btn-next');
  const btnPrev = document.getElementById('wt-btn-prev');
  const btnSkip = document.getElementById('wt-btn-skip');

  // Show overlay
  overlay.classList.add('active');

  // Fade out tooltip while repositioning
  tooltip.classList.remove('visible');

  setTimeout(() => {
    // Update content
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    btnNext.textContent = step.nextLabel || 'Next';

    // Step label
    if (index === 0) {
      labelEl.textContent = '';
    } else {
      labelEl.textContent = `Step ${index} of ${WALKTHROUGH_STEPS.length - 1}`;
    }

    // Dots
    dotsEl.innerHTML = WALKTHROUGH_STEPS.map((_, i) =>
      `<span class="wt-dot ${i === index ? 'active' : i < index ? 'done' : ''}"></span>`
    ).join('');

    // Show/hide prev
    btnPrev.style.display = index > 0 ? 'inline-flex' : 'none';

    // Show/hide skip (not on last step)
    btnSkip.style.display = index < WALKTHROUGH_STEPS.length - 1 ? 'inline-flex' : 'none';

    if (!step.target) {
      // Centered modal — no spotlight
      spotlight.classList.add('hidden');
      tooltip.classList.add('wt-centered');
      tooltip.style.top = '';
      tooltip.style.left = '';
    } else {
      // Position spotlight on target element
      const targetEl = document.querySelector(step.target);
      tooltip.classList.remove('wt-centered');

      if (!targetEl) {
        // Fallback: center the tooltip
        spotlight.classList.add('hidden');
        tooltip.classList.add('wt-centered');
      } else {
        // If the target lives inside the sidebar, ensure the sidebar is open before spotlighting
        if (targetEl.closest('.sidebar')) openSidebar();

        // Scroll target element into view so it is completely visible and not clipped by overflow containers
        targetEl.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });

        spotlight.classList.remove('hidden');
        const rect = targetEl.getBoundingClientRect();
        const pad = 14;

        spotlight.style.top = (rect.top - pad) + 'px';
        spotlight.style.left = (rect.left - pad) + 'px';
        spotlight.style.width = (rect.width + pad * 2) + 'px';
        spotlight.style.height = Math.min(rect.height + pad * 2, window.innerHeight * 0.7) + 'px';

        // Position tooltip
        positionWalkthroughTooltip(rect, step.position);
      }
    }

    // Fade tooltip in
    requestAnimationFrame(() => {
      tooltip.classList.add('visible');
    });
  }, 120);
}

function positionWalkthroughTooltip(targetRect, position) {
  const tooltip = document.getElementById('walkthrough-tooltip');
  const gap = 28;
  const tooltipWidth = 380;
  const margin = 20;

  // Reset
  tooltip.style.top = '';
  tooltip.style.left = '';

  let top, left;

  switch (position) {
    case 'right':
      top = targetRect.top;
      left = targetRect.right + gap;
      break;
    case 'left':
      top = targetRect.top;
      left = targetRect.left - tooltipWidth - gap;
      break;
    case 'bottom':
      top = targetRect.bottom + gap;
      left = targetRect.left;
      break;
    case 'top':
      top = targetRect.top - 220 - gap;
      left = targetRect.left;
      break;
    default:
      top = targetRect.top;
      left = targetRect.right + gap;
  }

  // Clamp to viewport
  const maxLeft = window.innerWidth - tooltipWidth - margin;
  left = Math.min(maxLeft, Math.max(margin, left));
  top = Math.max(margin, Math.min(top, window.innerHeight - 300));

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

  const overlay = document.getElementById('walkthrough-overlay');
  const tooltip = document.getElementById('walkthrough-tooltip');
  const spotlight = document.getElementById('walkthrough-spotlight');

  if (tooltip) tooltip.classList.remove('visible');

  setTimeout(() => {
    if (overlay) overlay.classList.remove('active');
    if (spotlight) spotlight.classList.add('hidden');
    if (tooltip) tooltip.classList.remove('wt-centered');
  }, 300);

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

  showToast("You're all set. Start picking your folders!", "success");
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
