/**
 * Kaptain's Mega Collection — Custom Collection Builder
 * Client-side application logic
 */

// GitHub remote import base URL
const GITHUB_USER = 'ImKaptain';
const GITHUB_REPO = 'Kaptain-collection';
const GITHUB_BRANCH = 'main';
const RAW_GITHUB_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/collections`;

// Application State
let database = [];
let selectedMap = {};  // { folderKey: { sourceTitle: boolean } }
let currentCategoryIdx = 0;
let isGuideActive = false;
let isPreviewActive = false;
let currentSearch = '';
let gridSize = 180;
let activeDrawerFolder = null;

// Walkthrough State
let walkthroughActive = false;
let walkthroughStep = 0;
let preWalkthroughState = null;

const WALKTHROUGH_STEPS = [
  {
    title: "Welcome to Kaptain's Collection",
    body: "This tool lets you handpick exactly what goes into your Nuvio setup — browse folders, toggle what you want, and download a ready-to-import file. Quick tour, takes about 30 seconds.",
    target: null,
    position: 'center',
    nextLabel: 'Show Me Around'
  },
  {
    title: 'Browse by Category',
    body: 'Everything is organized into sections — Trending, Streaming, Genres, Studios, and more. Click any section to see its folders. The checkbox next to each lets you include or exclude an entire section at once.',
    target: '#category-scroller',
    position: 'right',
    nextLabel: 'Next'
  },
  {
    title: 'Pick Your Folders',
    body: "Each card is a folder in the collection. Bright cards are included in your download — dimmed ones aren't. Click the checkmark to toggle. Hover over any card and click the gear icon for source-level control.",
    target: '#content-canvas',
    position: 'left',
    nextLabel: 'Next'
  },
  {
    title: 'Quick Selection',
    body: 'Use All and None to quickly select or clear every folder in the current category. The count updates in real time so you always know exactly what you\'re getting.',
    target: '#category-actions-group',
    position: 'bottom',
    nextLabel: 'Next'
  },
  {
    title: 'Preview Your Collection',
    body: "Want to see how it all looks? Click Preview Collection in the sidebar to browse your selected folders laid out like the real app — scrollable rows for each category.",
    target: '#nav-preview',
    position: 'right',
    nextLabel: 'Next'
  },
  {
    title: 'Download Your Collection',
    body: "When you're happy with your picks, hit Download Collection. Your file will only include the folders and sources you selected — nothing extra. You can also copy a direct import link.",
    target: '.control-center-panel',
    position: 'top',
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

  // Render UI
  renderSidebar();
  switchCategory(0);
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
// 2. SIDEBAR
// ==========================================================================

function renderSidebar() {
  const scroller = document.getElementById('category-scroller');
  if (!scroller) return;

  scroller.innerHTML = '';

  database.forEach((category, idx) => {
    const stats = getCategorySelectionStats(idx);
    const catNavItem = document.createElement('button');
    catNavItem.className = `cat-nav-item ${(!isGuideActive && currentCategoryIdx === idx) ? 'active' : ''}`;

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

    catNavItem.innerHTML = `
      <div class="cat-info-combo">
        <span class="cat-emoji">${emoji}</span>
        <span class="cat-name">${category.title}</span>
      </div>
      <div class="cat-right-group">
        <span class="cat-badge">${stats.selectedFolders}/${stats.totalFolders}</span>
        <div class="cat-toggle ${toggleClass}" data-cat-idx="${idx}" title="Toggle all folders in this section">
          ${toggleIcon}
        </div>
      </div>
    `;

    // Click category name → navigate
    catNavItem.addEventListener('click', (e) => {
      // Don't navigate if they clicked the toggle
      if (e.target.closest('.cat-toggle')) return;
      isGuideActive = false;
      switchCategory(idx);
    });

    // Click toggle → bulk select/deselect
    const toggleEl = catNavItem.querySelector('.cat-toggle');
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const allSelected = stats.selectedFolders === stats.totalFolders;
      toggleCategorySelection(idx, !allSelected);
    });

    scroller.appendChild(catNavItem);
  });

  // Divider
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--border);margin:14px 12px;';
  scroller.appendChild(divider);

  // Preview Collection tab
  const previewItem = document.createElement('button');
  previewItem.id = 'nav-preview';
  previewItem.className = `cat-nav-item ${isPreviewActive ? 'active' : ''}`;
  previewItem.innerHTML = `
    <div class="cat-info-combo">
      <span class="cat-emoji">👁️</span>
      <span class="cat-name">Preview Collection</span>
    </div>
  `;
  previewItem.addEventListener('click', () => {
    isGuideActive = false;
    isPreviewActive = true;
    switchCategory(-2);
  });
  scroller.appendChild(previewItem);

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
  if (!isGuideActive && currentCategoryIdx === categoryIdx) {
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
  const searchContainer = document.getElementById('search-container');
  const zoomContainer = document.getElementById('zoom-container');
  const controlCenter = document.getElementById('control-center-bar');
  const actionsGroup = document.getElementById('category-actions-group');

  if (isPreviewActive) {
    titleEl.textContent = 'Preview Collection';
    subtitleEl.textContent = 'Your selected folders, laid out like the real app';
    if (searchContainer) searchContainer.style.display = 'none';
    if (zoomContainer) zoomContainer.style.display = 'none';
    if (controlCenter) controlCenter.style.transform = 'translateY(0)';
    if (actionsGroup) actionsGroup.innerHTML = '';
    renderPreviewCollection();
  } else if (isGuideActive) {
    titleEl.textContent = 'Setup Guide';
    subtitleEl.textContent = 'How to import your custom collection into Nuvio';
    if (searchContainer) searchContainer.style.display = 'none';
    if (zoomContainer) zoomContainer.style.display = 'none';
    if (controlCenter) controlCenter.style.transform = 'translateY(120px)';
    if (actionsGroup) actionsGroup.innerHTML = '';
    renderSetupGuide();
  } else {
    isPreviewActive = false;
    const category = database[currentCategoryIdx];
    if (category) {
      const stats = getCategorySelectionStats(currentCategoryIdx);
      titleEl.textContent = category.title;
      subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;

      if (category.folders && category.folders.length > 0) {
        setCinematicWallpaper(category.folders[0]);
      }
    }

    if (searchContainer) searchContainer.style.display = 'block';
    if (zoomContainer) zoomContainer.style.display = 'flex';
    if (controlCenter) controlCenter.style.transform = 'translateY(0)';

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

  filteredFolders.forEach(folder => {
    const card = document.createElement('div');
    const folderKey = getFolderKey(folder);
    const sourceStats = getFolderSourceCountStats(folder);
    const isSelected = sourceStats.active > 0;

    card.className = `folder-card ${isSelected ? 'selected' : ''}`;

    const shape = folder.tileShape || "LANDSCAPE";
    card.classList.add(`aspect-${shape.toLowerCase()}`);

    const baseImg = folder.coverImageUrl || '';
    const hoverGif = folder.focusGifUrl || baseImg;

    const logoOverlayHtml = folder.titleLogoUrl
      ? `<div class="card-logo-overlay"><img src="${folder.titleLogoUrl}" alt="${folder.title}" class="card-logo-img"></div>`
      : `<h4 class="card-text-title">${folder.title}</h4>`;

    card.innerHTML = `
      <div class="card-artwork-wrapper">
        <img src="${baseImg}" class="card-cover-img" alt="${folder.title}" loading="lazy">
        ${folder.focusGifUrl ? `<img src="${hoverGif}" class="card-gif-img" alt="${folder.title} preview" loading="lazy">` : ''}
      </div>
      <div class="card-overlay-gradient"></div>
      
      <div class="card-controls-header">
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
      </div>
      
      ${logoOverlayHtml}
    `;

    // Hover → update backdrop
    card.addEventListener('mouseenter', () => {
      setCinematicWallpaper(folder);
    });

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

    grid.appendChild(card);
  });
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
  if (subtitleEl && !isGuideActive) {
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
          <h4 class="guide-step-title">Choose How to Import</h4>
          <p class="guide-step-desc">You can load the file into Nuvio in two ways:</p>
          <div class="guide-methods-grid">
            <div class="guide-method-box">
              <span class="guide-method-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Upload the JSON File
              </span>
              <p class="guide-method-desc">Use the downloaded file and upload it through Nuvio's import screen.</p>
            </div>
            <div class="guide-method-box">
              <span class="guide-method-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Paste a Remote Link
              </span>
              <p class="guide-method-desc">Click <strong>Copy Link</strong> to get a direct URL, then paste it into Nuvio's remote import field.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="guide-step-card">
        <div class="guide-step-num-badge">03</div>
        <div class="guide-step-content">
          <h4 class="guide-step-title">Import in Nuvio</h4>
          <p class="guide-step-desc">Open your Nuvio app and head to the import settings:</p>
          <ul class="guide-step-list">
            <li>Open the Nuvio configuration or admin panel.</li>
            <li>Find the <strong>Import / Database</strong> settings.</li>
            <li><strong>File upload:</strong> Browse for your downloaded JSON and import it.</li>
            <li><strong>Remote URL:</strong> Paste the copied link and hit fetch.</li>
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

  // Count global stats
  let totalSelectedFolders = 0;
  let totalSelectedSources = 0;
  database.forEach((_, idx) => {
    const s = getCategorySelectionStats(idx);
    totalSelectedFolders += s.selectedFolders;
    totalSelectedSources += s.selectedSources;
  });

  const container = document.createElement('div');
  container.className = 'preview-container';

  // Top bar with back button
  const topBar = document.createElement('div');
  topBar.className = 'preview-top-bar';
  topBar.innerHTML = `
    <button class="preview-back-btn" id="preview-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      Back to Editor
    </button>
  `;
  container.appendChild(topBar);

  // Hero header
  const hero = document.createElement('div');
  hero.className = 'preview-hero';
  hero.innerHTML = `
    <h2 class="preview-hero-title">Your Collection</h2>
    <p class="preview-hero-sub"><strong>${totalSelectedFolders}</strong> folders · <strong>${totalSelectedSources}</strong> sources across ${database.length} categories</p>
  `;
  container.appendChild(hero);

  // Check if anything is selected
  if (totalSelectedFolders === 0) {
    const empty = document.createElement('div');
    empty.className = 'preview-empty';
    empty.innerHTML = `
      <h3>Nothing selected yet</h3>
      <p>Head back to the editor and start picking folders to build your collection.</p>
    `;
    container.appendChild(empty);
    canvas.appendChild(container);
    bindPreviewBackButton();
    return;
  }

  // Build horizontal scroll rows per category
  database.forEach((category, idx) => {
    const selectedFolders = getSelectedFoldersForPreview(category);
    if (selectedFolders.length === 0) return;

    const emoji = getCategoryEmoji(category.title);

    const row = document.createElement('div');
    row.className = 'preview-category-row';

    // Category header
    const header = document.createElement('div');
    header.className = 'preview-category-header';
    header.innerHTML = `
      <span class="preview-category-emoji">${emoji}</span>
      <span class="preview-category-title">${category.title}</span>
      <span class="preview-category-count">${selectedFolders.length} folders</span>
    `;
    row.appendChild(header);

    // Horizontal scroll track of cards
    const track = document.createElement('div');
    track.className = 'preview-scroll-track';

    selectedFolders.forEach(folder => {
      const shape = (folder.tileShape || 'LANDSCAPE').toLowerCase();
      const card = document.createElement('div');
      card.className = `preview-card shape-${shape}`;

      const imgSrc = folder.coverImageUrl || '';
      const logoHtml = folder.titleLogoUrl
        ? `<img class="preview-card-logo" src="${folder.titleLogoUrl}" alt="${folder.title}">`
        : `<span class="preview-card-title">${folder.title}</span>`;

      card.innerHTML = `
        <img class="preview-card-img" src="${imgSrc}" alt="${folder.title}" loading="lazy">
        <div class="preview-card-gradient"></div>
        ${logoHtml}
      `;

      // Hover to change backdrop
      card.addEventListener('mouseenter', () => {
        setCinematicWallpaper(folder);
      });

      track.appendChild(card);
    });

    row.appendChild(track);
    container.appendChild(row);
  });

  canvas.appendChild(container);
  bindPreviewBackButton();
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

function bindPreviewBackButton() {
  const backBtn = document.getElementById('preview-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      isPreviewActive = false;
      // Return to the last viewed category, or first one
      const targetIdx = currentCategoryIdx >= 0 ? currentCategoryIdx : 0;
      switchCategory(targetIdx);
    });
  }
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

  sources.forEach(source => {
    const sourceKey = getSourceKey(source);
    const isSelected = selectedMap[folderKey] && selectedMap[folderKey][sourceKey];

    const row = document.createElement('div');
    row.className = `source-row-item ${isSelected ? 'selected' : ''}`;

    const mediaPill = source.mediaType ? source.mediaType : 'All';
    const providerPill = source.provider ? source.provider.toLowerCase() : 'tmdb';

    row.innerHTML = `
      <div class="source-checkbox-container">
        <div class="source-checkbox-visual">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
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
      if (subtitleEl && !isGuideActive) {
        subtitleEl.textContent = `${stats.selectedFolders} of ${stats.totalFolders} folders selected`;
      }
    });

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

