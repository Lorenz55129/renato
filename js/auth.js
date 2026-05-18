(function () {
  'use strict';

  function init() {
    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', handleLogin);

    // Više-Menü: item-Klicks delegieren
    const viseContent = document.getElementById('vise-menu');
    if (viseContent) {
      viseContent.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;

        const action = item.getAttribute('data-action');
        const target = item.getAttribute('data-target');

        if (action === 'logout') {
          handleLogout();
        } else if (target) {
          App.Nav.show(target);
        }
      });
    }

    // Zurück-Buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-back[data-target]');
      if (!btn) return;
      App.Nav.show(btn.getAttribute('data-target'));
    });

    // Change-Password-Formular
    const cpForm = document.getElementById('change-password-form');
    if (cpForm) cpForm.addEventListener('submit', handleChangePassword);

    checkAuth();
  }

  async function checkAuth() {
    const token = App.Api.getToken();
    if (!token) {
      showLogin();
      return;
    }
    try {
      await App.Api.verify();
      showApp();
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    document.querySelectorAll('section[data-module]').forEach(s => s.classList.add('hidden'));
    document.getElementById('login-screen').classList.remove('hidden');
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.add('hidden');
    const header = document.querySelector('.app-header');
    if (header) header.classList.add('hidden');
  }

  function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.remove('hidden');
    const header = document.querySelector('.app-header');
    if (header) header.classList.remove('hidden');
    App.Nav.show('dashboard');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Prijava...';

    try {
      await App.Api.login(username, password);
      showApp();
    } catch {
      errEl.textContent = 'Pogrešno korisničko ime ili lozinka.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Prijavi se';
    }
  }

  function handleLogout() {
    if (confirm('Stvarno se odjaviti?')) {
      App.Api.logout();
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    const oldPwd = document.getElementById('cp-old').value;
    const newPwd = document.getElementById('cp-new').value;
    const newPwd2 = document.getElementById('cp-new2').value;
    const errEl = document.getElementById('cp-error');
    const successEl = document.getElementById('cp-success');
    const btn = e.target.querySelector('button[type="submit"]');

    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (newPwd !== newPwd2) {
      errEl.textContent = 'Nove lozinke se ne podudaraju.';
      errEl.classList.remove('hidden');
      return;
    }
    if (newPwd.length < 8) {
      errEl.textContent = 'Nova lozinka mora imati najmanje 8 znakova.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Spremanje...';

    try {
      await App.Api.changePassword(oldPwd, newPwd);
      successEl.classList.remove('hidden');
      e.target.reset();
    } catch (err) {
      errEl.textContent = err.message === 'Altes Passwort falsch'
        ? 'Stara lozinka nije ispravna.'
        : 'Greška pri promjeni lozinke.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Spremi';
    }
  }

  window.App = window.App || {};
  window.App.Auth = { init, showLogin, showApp };
})();
