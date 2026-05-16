/* ============================================
   Renato Stolarija - Modul: Kupci
   Lista, detalji, dodavanje, uređivanje i brisanje kupaca.
   Sve se sprema u localStorage pod ključem "kupci".
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'kupci';

    const state = {
        view: 'list',          // 'list' | 'detail'
        selectedId: null,
        searchQuery: ''
    };

    // ----- Pomoćne funkcije -----
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function todayISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDate(iso) {
        if (!iso) return '';
        const parts = String(iso).split('-');
        if (parts.length !== 3) return iso;
        return `${parts[2]}.${parts[1]}.${parts[0]}.`;
    }

    // ----- Pristup podacima -----
    function getAll() {
        return window.App.Storage.load(STORAGE_KEY, []);
    }

    function saveAll(list) {
        return window.App.Storage.save(STORAGE_KEY, list);
    }

    function getById(id) {
        return getAll().find(k => k.id === id) || null;
    }

    function createKupac(data) {
        const list = getAll();
        const novi = {
            id: window.App.Storage.generateId(),
            ime: (data.ime || '').trim(),
            telefon: (data.telefon || '').trim(),
            email: (data.email || '').trim(),
            adresa: (data.adresa || '').trim(),
            napomena: (data.napomena || '').trim(),
            datum_unosa: todayISO()
        };
        list.push(novi);
        saveAll(list);
        return novi;
    }

    function updateKupac(id, data) {
        const list = getAll();
        const idx = list.findIndex(k => k.id === id);
        if (idx === -1) return null;
        list[idx] = {
            ...list[idx],
            ime: (data.ime || '').trim(),
            telefon: (data.telefon || '').trim(),
            email: (data.email || '').trim(),
            adresa: (data.adresa || '').trim(),
            napomena: (data.napomena || '').trim()
        };
        saveAll(list);
        return list[idx];
    }

    function deleteKupac(id) {
        const list = getAll().filter(k => k.id !== id);
        saveAll(list);
    }

    // Broj narudžbi za zadanog kupca - koristi modul Narudžbe ako je učitan.
    function countNarudzbe(kupacId) {
        if (window.App && window.App.Narudzbe && typeof window.App.Narudzbe.getByKupacId === 'function') {
            return window.App.Narudzbe.getByKupacId(kupacId).length;
        }
        return 0;
    }

    // ----- Prikaz: lista kupaca -----
    function renderList() {
        const container = document.getElementById('kupci-content');
        if (!container) return;

        container.innerHTML = `
            <div class="kupci-toolbar">
                <input
                    type="search"
                    class="form-input kupci-search"
                    id="kupci-search"
                    placeholder="Pretraži po imenu..."
                    value="${escapeHtml(state.searchQuery)}"
                    autocomplete="off"
                    autocapitalize="words">
                <button type="button" class="btn btn-primary btn-block" id="btn-novi-kupac">
                    + Novi kupac
                </button>
            </div>
            <div id="kupci-list-container"></div>
        `;

        renderListContainer();

        const search = document.getElementById('kupci-search');
        if (search) {
            search.addEventListener('input', (e) => {
                state.searchQuery = e.target.value;
                renderListContainer();
            });
        }

        const btnNew = document.getElementById('btn-novi-kupac');
        if (btnNew) btnNew.addEventListener('click', () => openForm(null));
    }

    function renderListContainer() {
        const cont = document.getElementById('kupci-list-container');
        if (!cont) return;

        const q = state.searchQuery.trim().toLowerCase();
        const all = getAll();
        const filtered = q
            ? all.filter(k => (k.ime || '').toLowerCase().includes(q))
            : all.slice();

        filtered.sort((a, b) => (a.ime || '').localeCompare(b.ime || '', 'hr'));

        if (all.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nemate spremljenih kupaca.</p>
                    <p class="placeholder-hint">Dodajte prvog kupca klikom na "+ Novi kupac".</p>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Nema kupaca za pretragu "<strong>${escapeHtml(state.searchQuery)}</strong>".</p>
                </div>
            `;
            return;
        }

        cont.innerHTML = `
            <ul class="kupac-list">
                ${filtered.map(k => `
                    <li class="kupac-card" data-id="${escapeHtml(k.id)}" role="button" tabindex="0">
                        <div class="kupac-card-info">
                            <div class="kupac-card-name">${escapeHtml(k.ime || 'Bez imena')}</div>
                            <div class="kupac-card-phone">${escapeHtml(k.telefon || '—')}</div>
                        </div>
                        <span class="kupac-card-badge" aria-label="Broj narudžbi">
                            ${countNarudzbe(k.id)}
                        </span>
                    </li>
                `).join('')}
            </ul>
        `;

        cont.querySelectorAll('.kupac-card').forEach(card => {
            const id = card.getAttribute('data-id');
            card.addEventListener('click', () => showDetail(id));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showDetail(id);
                }
            });
        });
    }

    // ----- Prikaz: detalji kupca -----
    function showList() {
        state.view = 'list';
        state.selectedId = null;
        renderList();
    }

    function showDetail(id) {
        state.view = 'detail';
        state.selectedId = id;
        renderDetail();
    }

    function renderDetail() {
        const container = document.getElementById('kupci-content');
        if (!container) return;

        const k = getById(state.selectedId);
        if (!k) {
            showList();
            return;
        }

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back">‹ Nazad</button>

            <div class="detail-card">
                <h3 class="detail-title">${escapeHtml(k.ime || 'Bez imena')}</h3>

                <div class="detail-row">
                    <div class="detail-label">Telefon</div>
                    <div class="detail-value">${
                        k.telefon
                            ? `<a href="tel:${escapeHtml(k.telefon)}">${escapeHtml(k.telefon)}</a>`
                            : '—'
                    }</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Email</div>
                    <div class="detail-value">${
                        k.email
                            ? `<a href="mailto:${escapeHtml(k.email)}">${escapeHtml(k.email)}</a>`
                            : '—'
                    }</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Adresa</div>
                    <div class="detail-value">${escapeHtml(k.adresa || '—')}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Napomena</div>
                    <div class="detail-value detail-value-multiline">${escapeHtml(k.napomena || '—')}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Datum unosa</div>
                    <div class="detail-value">${escapeHtml(formatDate(k.datum_unosa))}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Broj narudžbi</div>
                    <div class="detail-value">${countNarudzbe(k.id)}</div>
                </div>
            </div>

            <div class="detail-actions">
                <button type="button" class="btn btn-primary btn-block" id="btn-uredi">Uredi</button>
                <button type="button" class="btn btn-danger btn-block" id="btn-obrisi">Obriši</button>
            </div>
        `;

        // Scope-aj kroz container kako getElementById ne bi pogodio
        // istoimene gumbe iz drugih (skrivenih) modula u DOM-u.
        container.querySelector('#btn-back').addEventListener('click', showList);
        container.querySelector('#btn-uredi').addEventListener('click', () => openForm(k.id));
        container.querySelector('#btn-obrisi').addEventListener('click', () => handleDelete(k));
    }

    function handleDelete(k) {
        const ok = window.confirm(`Sigurno obrisati kupca "${k.ime}"? Ova radnja se ne može poništiti.`);
        if (!ok) return;
        deleteKupac(k.id);
        showList();
    }

    // ----- Forma (fullscreen overlay) za novi / uređivanje -----
    function openForm(editId) {
        closeForm();

        const isEdit = !!editId;
        const k = isEdit ? (getById(editId) || {}) : {};

        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'kupac-form-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', isEdit ? 'Uredi kupca' : 'Novi kupac');

        overlay.innerHTML = `
            <div class="overlay-header">
                <button type="button" class="icon-btn" id="overlay-close" aria-label="Zatvori">✕</button>
                <h2 class="overlay-title">${isEdit ? 'Uredi kupca' : 'Novi kupac'}</h2>
            </div>
            <form class="overlay-body" id="kupac-form" novalidate>
                <div class="form-group">
                    <label class="form-label" for="f-ime">
                        Ime i prezime <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-ime" name="ime" type="text"
                           required autocapitalize="words" autocomplete="name"
                           value="${escapeHtml(k.ime || '')}">
                    <div class="form-error" id="err-ime" hidden>Ime i prezime je obavezno.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-telefon">Telefon</label>
                    <input class="form-input" id="f-telefon" name="telefon" type="tel"
                           inputmode="tel" autocomplete="tel"
                           value="${escapeHtml(k.telefon || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-email">Email</label>
                    <input class="form-input" id="f-email" name="email" type="email"
                           inputmode="email" autocomplete="email" autocapitalize="off"
                           value="${escapeHtml(k.email || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-adresa">Adresa</label>
                    <input class="form-input" id="f-adresa" name="adresa" type="text"
                           autocomplete="street-address"
                           value="${escapeHtml(k.adresa || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-napomena">Napomena</label>
                    <textarea class="form-textarea" id="f-napomena" name="napomena" rows="4">${escapeHtml(k.napomena || '')}</textarea>
                </div>

                <div class="overlay-actions">
                    <button type="submit" class="btn btn-primary btn-block">Spremi</button>
                    <button type="button" class="btn btn-ghost btn-block" id="btn-odustani">Odustani</button>
                </div>
            </form>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        // Fokus na prvo polje (mali timeout zbog animacije)
        setTimeout(() => {
            const f = document.getElementById('f-ime');
            if (f) f.focus();
        }, 50);

        document.getElementById('overlay-close').addEventListener('click', closeForm);
        document.getElementById('btn-odustani').addEventListener('click', closeForm);
        document.getElementById('kupac-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit(isEdit ? editId : null);
        });
    }

    function handleSubmit(editId) {
        const form = document.getElementById('kupac-form');
        if (!form) return;

        const data = {
            ime: form.ime.value,
            telefon: form.telefon.value,
            email: form.email.value,
            adresa: form.adresa.value,
            napomena: form.napomena.value
        };

        const errIme = document.getElementById('err-ime');
        if (!data.ime || !data.ime.trim()) {
            if (errIme) errIme.hidden = false;
            form.ime.focus();
            return;
        }
        if (errIme) errIme.hidden = true;

        let saved;
        if (editId) {
            saved = updateKupac(editId, data);
            document.dispatchEvent(new CustomEvent('kupac:updated', { detail: { kupac: saved } }));
        } else {
            saved = createKupac(data);
            document.dispatchEvent(new CustomEvent('kupac:created', { detail: { kupac: saved } }));
        }

        closeForm();

        // Ako trenutno nismo na modulu kupci, ne diraj prikaz - drugi modul (npr. narudžbe)
        // je tražio formu pa će sam osvježiti svoj prikaz.
        if (window.App.Nav && window.App.Nav.currentModule !== 'kupci') {
            return;
        }

        // Ako smo uređivali iz detalja, ostani u detaljima; inače idi na listu.
        if (editId && state.view === 'detail' && state.selectedId === editId) {
            renderDetail();
        } else {
            showList();
        }
    }

    function closeForm() {
        const ov = document.getElementById('kupac-form-overlay');
        if (ov) ov.remove();
        // Otključaj scroll samo ako više nema otvorenog overlaya (npr. narudžbe).
        if (!document.querySelector('.overlay')) {
            document.body.classList.remove('overlay-open');
        }
    }

    // ----- Inicijalizacija -----
    function render() {
        if (state.view === 'detail') {
            renderDetail();
        } else {
            renderList();
        }
    }

    function init() {
        render();

        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'kupci') {
                state.view = 'list';
                state.selectedId = null;
                state.searchQuery = '';
                render();
            } else {
                // Kad korisnik napusti modul, zatvori formu ako je otvorena.
                closeForm();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('kupac-form-overlay')) {
                closeForm();
            }
        });
    }

    // Javni API modula
    window.App = window.App || {};
    window.App.Kupci = {
        init,
        getAll,
        getById,
        countNarudzbe,
        openForm   // koristi drugi moduli (npr. narudžbe za brzo dodavanje kupca)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
