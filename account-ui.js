/**
 * Optional Save UI: account icon on every screen, simple menu, keys setup.
 * Hidden unless KaptainAccount.isEnabled().
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') window.showToast(msg, kind || 'success');
    else console.log('[KaptainAccount]', msg);
  }

  function st() {
    return (window.KaptainAccount && window.KaptainAccount.status()) || {
      enabled: false, unlocked: false, hasLocalVault: false
    };
  }

  function setMenuOpen(open) {
    const menu = $('account-menu');
    const fab = $('account-fab');
    if (!menu || !fab) return;
    menu.hidden = !open;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function refreshChrome() {
    const acct = window.KaptainAccount;
    const chrome = $('account-chrome');
    const enabled = !!(acct && acct.isEnabled());
    if (chrome) chrome.hidden = !enabled;
    if (!enabled) {
      setMenuOpen(false);
      return;
    }

    const s = st();
    const statusEl = $('account-menu-status');
    if (statusEl) {
      if (s.unlocked) {
        statusEl.textContent = 'Autosave is on. Edits are saved on this device as you go.';
      } else if (s.hasLocalVault) {
        statusEl.textContent = 'Autosave is set up. Enter your save password once to restore keys and picks.';
      } else {
        statusEl.textContent = 'Optional autosave: remember API keys and collection picks on this browser.';
      }
    }

    const menu = $('account-menu');
    if (menu) {
      const visibility = {
        setup: !s.hasLocalVault && !s.unlocked,
        unlock: !s.unlocked && s.hasLocalVault,
        keys: s.unlocked,
        save: s.unlocked,
        lock: s.unlocked,
        wipe: s.hasLocalVault,
        privacy: true,
      };
      menu.querySelectorAll('[data-account-action]').forEach((el) => {
        const a = el.getAttribute('data-account-action');
        const show = !!visibility[a];
        el.hidden = !show;
        el.style.display = show ? '' : 'none';
      });
    }

    const dot = $('account-fab-dot');
    if (dot) {
      dot.hidden = !s.unlocked;
      dot.style.display = s.unlocked ? '' : 'none';
      dot.title = s.unlocked ? 'Autosave on' : '';
    }
    const fab = $('account-fab');
    if (fab) {
      fab.title = s.unlocked
        ? 'Account · autosave on'
        : (s.hasLocalVault ? 'Account · enter save password' : 'Account · optional autosave');
      fab.classList.toggle('is-unlocked', !!s.unlocked);
    }
  }

  function setTitle(text) {
    const t = $('account-title');
    if (t) t.textContent = text;
  }

  function showView(name) {
    const titles = {
      create: 'Set up autosave',
      unlock: 'Restore your setup',
      keys: 'API keys & tokens',
      privacy: 'How your keys stay private',
    };
    setTitle(titles[name] || 'Save');
    ['create', 'unlock', 'keys', 'privacy'].forEach((v) => {
      const panel = $('account-view-' + v);
      if (panel) panel.hidden = v !== name;
    });
    const err = $('account-error');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  function openModal(view) {
    const ov = $('account-overlay');
    if (!ov) return;
    setMenuOpen(false);
    const moreToggle = $('title-more-toggle');
    const morePanel = $('title-more-panel');
    if (moreToggle && morePanel && moreToggle.getAttribute('aria-expanded') === 'true') {
      moreToggle.setAttribute('aria-expanded', 'false');
      morePanel.hidden = true;
      moreToggle.classList.remove('open');
    }
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    const s = st();
    let next = view;
    if (!next) {
      if (s.unlocked) next = 'keys';
      else if (s.hasLocalVault) next = 'unlock';
      else next = 'create';
    }
    showView(next);
    if (next === 'keys') fillKeysForm();
  }

  function closeModal() {
    const ov = $('account-overlay');
    if (ov) {
      ov.classList.remove('open');
      ov.setAttribute('aria-hidden', 'true');
    }
    refreshChrome();
  }

  function showError(msg) {
    const err = $('account-error');
    if (!err) return;
    err.textContent = msg;
    err.hidden = !msg;
  }

  function fillKeysForm() {
    let keys = {};
    let prefs = {};
    try {
      const snap = window.KaptainAccountBridge && window.KaptainAccountBridge.snapshot
        ? window.KaptainAccountBridge.snapshot()
        : null;
      keys = (snap && snap.keys) || {};
      prefs = (snap && snap.prefs) || {};
    } catch (e) { keys = {}; prefs = {}; }
    const map = {
      'account-key-torbox': keys.torboxKey || '',
      'account-key-tmdb': keys.tmdbKey || '',
      'account-key-mdblist': keys.mdblistKey || keys.forYouMdblistKey || '',
      'account-key-nuvio-email': keys.nuvioEmail || prefs.email || '',
      'account-key-nuvio-password': keys.nuvioPassword || '',
      'account-key-rpdb': keys.aioRpdbKey || '',
      'account-key-debrid': keys.aioDebridKey || '',
    };
    Object.keys(map).forEach((id) => {
      const el = $(id);
      if (el) el.value = map[id];
    });
  }

  function readKeysForm() {
    return {
      torboxKey: (($('account-key-torbox') || {}).value || '').trim(),
      tmdbKey: (($('account-key-tmdb') || {}).value || '').trim(),
      mdblistKey: (($('account-key-mdblist') || {}).value || '').trim(),
      forYouMdblistKey: (($('account-key-mdblist') || {}).value || '').trim(),
      nuvioEmail: (($('account-key-nuvio-email') || {}).value || '').trim(),
      nuvioPassword: (($('account-key-nuvio-password') || {}).value || ''),
      aioRpdbKey: (($('account-key-rpdb') || {}).value || '').trim(),
      aioDebridKey: (($('account-key-debrid') || {}).value || '').trim(),
    };
  }

  async function applyKeysAndSave() {
    const keys = readKeysForm();
    const prefs = { email: keys.nuvioEmail || '' };
    if (window.KaptainAccountBridge && typeof window.KaptainAccountBridge.apply === 'function') {
      await window.KaptainAccountBridge.apply({ keys: keys, collection: {}, prefs: prefs });
    } else if (window.NuvioWizard && typeof window.NuvioWizard.applyVaultFields === 'function') {
      window.NuvioWizard.applyVaultFields({ keys: keys, prefs: prefs });
    }
    // Keep Quick Editor fields in sync when present
    try {
      if (typeof window !== 'undefined') {
        const seMap = [
          ['se-torbox-key', keys.torboxKey],
          ['se-tmdb-key', keys.tmdbKey],
          ['se-mdblist-key', keys.mdblistKey],
        ];
        seMap.forEach(([id, val]) => {
          const el = $(id);
          if (el) el.value = val;
        });
      }
    } catch (e) { /* ignore */ }

    const ok = await window.KaptainAccount.persistNow();
    if (!ok) throw new Error('Unlock Save first, then try again.');
    return true;
  }

  async function onCreate() {
    const pass = ($('account-pass-create') || {}).value || '';
    const confirm = ($('account-pass-confirm') || {}).value || '';
    if (pass !== confirm) return showError('Those passwords do not match.');
    try {
      await window.KaptainAccount.createVault(pass);
      toast('Autosave is on. Changes will be remembered on this device.');
      closeModal();
      refreshChrome();
      openModal('keys');
    } catch (e) {
      showError(e.message || String(e));
    }
  }

  async function onUnlock() {
    const pass = ($('account-pass-unlock') || {}).value || '';
    try {
      await window.KaptainAccount.unlockWithPassphrase(pass);
      toast('Restored. Autosave is on again for this session.');
      closeModal();
      refreshChrome();
    } catch (e) {
      showError('Could not restore. Check the save password.');
    }
  }

  async function saveProgress() {
    setMenuOpen(false);
    const s = st();
    if (!s.unlocked) {
      openModal(s.hasLocalVault ? 'unlock' : 'create');
      return;
    }
    try {
      const ok = await window.KaptainAccount.persistNow();
      toast(ok ? 'Saved.' : 'Enter your save password first.');
      refreshChrome();
    } catch (e) {
      toast(e.message || 'Save failed.', 'error');
    }
  }

  function handleAction(action) {
    if (action === 'save') return saveProgress();
    if (action === 'setup') {
      setMenuOpen(false);
      return openModal('create');
    }
    if (action === 'unlock') {
      setMenuOpen(false);
      return openModal('unlock');
    }
    if (action === 'keys') {
      setMenuOpen(false);
      return openModal('keys');
    }
    if (action === 'privacy') {
      setMenuOpen(false);
      return openModal('privacy');
    }
    if (action === 'lock') {
      setMenuOpen(false);
      window.KaptainAccount.lock();
      toast('Locked. Enter your save password again when you come back.');
      refreshChrome();
      return;
    }
    if (action === 'wipe') {
      setMenuOpen(false);
      if (!confirm('Remove saved keys and picks from this browser? You can set autosave up again afterward.')) return;
      window.KaptainAccount.wipeLocalVault();
      toast('Saved data removed from this device.');
      refreshChrome();
    }
  }

  function wireTips() {
    document.querySelectorAll('.account-tip[data-tip]').forEach((tip) => {
      if (tip._wired) return;
      tip._wired = true;
      const show = () => {
        let bubble = tip.querySelector('.account-tip-bubble');
        if (!bubble) {
          bubble = document.createElement('span');
          bubble.className = 'account-tip-bubble';
          bubble.textContent = tip.getAttribute('data-tip') || '';
          tip.appendChild(bubble);
        }
        bubble.hidden = false;
      };
      const hide = () => {
        const bubble = tip.querySelector('.account-tip-bubble');
        if (bubble) bubble.hidden = true;
      };
      tip.addEventListener('mouseenter', show);
      tip.addEventListener('mouseleave', hide);
      tip.addEventListener('focus', show);
      tip.addEventListener('blur', hide);
      tip.addEventListener('click', (e) => {
        e.preventDefault();
        const bubble = tip.querySelector('.account-tip-bubble');
        if (bubble && !bubble.hidden) hide();
        else show();
      });
    });
  }

  function wire() {
    if (!window.KaptainAccount || !window.KaptainAccount.isEnabled()) {
      refreshChrome();
      return;
    }

    refreshChrome();
    wireTips();

    const fab = $('account-fab');
    if (fab) {
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = $('account-menu');
        const open = menu && menu.hidden;
        setMenuOpen(!!open);
        refreshChrome();
      });
    }

    document.addEventListener('click', (e) => {
      const chrome = $('account-chrome');
      if (!chrome || chrome.hidden) return;
      if (!chrome.contains(e.target)) setMenuOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        const ov = $('account-overlay');
        if (ov && ov.classList.contains('open')) closeModal();
      }
    });

    document.querySelectorAll('[data-account-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const action = el.getAttribute('data-account-action');
        if (!action) return;
        // In-panel privacy link should not double-toggle menu
        if (el.classList.contains('account-text-link')) e.preventDefault();
        handleAction(action);
      });
    });

    $('account-close')?.addEventListener('click', closeModal);
    $('account-overlay')?.addEventListener('click', (e) => {
      if (e.target === $('account-overlay')) closeModal();
    });
    document.querySelectorAll('.account-goto-close').forEach((b) => {
      b.addEventListener('click', closeModal);
    });

    $('account-btn-create')?.addEventListener('click', onCreate);
    $('account-btn-unlock')?.addEventListener('click', onUnlock);
    $('account-goto-create')?.addEventListener('click', () => showView('create'));
    $('account-goto-unlock')?.addEventListener('click', () => showView('unlock'));
    $('account-btn-keys-save')?.addEventListener('click', async () => {
      try {
        await applyKeysAndSave();
        toast('Keys saved.');
        closeModal();
        refreshChrome();
      } catch (e) {
        showError(e.message || String(e));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.KaptainAccountUi = {
    openModal,
    closeModal,
    refreshChrome,
    saveProgress,
  };
})();
