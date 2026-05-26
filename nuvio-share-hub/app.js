/**
 * Nuvio Share Hub & Official Guide - Main Controller
 * Professional ES6 Web Application Logic
 */

// GitHub Integration Configuration
const GITHUB_USER = 'ImKaptain';
const GITHUB_REPO = 'Kaptains-collection';
const GITHUB_BRANCH = 'main';

// Raw content base URL for remote Nuvio importing
const RAW_GITHUB_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/collections`;

// Local State
let collectionsData = null;
let currentSearch = '';
let currentFilter = 'all';

// Fallback metadata for local double-click (file:// protocol) where fetch is blocked by CORS
const FALLBACK_METADATA = {
  "mega_collection": {
    "filename": "nuvio_mega_collection.json",
    "title": "Nuvio Mega Collection",
    "description": "Complete premium collection combined into a single, high-fidelity file. Instantly imports all 11 categories with over 350+ fully customized folders, custom base & hover cards, and active dynamic artwork.",
    "categories_count": 11,
    "folders_count": 356,
    "size_kb": 637.3
  },
  "individual_collections": [
    {
      "id": "collection-UGED6TEZ",
      "title": "For You / Trending / New",
      "filename": "for_you_trending_new.json",
      "description": "Dynamic, up-to-date lists including Trakt Up Next, Recommendations, and your personal Watchlist with custom animated hover cards.",
      "icon": "⚡",
      "tag": "Media",
      "folders_count": 5,
      "size_kb": 33.5
    },
    {
      "id": "collection-streaming",
      "title": "Streaming Services",
      "filename": "streaming_services.json",
      "description": "Premium matching base and hover cards for all major streaming platforms including Netflix, Disney+, HBO Max, Hulu, Apple TV+, and Prime Video.",
      "icon": "🎬",
      "tag": "Services",
      "folders_count": 16,
      "size_kb": 31.5
    },
    {
      "id": "collection-networks",
      "title": "Networks",
      "filename": "networks.json",
      "description": "Massive collection of custom artwork and effects for television networks including AMC, BBC, FX, HBO, Showtime, CW, and global channels.",
      "icon": "📺",
      "tag": "Networks",
      "folders_count": 30,
      "size_kb": 42.1
    },
    {
      "id": "collection-genres",
      "title": "Genres",
      "filename": "genres.json",
      "description": "Beautiful cinematic backdrops and folder designs for Action, Comedy, Sci-Fi, Horror, Anime, and all major film & TV genres.",
      "icon": "🎭",
      "tag": "Genres",
      "folders_count": 21,
      "size_kb": 87.1
    },
    {
      "id": "collection-films",
      "title": "Film Collections",
      "filename": "film_collections.json",
      "description": "Custom-designed folder layouts for major cinematic universes, sagas, and movie franchises (Marvel, Star Wars, Harry Potter, DC, etc.).",
      "icon": "📦",
      "tag": "Collections",
      "folders_count": 175,
      "size_kb": 182.2
    },
    {
      "id": "collection-actors",
      "title": "Actors",
      "filename": "actors.json",
      "description": "Spotlight folder designs and elegant custom artwork for 58 of cinema's most popular, legendary, and trending actors.",
      "icon": "🌟",
      "tag": "Actors",
      "folders_count": 58,
      "size_kb": 128.7
    },
    {
      "id": "collection-directors",
      "title": "Legendary Directors",
      "filename": "legendary_directors.json",
      "description": "Custom showcase layouts honoring legendary filmmakers (Christopher Nolan, Quentin Tarantino, Martin Scorsese, Stanley Kubrick, and more).",
      "icon": "🎥",
      "tag": "Directors",
      "folders_count": 20,
      "size_kb": 20.0
    },
    {
      "id": "collection-studios",
      "title": "Studios",
      "filename": "studios.json",
      "description": "Dedicated studio spotlights for major production houses and animation studios including Studio Ghibli, Pixar, A24, Marvel, and more.",
      "icon": "🏰",
      "tag": "Studios",
      "folders_count": 17,
      "size_kb": 47.7
    },
    {
      "id": "collection-decades",
      "title": "By Decade",
      "filename": "by_decade.json",
      "description": "Nostalgic time-capsule folders grouping cinematic masterpieces and hit TV shows by decade, spanning from the 1950s to the 2020s.",
      "icon": "📅",
      "tag": "Decades",
      "folders_count": 8,
      "size_kb": 52.1
    },
    {
      "id": "collection-anime",
      "title": "Anime",
      "filename": "anime.json",
      "description": "Dedicated anime worlds collection featuring custom artwork for popular series, Shonen hits, and major anime franchises.",
      "icon": "🔥",
      "tag": "Anime",
      "folders_count": 5,
      "size_kb": 4.8
    },
    {
      "id": "collection-awards",
      "title": "Awards",
      "filename": "awards.json",
      "description": "Prestigious award categories showcasing Academy Awards (Oscars), Golden Globes, and Cannes Film Festival spotlight folders.",
      "icon": "🏆",
      "tag": "Awards",
      "folders_count": 1,
      "size_kb": 7.6
    }
  ]
};

/* ==========================================================================
   PAGE INITIALIZATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initInstallationGuide();
  loadCollectionsData();
  setupSearchAndFilters();
  setupFeaturedActions();
});

/* ==========================================================================
   DATA LOADING & CORS FALLBACK
   ========================================================================== */

async function loadCollectionsData() {
  try {
    // If run locally under file:// fetch will error, triggering fallback
    const response = await fetch('./collections/metadata.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    collectionsData = data;
    console.log("Loaded metadata dynamically:", data);
  } catch (error) {
    console.warn("Could not load dynamic metadata (common in offline files). Loading high-fidelity fallback:", error);
    collectionsData = FALLBACK_METADATA;
  }
  
  // Render views
  renderFeaturedStats();
  renderGridCards();
}

function renderFeaturedStats() {
  if (!collectionsData || !collectionsData.mega_collection) return;
  const mega = collectionsData.mega_collection;
  
  document.getElementById('mega-folders-count').textContent = mega.folders_count;
  document.getElementById('mega-categories-count').textContent = mega.categories_count;
  document.getElementById('mega-size-kb').textContent = `${mega.size_kb} KB`;
}

/* ==========================================================================
   GRID CARD RENDERING & MATCHING FILTERS
   ========================================================================== */

function renderGridCards() {
  const grid = document.getElementById('explorer-grid');
  if (!grid || !collectionsData) return;
  
  grid.innerHTML = ''; // Clear skeleton items
  
  const items = collectionsData.individual_collections;
  
  // Apply Search + Filter lists
  const filteredItems = items.filter(item => {
    // 1. Keyword search check
    const query = currentSearch.toLowerCase().trim();
    const matchesSearch = query === '' || 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.tag.toLowerCase().includes(query);
      
    // 2. Category tag check
    let matchesCategory = false;
    if (currentFilter === 'all') {
      matchesCategory = true;
    } else if (currentFilter === 'actors') {
      // Group Actors and Directors tag pill together
      matchesCategory = item.tag.toLowerCase() === 'actors' || item.tag.toLowerCase() === 'directors';
    } else {
      matchesCategory = item.tag.toLowerCase() === currentFilter.toLowerCase();
    }
    
    return matchesSearch && matchesCategory;
  });
  
  if (filteredItems.length === 0) {
    renderNoResults(grid);
    return;
  }
  
  filteredItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'explorer-card';
    
    // Direct GitHub URL for copying
    const copyUrl = `${RAW_GITHUB_BASE}/${item.filename}`;
    
    card.innerHTML = `
      <div class="card-header-area">
        <div class="card-title-combo">
          <span class="card-cat-tag">${item.tag}</span>
          <h3 class="card-title">${item.title}</h3>
        </div>
        <div class="card-icon-badge">${item.icon}</div>
      </div>
      <p class="card-desc">${item.description}</p>
      <div class="card-details-stats">
        <div class="card-stat-pill">
          <span class="card-stat-bullet"></span>
          <strong>${item.folders_count}</strong> folders
        </div>
        <div class="card-stat-pill">
          <span class="card-stat-bullet"></span>
          <strong>${item.size_kb} KB</strong>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-download" data-file="${item.filename}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Download
        </button>
        <button class="btn btn-secondary btn-copy" data-url="${copyUrl}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy Link</span>
        </button>
      </div>
    `;
    
    // Bind button events inside card
    card.querySelector('.btn-download').addEventListener('click', () => {
      triggerFileDownload(item.filename);
    });
    
    card.querySelector('.btn-copy').addEventListener('click', (e) => {
      handleClipboardCopy(e.currentTarget, copyUrl, item.title);
    });
    
    grid.appendChild(card);
  });
}

function renderNoResults(grid) {
  grid.innerHTML = `
    <div class="no-results animate-fade-in">
      <svg class="no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
      <h3>No Collections Found</h3>
      <p>We couldn't find anything matching "${currentSearch}". Try refining your keywords or checking another category pill.</p>
    </div>
  `;
}

/* ==========================================================================
   DOWNLOADS & CLIPBOARD ACTIONS
   ========================================================================== */

function setupFeaturedActions() {
  const btnDownloadMega = document.getElementById('btn-download-mega');
  const btnCopyMega = document.getElementById('btn-copy-mega');
  
  if (btnDownloadMega) {
    btnDownloadMega.addEventListener('click', () => {
      triggerFileDownload('nuvio_mega_collection.json');
    });
  }
  
  if (btnCopyMega) {
    btnCopyMega.addEventListener('click', (e) => {
      const megaUrl = `${RAW_GITHUB_BASE}/nuvio_mega_collection.json`;
      handleClipboardCopy(e.currentTarget, megaUrl, 'Nuvio Mega Collection');
    });
  }
}

/**
 * Initiates native browser file download (Method A)
 */
function triggerFileDownload(filename) {
  const downloadUrl = `collections/${filename}`;
  
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(`📥 Started downloading ${filename}! Check your downloads folder.`, 'success');
}

/**
 * Copies the raw Github URL to user clipboard and handles active UI animations (Method B)
 */
function handleClipboardCopy(buttonElement, url, name) {
  // Use Clipboard API
  navigator.clipboard.writeText(url).then(() => {
    // 1. Show dynamic Toast notification
    showToast(`📋 Copied URL for "${name}" to clipboard! Ready to paste into Nuvio.`, 'success');
    
    // 2. Animate button state changes
    const spanText = buttonElement.querySelector('span');
    const originalText = spanText ? spanText.textContent : 'Copy Link';
    const svgIcon = buttonElement.querySelector('svg');
    const originalSvgHtml = svgIcon ? svgIcon.innerHTML : '';
    
    // Apply copy success state styling classes
    buttonElement.classList.add('copy-success');
    buttonElement.style.borderColor = 'var(--accent)';
    buttonElement.style.boxShadow = '0 0 14px var(--accent-glow)';
    
    if (spanText) spanText.textContent = 'Copied!';
    if (svgIcon) {
      // Swaps icon to standard checkmark path
      svgIcon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
      svgIcon.style.color = 'var(--accent)';
    }
    
    // Revert styling after 2 seconds
    setTimeout(() => {
      buttonElement.classList.remove('copy-success');
      buttonElement.style.borderColor = '';
      buttonElement.style.boxShadow = '';
      if (spanText) spanText.textContent = originalText;
      if (svgIcon) {
        svgIcon.innerHTML = originalSvgHtml;
        svgIcon.style.color = '';
      }
    }, 2000);
    
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
    showToast('❌ Copy failed. Please select the URL and copy manually.', 'error');
  });
}

/* ==========================================================================
   INSTALLATION GUIDE ACTIVE STEP WIZARD
   ========================================================================== */

function initInstallationGuide() {
  const triggers = document.querySelectorAll('.step-trigger');
  const panes = document.querySelectorAll('.step-pane');
  const nextBtns = document.querySelectorAll('.btn-next-step');
  const prevBtns = document.querySelectorAll('.btn-prev-step');
  
  function switchStep(stepNum) {
    const num = parseInt(stepNum, 10);
    
    // Deactivate previous active trigger and pane
    triggers.forEach(t => t.classList.remove('active'));
    panes.forEach(p => p.classList.remove('active'));
    
    // Activate target elements
    const activeTrigger = document.querySelector(`.step-trigger[data-step="${num}"]`);
    const activePane = document.querySelector(`.step-pane[data-step-content="${num}"]`);
    
    if (activeTrigger) activeTrigger.classList.add('active');
    if (activePane) activePane.classList.add('active');
    
    // Scroll stepper sidebar on mobile views into focus
    if (window.innerWidth <= 992 && activeTrigger) {
      activeTrigger.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
  
  // Click on triggers directly
  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const step = trigger.getAttribute('data-step');
      switchStep(step);
    });
  });
  
  // "Next step" continue buttons inside panes
  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchStep(target);
    });
  });
  
  // "Back" prev buttons inside panes
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchStep(target);
    });
  });
}

/* ==========================================================================
   SEARCH & FILTERS EVENT HANDLERS
   ========================================================================== */

function setupSearchAndFilters() {
  const searchInput = document.getElementById('explorer-search');
  const searchClear = document.getElementById('search-clear');
  const filterPills = document.querySelectorAll('.filter-pill');
  
  if (searchInput) {
    // Filter on key releases or inputs
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderGridCards();
    });
  }
  
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      currentSearch = '';
      renderGridCards();
      searchInput.focus();
    });
  }
  
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      // Toggle pill status
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      currentFilter = pill.getAttribute('data-filter');
      renderGridCards();
    });
  });
}

/* ==========================================================================
   TOAST FLOATING SYSTEM
   ========================================================================== */

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Inline responsive SVG icons for toast types
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }
  
  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-message">${message}</div>
    <button class="toast-close">&times;</button>
  `;
  
  // Close triggers
  toast.querySelector('.toast-close').addEventListener('click', () => {
    removeToast(toast);
  });
  
  container.appendChild(toast);
  
  // Trigger flow animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // Self destruct timer
  setTimeout(() => {
    removeToast(toast);
  }, 4000);
}

function removeToast(toast) {
  toast.classList.remove('show');
  toast.addEventListener('transitionend', () => {
    toast.remove();
  });
}