function assembleFilteredDatabase() {
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
      customConfig.push(categoryClone);
    }
  });

  return customConfig;
}

function handleClipboardSelectionCopy(buttonElement) {
  const remoteUrl = `${RAW_GITHUB_BASE}/nuvio_mega_collection.json`;

  navigator.clipboard.writeText(remoteUrl).then(() => {
    showToast("Import link copied to clipboard. Paste it into Nuvio's remote import field.", "success");

    const spanText = buttonElement.querySelector('span');
    const originalText = spanText ? spanText.textContent : 'Copy Link';
    const svgIcon = buttonElement.querySelector('svg');
    const originalSvgHtml = svgIcon ? svgIcon.innerHTML : '';

    buttonElement.style.borderColor = 'var(--success)';
    buttonElement.style.color = 'var(--success)';

    if (spanText) spanText.textContent = 'Copied!';
    if (svgIcon) {
      svgIcon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
      svgIcon.style.color = 'var(--success)';
    }

    setTimeout(() => {
      buttonElement.style.borderColor = '';
      buttonElement.style.color = '';
      if (spanText) spanText.textContent = originalText;
      if (svgIcon) {
        svgIcon.innerHTML = originalSvgHtml;
        svgIcon.style.color = '';
      }
    }, 2000);
  }).catch(err => {
    showToast("Couldn't copy to clipboard. Try selecting the link manually.", "error");
  });
}

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

  // Download button
  const btnCompile = document.getElementById('btn-compile-download');
  if (btnCompile) btnCompile.addEventListener('click', compileAndDownloadJSON);

  // Copy link button
  const btnCopy = document.getElementById('btn-copy-selection-link');
  if (btnCopy) {
    btnCopy.addEventListener('click', (e) => {
      handleClipboardSelectionCopy(e.currentTarget);
    });
  }

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

  // ESC key to close drawer or end walkthrough
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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

  // Walkthrough UX integration: automatically switch to the Preview view when entering Step 4
  if (index === 4) {
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
