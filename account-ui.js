/**
 * Optional Account / Auto-Save UI. Renders nothing unless KaptainAccount.isEnabled().
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') window.showToast(msg, kind || 'success');
    else console.log('[KaptainAccount]', msg);
  }

  function refreshChrome() {
    const acct = window.KaptainAccount;
    const btn = $('kaptain-account-btn');
    const titleBtn = $('title-account-btn');
    const enabled = acct && acct.isEnabled();
    if (btn) btn.hidden = !enabled;
    if (titleBtn) titleBtn.hidden = !enabled;
    if (!enabled) return;

    const st = acct.status();
    const label = st.unlocked
      ? (st.cloudSignedIn ? 'Vault · synced' : 'Vault · unlocked')
      : (st.hasLocalVault ? 'Unlock Auto-Save' : 'Account / Auto-Save');
    if (btn) btn.textContent = label;
    if (titleBtn) {
      titleBtn.querySelector('.more-tile-label').textContent = label;
    }
    updateModalStatus();
  }

  function updateModalStatus() {
    const el = $('account-status-line');
    if (!el || !window.KaptainAccount) return;
    const st = window.KaptainAccount.status();
    const bits = [];
    bits.push(st.unlocked ? 'Vault unlocked' : 'Vault locked');
    bits.push(st.hasLocalVault ? 'local copy present' : 'no local vault yet');
    if (st.cloudConfigured) {
      bits.push(st.cloudSignedIn ? ('signed in as ' + (st.cloudEmail || 'account')) : 'cloud ready — not signed in');
    } else {
      bits.push('local-only (no Supabase config)');
    }
    el.textContent = bits.join(' · ');
  }

  function openModal(view) {
    const ov = $('account-overlay');
    if (!ov) return;
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    showView(view || defaultView());
    updateModalStatus();
  }

  function closeModal() {
    const ov = $('account-overlay');
    if (ov) {
      ov.classList.remove('open');
      ov.setAttribute('aria-hidden', 'true');
    }
    refreshChrome();
  }

  function defaultView() {
    const st = window.KaptainAccount.status();
    if (st.unlocked) return 'manage';
    if (st.hasLocalVault) return 'unlock';
    return 'create';
  }

  function showView(name) {
    ['create', 'unlock', 'cloud', 'manage'].forEach((v) => {
      const panel = $('account-view-' + v);
      if (panel) panel.hidden = v !== name;
    });
    const err = $('account-error');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  function showError(msg) {
    const err = $('account-error');
    if (!err) return;
    err.textContent = msg;
    err.hidden = !msg;
  }

  async function onCreate() {
    const pass = ($('account-pass-create') || {}).value || '';
    const confirm = ($('account-pass-confirm') || {}).value || '';
    if (pass !== confirm) return showError('Passphrases do not match.');
    try {
      await window.KaptainAccount.createVault(pass);
      toast('Auto-Save vault created. Your keys and picks will encrypt on this device.');
      showView('manage');
      refreshChrome();
    } catch (e) {
      showError(e.message || String(e));
    }
  }

  async function onUnlock() {
    const pass = ($('account-pass-unlock') || {}).value || '';
    try {
      await window.KaptainAccount.unlockWithPassphrase(pass);
      toast('Vault unlocked — restored your saved picks and keys.');
      showView('manage');
      refreshChrome();
    } catch (e) {
      showError(e.message || 'Could not unlock. Check the passphrase.');
    }
  }

  async function onCloudSignup() {
    if (!window.KaptainAccount.cloudConfigured()) {
      return showError('Add supabaseUrl + supabaseAnonKey in account-config.local.js first.');
    }
    const email = ($('account-cloud-email') || {}).value || '';
    const password = ($('account-cloud-password') || {}).value || '';
    try {
      const res = await window.KaptainAccount.cloudSignup(email, password);
      if (res.needsConfirm) {
        showError(res.message);
        return;
      }
      toast('Cloud account created.');
      if (window.KaptainAccount.status().unlocked) {
        await window.KaptainAccount.persistNow();
      }
      refreshChrome();
      showView('manage');
    } catch (e) {
      showError(e.message || String(e));
    }
  }

  async function onCloudLogin() {
    if (!window.KaptainAccount.cloudConfigured()) {
      return showError('Add supabaseUrl + supabaseAnonKey in account-config.local.js first.');
    }
    const email = ($('account-cloud-email') || {}).value || '';
    const password = ($('account-cloud-password') || {}).value || '';
    try {
      await window.KaptainAccount.cloudLogin(email, password);
      toast('Signed in to cloud sync.');
      if (window.KaptainAccount.status().unlocked) {
        await window.KaptainAccount.persistNow();
      }
      refreshChrome();
      showView('manage');
    } catch (e) {
      showError(e.message || String(e));
    }
  }

  function wire() {
    if (!window.KaptainAccount || !window.KaptainAccount.isEnabled()) {
      refreshChrome();
      return;
    }

    refreshChrome();

    const openers = [$('kaptain-account-btn'), $('title-account-btn')];
    openers.forEach((el) => {
      if (el) el.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });

    $('account-close')?.addEventListener('click', closeModal);
    $('account-overlay')?.addEventListener('click', (e) => {
      if (e.target === $('account-overlay')) closeModal();
    });

    $('account-btn-create')?.addEventListener('click', onCreate);
    $('account-btn-unlock')?.addEventListener('click', onUnlock);
    $('account-btn-cloud-signup')?.addEventListener('click', onCloudSignup);
    $('account-btn-cloud-login')?.addEventListener('click', onCloudLogin);
    $('account-goto-cloud')?.addEventListener('click', () => showView('cloud'));
    document.querySelectorAll('.account-goto-manage-back').forEach((b) => b.addEventListener('click', () => showView(defaultView())));
    $('account-goto-create')?.addEventListener('click', () => showView('create'));
    $('account-goto-unlock')?.addEventListener('click', () => showView('unlock'));
    $('account-btn-lock')?.addEventListener('click', () => {
      window.KaptainAccount.lock();
      toast('Vault locked on this tab.', 'success');
      showView('unlock');
      refreshChrome();
    });
    $('account-btn-save')?.addEventListener('click', async () => {
      try {
        const ok = await window.KaptainAccount.persistNow();
        toast(ok ? 'Saved encrypted vault.' : 'Unlock the vault first.');
        updateModalStatus();
      } catch (e) {
        showError(e.message || String(e));
      }
    });
    $('account-btn-signout-cloud')?.addEventListener('click', () => {
      window.KaptainAccount.signOutCloud();
      toast('Signed out of cloud sync (local vault kept).');
      refreshChrome();
    });
    $('account-btn-wipe')?.addEventListener('click', () => {
      if (!confirm('Delete the local encrypted vault on this browser? Cloud copy (if any) is left alone.')) return;
      window.KaptainAccount.wipeLocalVault();
      toast('Local vault removed.');
      showView('create');
      refreshChrome();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.KaptainAccountUi = { openModal, closeModal, refreshChrome };
})();
