(function() {
  const overlay = document.getElementById('customize-overlay');
  if (!overlay) return;
  const body = document.getElementById('customize-body');
  
  let currentStep = 1;
  const TOTAL_STEPS = 5;
  const STEP_NAMES = ['Region & Lang', 'Filters', 'Categories', 'Streaming', 'Networks'];
  
  window.customizeState = {
    locale: 'en',
    country: '',
    foreignNative: true,
    excludeAnime: false,
    excludeBollywood: false,
    excludeHorror: false,
    excludeRomance: false,
    excludeKids: false,
    excludeReality: false,
    selectedCategories: new Set(),
    selectedStreaming: new Set(),
    selectedNetworks: new Set(),
    streamingSort: 'popular',
    voteScale: 1,
    ratingBump: 0
  };

  function initSelectAllDefaults(data) {
    window.customizeState.selectedCategories = new Set();
    window.customizeState.selectedStreaming = new Set();
    window.customizeState.selectedNetworks = new Set();

    data.forEach(cat => {
      const title = cat.title || '';
      if (title === 'Streaming Services') {
        cat.folders?.forEach(f => {
          if (f.title) window.customizeState.selectedStreaming.add(f.title);
        });
      } else if (title === 'Networks') {
        cat.folders?.forEach(f => {
          if (f.title) window.customizeState.selectedNetworks.add(f.title);
        });
      } else {
        window.customizeState.selectedCategories.add(title);
      }
    });

    // Exclusions start unchecked (everything allowed by default)
    window.customizeState.excludeAnime = false;
    window.customizeState.excludeBollywood = false;
    window.customizeState.excludeHorror = false;
    window.customizeState.excludeRomance = false;
    window.customizeState.excludeKids = false;
    window.customizeState.excludeReality = false;
  }

  function render() {
    if (currentStep === 1) renderStep1();
    else if (currentStep === 2) renderStep2();
    else if (currentStep === 3) renderStep3();
    else if (currentStep === 4) renderStep4();
    else if (currentStep === 5) renderStep5();
  }

  function nextStep() {
    if (currentStep < TOTAL_STEPS) {
      currentStep++;
      render();
    } else {
      finishCustomize();
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
      render();
    }
  }

  function finishCustomize() {
    overlay.hidden = true;
    overlay.classList.remove('open');
    overlay.classList.remove('active');
    
    if (window.hideTitleScreen) window.hideTitleScreen();
    if (window.initializeSelections) window.initializeSelections();
    
    applyCustomizeStateToSelectedMap();
    
    if (typeof isPreviewActive !== 'undefined' && isPreviewActive) {
      if (window.renderSidebar) window.renderSidebar();
      if (window.renderPreviewCollection) window.renderPreviewCollection();
    } else {
      if (window.jumpToCategory) window.jumpToCategory(window.currentCategoryIdx || 0);
    }
  }

  function applyCustomizeStateToSelectedMap() {
    const data = window.collectionData || window.database || window.NUVIO_DATABASE;
    if (!data) return;
    
    data.forEach(cat => {
      const catTitle = cat.title || '';
      
      if (catTitle === 'Streaming Services') {
         cat.folders?.forEach(f => {
            if (!window.customizeState.selectedStreaming.has(f.title)) {
               deselectFolder(f);
            }
         });
      } else if (catTitle === 'Networks') {
         cat.folders?.forEach(f => {
            if (!window.customizeState.selectedNetworks.has(f.title)) {
               deselectFolder(f);
            }
         });
      } else {
        if (!window.customizeState.selectedCategories.has(catTitle)) {
           deselectCategory(cat);
        }
      }
    });

    data.forEach(cat => {
      const catTitle = cat.title || '';
      if (window.customizeState.excludeAnime && catTitle === 'Anime') {
         deselectCategory(cat);
      }
      if (window.customizeState.excludeKids && (catTitle === 'Kids & Family' || catTitle.includes('Kids'))) {
         deselectCategory(cat);
      }
      
      cat.folders?.forEach(f => {
         const fTitle = f.title || '';
         if (window.customizeState.excludeBollywood && (fTitle.includes('Indian') || fTitle.includes('Bollywood'))) {
            deselectFolder(f);
         }
         if (window.customizeState.excludeHorror && fTitle === 'Horror') {
            deselectFolder(f);
         }
         if (window.customizeState.excludeRomance && fTitle === 'Romance') {
            deselectFolder(f);
         }
      });
      if (window.customizeState.excludeReality && catTitle === 'Reality TV') {
         deselectCategory(cat);
      }
    });
    
    window.kaptainCustomize = window.customizeState;
  }
  
  function deselectCategory(cat) {
     cat.folders?.forEach(f => deselectFolder(f));
  }
  
  function deselectFolder(f) {
     const fKey = window.getFolderKey ? window.getFolderKey(f) : (f.title || '');
     if (window.selectedMap && window.selectedMap[fKey]) {
       for (let k in window.selectedMap[fKey]) {
         window.selectedMap[fKey][k] = false;
       }
     }
  }

  function getStepWrapper(title, subtitle, contentHtml, extraHeaderHtml) {
    let progressSegments = '';
    for(let i=1; i<=TOTAL_STEPS; i++) {
      const isDone = i < currentStep;
      const isActive = i === currentStep;
      progressSegments += `
        <div class="cust-prog-seg ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}" title="${STEP_NAMES[i-1]}">
          <span class="cust-prog-bar"></span>
        </div>
      `;
    }

    return `
      <div class="cust-step">
        <div class="cust-prog-wrap">
          <div class="cust-prog-track">${progressSegments}</div>
          <div class="cust-prog-meta">
            <span class="cust-prog-badge">Step ${currentStep} of ${TOTAL_STEPS}</span>
            <span class="cust-prog-name">${STEP_NAMES[currentStep-1]}</span>
          </div>
        </div>
        
        <div class="cust-step-head">
          <div class="cust-step-head-info">
            <h3 class="cust-step-title">${title}</h3>
            <p class="cust-step-sub">${subtitle}</p>
          </div>
          ${extraHeaderHtml || ''}
        </div>
        
        <div class="cust-step-content">${contentHtml}</div>
        
        <div class="cust-step-footer">
          <button type="button" class="cust-btn-back" id="cust-btn-prev" ${currentStep === 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Back</span>
          </button>
          
          <button type="button" class="cust-btn-next" id="cust-btn-next">
            <span>${currentStep === TOTAL_STEPS ? 'Apply & Build Setup' : 'Continue'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function bindNav() {
    document.getElementById('cust-btn-prev')?.addEventListener('click', prevStep);
    document.getElementById('cust-btn-next')?.addEventListener('click', nextStep);
  }

  function renderStep1() {
    const html = `
      <div class="cust-step-fields">
        <div class="cust-field-card">
          <div class="cust-field-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
          </div>
          <div class="cust-field-main">
            <div class="cust-field-labels">
              <label for="cust-country" class="cust-field-title">Your Region</label>
              <p class="cust-field-hint">Prioritizes region-specific trending content for your home screen folders</p>
            </div>
            <div class="cust-select-wrap">
              <select id="cust-country" class="cust-select">
                <option value="">Global (Default)</option>
                <option value="US" ${window.customizeState.country === 'US' ? 'selected' : ''}>🇺🇸 United States</option>
                <option value="GB" ${window.customizeState.country === 'GB' ? 'selected' : ''}>🇬🇧 United Kingdom</option>
                <option value="CA" ${window.customizeState.country === 'CA' ? 'selected' : ''}>🇨🇦 Canada</option>
                <option value="AU" ${window.customizeState.country === 'AU' ? 'selected' : ''}>🇦🇺 Australia</option>
                <option value="IN" ${window.customizeState.country === 'IN' ? 'selected' : ''}>🇮🇳 India</option>
              </select>
              <svg class="cust-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>

        <div class="cust-field-card">
          <div class="cust-field-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
          </div>
          <div class="cust-field-main">
            <div class="cust-field-labels">
              <label for="cust-locale" class="cust-field-title">Interface & Catalog Language</label>
              <p class="cust-field-hint">Translates folder names and discovery metadata where supported</p>
            </div>
            <div class="cust-select-wrap">
              <select id="cust-locale" class="cust-select">
                <option value="en" ${window.customizeState.locale === 'en' ? 'selected' : ''}>English</option>
                <option value="es" ${window.customizeState.locale === 'es' ? 'selected' : ''}>Español</option>
                <option value="fr" ${window.customizeState.locale === 'fr' ? 'selected' : ''}>Français</option>
                <option value="it" ${window.customizeState.locale === 'it' ? 'selected' : ''}>Italiano</option>
                <option value="pl" ${window.customizeState.locale === 'pl' ? 'selected' : ''}>Polski</option>
              </select>
              <svg class="cust-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>

        <div class="cust-field-card cust-toggle-card">
          <div class="cust-field-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="cust-field-main cust-toggle-main">
            <div class="cust-field-labels">
              <span class="cust-field-title">Include Foreign-Language Content</span>
              <p class="cust-field-hint">When off, main discovery rows only show content in your chosen language</p>
            </div>
            <label class="cust-switch" title="Toggle foreign content">
              <input type="checkbox" id="cust-foreign" ${window.customizeState.foreignNative ? 'checked' : ''}>
              <span class="cust-slider"></span>
            </label>
          </div>
        </div>
      </div>
    `;
    body.innerHTML = getStepWrapper('Region & Language', 'Set your local preferences and region priorities.', html);
    bindNav();
    
    document.getElementById('cust-country').addEventListener('change', (e) => window.customizeState.country = e.target.value);
    document.getElementById('cust-locale').addEventListener('change', (e) => window.customizeState.locale = e.target.value);
    document.getElementById('cust-foreign').addEventListener('change', (e) => window.customizeState.foreignNative = e.target.checked);
  }

  const VOTE_SCALE_STEPS = [0.5, 1, 1.5, 2];
  const VOTE_SCALE_LABELS = ['Looser', 'Catalog', 'Stricter', 'Strictest'];
  const RATING_BUMP_STEPS = [0, 0.5, 1.0];

  function voteScaleIndex() {
    const i = VOTE_SCALE_STEPS.indexOf(window.customizeState.voteScale);
    return i >= 0 ? i : 1;
  }
  function voteScaleLabel() {
    return VOTE_SCALE_LABELS[voteScaleIndex()];
  }
  function ratingBumpIndex() {
    const i = RATING_BUMP_STEPS.indexOf(window.customizeState.ratingBump);
    return i >= 0 ? i : 0;
  }
  function ratingBumpLabel() {
    const v = window.customizeState.ratingBump;
    return v ? '+' + v.toFixed(1) : 'Off';
  }

  function renderStep2() {
    const html = `
      <div class="cust-info-card">
        <div class="cust-info-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </div>
        <div class="cust-info-text">
          <strong>Direct Search Remains Unlocked</strong>
          <p>These filters only tailor your auto-populated home screen rows. You can still search for any title directly in Nuvio anytime.</p>
        </div>
      </div>

      <div class="cust-filter-grid">
        <label class="cust-filter-card">
          <input type="checkbox" id="ex-anime" ${window.customizeState.excludeAnime ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">🌸</div>
            <div class="cust-filter-text">
              <h4>No Anime</h4>
              <p>Excludes Anime category & filters anime from discovery rows</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>

        <label class="cust-filter-card">
          <input type="checkbox" id="ex-bolly" ${window.customizeState.excludeBollywood ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">🎭</div>
            <div class="cust-filter-text">
              <h4>No Bollywood</h4>
              <p>Excludes Indian Cinema folders & filters it from discovery</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>

        <label class="cust-filter-card">
          <input type="checkbox" id="ex-horror" ${window.customizeState.excludeHorror ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">👻</div>
            <div class="cust-filter-text">
              <h4>No Horror</h4>
              <p>Excludes Horror folder & filters horror from discovery</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>

        <label class="cust-filter-card">
          <input type="checkbox" id="ex-romance" ${window.customizeState.excludeRomance ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">💖</div>
            <div class="cust-filter-text">
              <h4>No Romance</h4>
              <p>Excludes Romance folder & filters romance from discovery</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>

        <label class="cust-filter-card">
          <input type="checkbox" id="ex-kids" ${window.customizeState.excludeKids ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">🧸</div>
            <div class="cust-filter-text">
              <h4>No Kids Content</h4>
              <p>Excludes Kids & Family sections & filters family titles</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>

        <label class="cust-filter-card">
          <input type="checkbox" id="ex-reality" ${window.customizeState.excludeReality ? 'checked' : ''}>
          <div class="cust-filter-body">
            <div class="cust-filter-emoji">📺</div>
            <div class="cust-filter-text">
              <h4>No Reality TV</h4>
              <p>Excludes Reality TV category & filters reality from discovery</p>
            </div>
          </div>
          <div class="cust-filter-badge">
            <span class="badge-off">Active</span>
            <span class="badge-on">Excluded</span>
          </div>
        </label>
      </div>

      <div class="cust-slider-panel">
        <div class="cust-slider-head">
          <h4>Quality bias</h4>
          <p>Scales each row’s own Studio floor. Genre Top All Time (1000) stays much stricter than New Movies (10). Lists and Trakt sources are unchanged.</p>
        </div>
        <label class="cust-slider-row">
          <span class="cust-slider-label">Vote count</span>
          <input type="range" id="cust-vote-scale" min="0" max="3" step="1" value="${voteScaleIndex()}">
          <span class="cust-slider-value" id="cust-vote-scale-val">${voteScaleLabel()}</span>
        </label>
        <p class="cust-slider-example">Example: a 1000-vote Top All Time row becomes 500 / 1000 / 1500 / 2000. A 10-vote New row becomes 5 / 10 / 15 / 20.</p>
        <label class="cust-slider-row">
          <span class="cust-slider-label">Rating nudge</span>
          <input type="range" id="cust-rating-bump" min="0" max="2" step="1" value="${ratingBumpIndex()}">
          <span class="cust-slider-value" id="cust-rating-bump-val">${ratingBumpLabel()}</span>
        </label>
        <p class="cust-slider-example">Only raises rows that already have a rating floor (Moods). Does not invent a rating on New or Popular rows.</p>
      </div>
    `;
    body.innerHTML = getStepWrapper('Negative Filters', 'Select any content types you want excluded from your folders.', html);
    bindNav();
    
    ['anime','bolly','horror','romance','kids','reality'].forEach(key => {
      const el = document.getElementById('ex-'+key);
      if(el) {
        el.addEventListener('change', (e) => {
          if (key === 'anime') window.customizeState.excludeAnime = e.target.checked;
          if (key === 'bolly') window.customizeState.excludeBollywood = e.target.checked;
          if (key === 'horror') window.customizeState.excludeHorror = e.target.checked;
          if (key === 'romance') window.customizeState.excludeRomance = e.target.checked;
          if (key === 'kids') window.customizeState.excludeKids = e.target.checked;
          if (key === 'reality') window.customizeState.excludeReality = e.target.checked;
        });
      }
    });

    const voteEl = document.getElementById('cust-vote-scale');
    const voteVal = document.getElementById('cust-vote-scale-val');
    if (voteEl && voteVal) {
      voteEl.addEventListener('input', (e) => {
        window.customizeState.voteScale = VOTE_SCALE_STEPS[+e.target.value];
        voteVal.textContent = voteScaleLabel();
      });
    }
    const bumpEl = document.getElementById('cust-rating-bump');
    const bumpVal = document.getElementById('cust-rating-bump-val');
    if (bumpEl && bumpVal) {
      bumpEl.addEventListener('input', (e) => {
        window.customizeState.ratingBump = RATING_BUMP_STEPS[+e.target.value];
        bumpVal.textContent = ratingBumpLabel();
      });
    }
  }

  function getCategoryCover(cat) {
    if (!cat || !cat.folders) return '';
    for (let f of cat.folders) {
      if (f.coverImageUrl) return f.coverImageUrl;
      if (f.heroBackdropUrl) return f.heroBackdropUrl;
    }
    return '';
  }

  function renderStep3() {
    const data = window.collectionData || window.database || window.NUVIO_DATABASE || [];
    let catCardsHtml = '';
    
    data.forEach(cat => {
      const title = cat.title || '';
      if (title === 'Streaming Services' || title === 'Networks') return;
      
      const isChecked = window.customizeState.selectedCategories.has(title) ? 'checked' : '';
      const coverUrl = getCategoryCover(cat);
      const folderCount = cat.folders ? cat.folders.length : 0;
      
      catCardsHtml += `
        <label class="cust-visual-card">
          <input type="checkbox" value="${title}" ${isChecked}>
          <div class="cust-visual-card-bg" style="${coverUrl ? `background-image: url('${coverUrl}');` : ''}"></div>
          <div class="cust-visual-card-overlay"></div>
          <div class="cust-visual-card-content">
            <span class="cust-visual-card-title">${title}</span>
            <span class="cust-visual-card-count">${folderCount} folders</span>
          </div>
          <div class="cust-card-check-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </label>
      `;
    });
    
    const extraHeader = `
      <div class="cust-quick-toggles">
        <button type="button" class="cust-mini-btn" id="cat-select-all">Select All</button>
        <button type="button" class="cust-mini-btn" id="cat-select-none">Deselect All</button>
      </div>
    `;
    const html = `<div class="cust-visual-grid" id="cat-grid">${catCardsHtml}</div>`;
    body.innerHTML = getStepWrapper('Catalogs & Categories', 'Everything is selected by default. Uncheck any categories you don\'t want.', html, extraHeader);
    bindNav();
    
    const inputs = document.querySelectorAll('#cat-grid input');
    inputs.forEach(el => {
      el.addEventListener('change', (e) => {
        if (e.target.checked) window.customizeState.selectedCategories.add(e.target.value);
        else window.customizeState.selectedCategories.delete(e.target.value);
      });
    });
    
    document.getElementById('cat-select-all')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = true;
        window.customizeState.selectedCategories.add(el.value);
      });
    });
    document.getElementById('cat-select-none')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = false;
        window.customizeState.selectedCategories.delete(el.value);
      });
    });
  }

  function renderStep4() {
    const data = window.collectionData || window.database || window.NUVIO_DATABASE || [];
    let html = '';
    const streamingCat = data.find(c => c.title === 'Streaming Services');
    
    if (streamingCat && streamingCat.folders) {
       html = '<div class="cust-logo-grid" id="stream-grid">';
       const folders = streamingCat.folders.slice();
       const sortMode = window.customizeState.streamingSort || 'popular';
       if (sortMode === 'az') {
         folders.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
       } else if (typeof window.sortStreamingByPopular === 'function') {
         window.sortStreamingByPopular(folders);
       }
       folders.forEach(f => {
          const title = f.title || '';
          const isChecked = window.customizeState.selectedStreaming.has(title) ? 'checked' : '';
          const logoUrl = f.titleLogoUrl || f.coverImageUrl || '';
          
          html += `
            <label class="cust-logo-card">
              <input type="checkbox" value="${title}" ${isChecked}>
              <div class="cust-logo-content">
                <div class="cust-logo-wrap">
                  ${logoUrl ? `<img src="${logoUrl}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="cust-logo-fallback" style="display:none;">${title}</span>` : `<span class="cust-logo-fallback">${title}</span>`}
                </div>
                <span class="cust-logo-title">${title}</span>
              </div>
              <div class="cust-card-check-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </label>
          `;
       });
       html += '</div>';
    }
    
    const extraHeader = `
      <div class="cust-quick-toggles">
        <button type="button" class="cust-mini-btn ${window.customizeState.streamingSort === 'popular' ? 'is-active' : ''}" id="stream-sort-popular">Popular</button>
        <button type="button" class="cust-mini-btn ${window.customizeState.streamingSort === 'az' ? 'is-active' : ''}" id="stream-sort-az">A–Z</button>
        <button type="button" class="cust-mini-btn" id="stream-select-all">Select All</button>
        <button type="button" class="cust-mini-btn" id="stream-select-none">Deselect All</button>
      </div>
    `;
    body.innerHTML = getStepWrapper('Streaming Services', 'All streaming platforms are included. Uncheck any services you don\'t use.', html, extraHeader);
    bindNav();
    
    const inputs = document.querySelectorAll('#stream-grid input');
    inputs.forEach(el => {
      el.addEventListener('change', (e) => {
        if (e.target.checked) window.customizeState.selectedStreaming.add(e.target.value);
        else window.customizeState.selectedStreaming.delete(e.target.value);
      });
    });
    
    document.getElementById('stream-select-all')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = true;
        window.customizeState.selectedStreaming.add(el.value);
      });
    });
    document.getElementById('stream-select-none')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = false;
        window.customizeState.selectedStreaming.delete(el.value);
      });
    });
    document.getElementById('stream-sort-popular')?.addEventListener('click', () => {
      window.customizeState.streamingSort = 'popular';
      renderStep4();
    });
    document.getElementById('stream-sort-az')?.addEventListener('click', () => {
      window.customizeState.streamingSort = 'az';
      renderStep4();
    });
  }

  function renderStep5() {
    const data = window.collectionData || window.database || window.NUVIO_DATABASE || [];
    let html = '';
    const netCat = data.find(c => c.title === 'Networks');
    
    if (netCat && netCat.folders) {
       html = '<div class="cust-logo-grid" id="net-grid">';
       netCat.folders.forEach(f => {
          const title = f.title || '';
          const isChecked = window.customizeState.selectedNetworks.has(title) ? 'checked' : '';
          const logoUrl = f.titleLogoUrl || f.coverImageUrl || '';
          
          html += `
            <label class="cust-logo-card">
              <input type="checkbox" value="${title}" ${isChecked}>
              <div class="cust-logo-content">
                <div class="cust-logo-wrap">
                  ${logoUrl ? `<img src="${logoUrl}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="cust-logo-fallback" style="display:none;">${title}</span>` : `<span class="cust-logo-fallback">${title}</span>`}
                </div>
                <span class="cust-logo-title">${title}</span>
              </div>
              <div class="cust-card-check-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </label>
          `;
       });
       html += '</div>';
    }
    
    const extraHeader = `
      <div class="cust-quick-toggles">
        <button type="button" class="cust-mini-btn" id="net-select-all">Select All</button>
        <button type="button" class="cust-mini-btn" id="net-select-none">Deselect All</button>
      </div>
    `;
    body.innerHTML = getStepWrapper('TV Networks', 'All TV networks are included. Uncheck any networks you don\'t watch.', html, extraHeader);
    bindNav();
    
    const inputs = document.querySelectorAll('#net-grid input');
    inputs.forEach(el => {
      el.addEventListener('change', (e) => {
        if (e.target.checked) window.customizeState.selectedNetworks.add(e.target.value);
        else window.customizeState.selectedNetworks.delete(e.target.value);
      });
    });
    
    document.getElementById('net-select-all')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = true;
        window.customizeState.selectedNetworks.add(el.value);
      });
    });
    document.getElementById('net-select-none')?.addEventListener('click', () => {
      inputs.forEach(el => {
        el.checked = false;
        window.customizeState.selectedNetworks.delete(el.value);
      });
    });
  }

  window.startCustomize = function() {
    const data = window.collectionData || window.database || window.NUVIO_DATABASE;
    if (!data || !data.length) {
      console.warn('No collection data available yet');
      return;
    }
    window.collectionData = data;
    
    // Default to everything selected so users only uncheck what they don't want
    initSelectAllDefaults(data);
    
    overlay.hidden = false;
    overlay.classList.add('open');
    overlay.classList.add('active');
    currentStep = 1;
    render();
  };

  document.getElementById('customize-close')?.addEventListener('click', () => {
    overlay.hidden = true;
    overlay.classList.remove('open');
    overlay.classList.remove('active');
  });

})();
