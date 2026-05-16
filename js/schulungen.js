/* ============================================
   Renato Stolarija - Modul: Edukacije
   Lista video (Loom) i PDF edukacija, filteri, forma, detaljni prikaz
   s ugrađenim iframe-om ili linkom za PDF.
   Pohrana u localStorage pod ključem "edukacije".
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'edukacije';

    const TIPOVI = ['video', 'pdf'];
    const TIP_LABELS = { video: 'Video', pdf: 'PDF' };
    const TIP_ICONS = { video: '🎬', pdf: '📄' };
    const TIP_FORM_LABELS = {
        video: '🎬 Video (Loom)',
        pdf: '📄 PDF / Dokument'
    };
    const URL_PLACEHOLDERS = {
        video: 'https://www.loom.com/share/...',
        pdf: 'https://drive.google.com/...'
    };

    const state = {
        view: 'list',
        selectedId: null,
        tipFilter: 'all',          // 'all' | 'video' | 'pdf'
        kategorijaFilter: ''       // '' = sve kategorije
    };

    // ----- Pomoćno -----
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function loomEmbedUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const m = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
        if (m) return `https://www.loom.com/embed/${m[1]}`;
        if (url.indexOf('loom.com/embed/') !== -1) return url;
        return url;
    }

    function isHttpsUrl(s) {
        return typeof s === 'string' && /^https:\/\//.test(s.trim());
    }

    // ----- Podaci -----
    function getAll() {
        return window.App.Storage.load(STORAGE_KEY, []);
    }

    function saveAll(list) {
        return window.App.Storage.save(STORAGE_KEY, list);
    }

    function getById(id) {
        return getAll().find(e => e.id === id) || null;
    }

    function getKategorije() {
        const set = new Set();
        getAll().forEach(e => {
            if (e.kategorija && e.kategorija.trim()) set.add(e.kategorija.trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'hr'));
    }

    function createEdukacija(data) {
        const list = getAll();
        const nov = {
            id: window.App.Storage.generateId(),
            naziv: (data.naziv || '').trim(),
            opis: (data.opis || '').trim(),
            kategorija: (data.kategorija || '').trim(),
            tip: TIPOVI.includes(data.tip) ? data.tip : 'video',
            url: (data.url || '').trim(),
            datum_unosa: new Date().toISOString()
        };
        list.push(nov);
        saveAll(list);
        return nov;
    }

    function updateEdukacija(id, patch) {
        const list = getAll();
        const i = list.findIndex(e => e.id === id);
        if (i === -1) return null;
        list[i] = Object.assign({}, list[i], patch);
        saveAll(list);
        return list[i];
    }

    function deleteEdukacija(id) {
        saveAll(getAll().filter(e => e.id !== id));
    }

    // ----- Glavni render -----
    function render() {
        if (state.view === 'detail') renderDetail();
        else renderList();
    }

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

    // ----- Lista -----
    function renderList() {
        const container = document.getElementById('edukacije-content');
        if (!container) return;

        const kategorije = getKategorije();

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back-vise">‹ Više</button>

            <div class="edukacije-toolbar">
                <div class="filter-tabs" role="tablist" aria-label="Tip edukacije">
                    ${renderFilterTab('all', 'Sve')}
                    ${renderFilterTab('video', '🎬 Video')}
                    ${renderFilterTab('pdf', '📄 PDF')}
                </div>
                ${kategorije.length > 0 ? `
                    <select class="form-select edukacija-kategorija-filter" id="edukacija-kategorija-filter" aria-label="Filter po kategoriji">
                        <option value="">Sve kategorije</option>
                        ${kategorije.map(k => `<option value="${escapeHtml(k)}"${state.kategorijaFilter === k ? ' selected' : ''}>${escapeHtml(k)}</option>`).join('')}
                    </select>
                ` : ''}
                <button type="button" class="btn btn-primary btn-block" id="btn-nova-edukacija">+ Nova edukacija</button>
            </div>

            <div id="edukacije-list-container"></div>
        `;

        document.getElementById('btn-back-vise').addEventListener('click', () => {
            window.App.Nav.show('vise');
        });

        container.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.tipFilter = tab.getAttribute('data-filter');
                renderList();
            });
        });

        const katSel = document.getElementById('edukacija-kategorija-filter');
        if (katSel) {
            katSel.addEventListener('change', () => {
                state.kategorijaFilter = katSel.value || '';
                renderListContainer();
            });
        }

        document.getElementById('btn-nova-edukacija').addEventListener('click', () => openForm(null));

        renderListContainer();
    }

    function renderFilterTab(value, label) {
        const active = state.tipFilter === value ? 'active' : '';
        return `<button type="button" class="filter-tab ${active}" data-filter="${escapeHtml(value)}" role="tab">${label}</button>`;
    }

    function renderListContainer() {
        const cont = document.getElementById('edukacije-list-container');
        if (!cont) return;

        const all = getAll();
        let filtered = all.slice();

        if (state.tipFilter !== 'all') {
            filtered = filtered.filter(e => e.tip === state.tipFilter);
        }
        if (state.kategorijaFilter) {
            filtered = filtered.filter(e => (e.kategorija || '') === state.kategorijaFilter);
        }

        // Sortiraj: najnovije prvo
        filtered.sort((a, b) => (b.datum_unosa || '').localeCompare(a.datum_unosa || ''));

        if (all.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nemate spremljenih edukacija.</p>
                    <p class="placeholder-hint">Dodajte prvu edukaciju klikom na "+ Nova edukacija".</p>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            cont.innerHTML = `<div class="empty-state"><p>Nema edukacija za odabrane filtere.</p></div>`;
            return;
        }

        cont.innerHTML = `
            <div class="edukacije-grid">
                ${filtered.map(e => `
                    <button type="button" class="edukacija-card" data-id="${escapeHtml(e.id)}"
                            aria-label="Otvori edukaciju ${escapeHtml(e.naziv || '')}">
                        <div class="edukacija-card-icon" aria-hidden="true">${TIP_ICONS[e.tip] || ''}</div>
                        <div class="edukacija-card-naziv">${escapeHtml(e.naziv || 'Bez naziva')}</div>
                        ${e.kategorija ? `<div class="edukacija-card-kategorija">${escapeHtml(e.kategorija)}</div>` : ''}
                        ${e.opis ? `<div class="edukacija-card-opis">${escapeHtml(e.opis)}</div>` : ''}
                    </button>
                `).join('')}
            </div>
        `;

        cont.querySelectorAll('.edukacija-card').forEach(card => {
            card.addEventListener('click', () => showDetail(card.getAttribute('data-id')));
        });
    }

    // ----- Detalj -----
    function renderDetail() {
        const container = document.getElementById('edukacije-content');
        if (!container) return;

        const e = getById(state.selectedId);
        if (!e) {
            showList();
            return;
        }

        const embed = loomEmbedUrl(e.url);

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back-list">‹ Nazad</button>

            <article class="edukacija-detail">
                <header class="edukacija-detail-header">
                    <span class="edukacija-detail-icon" aria-hidden="true">${TIP_ICONS[e.tip] || ''}</span>
                    <h3 class="edukacija-detail-naziv">${escapeHtml(e.naziv || 'Bez naziva')}</h3>
                    ${e.kategorija ? `<span class="edukacija-card-kategorija">${escapeHtml(e.kategorija)}</span>` : ''}
                </header>

                ${e.opis ? `<p class="edukacija-detail-opis">${escapeHtml(e.opis)}</p>` : ''}

                ${e.tip === 'video' && e.url ? `
                    <div class="edukacija-embed-wrap">
                        <iframe class="edukacija-embed"
                                src="${escapeHtml(embed)}"
                                width="100%" height="400"
                                frameborder="0"
                                allowfullscreen></iframe>
                    </div>
                ` : ''}

                ${e.tip === 'pdf' && e.url ? `
                    <button type="button" class="btn btn-primary btn-block edukacija-pdf-btn" id="btn-otvori-pdf">
                        📄 Otvori PDF
                    </button>
                ` : ''}

                ${!e.url ? `<p class="placeholder-hint">URL nije postavljen.</p>` : ''}
            </article>

            <div class="detail-actions">
                <button type="button" class="btn btn-primary btn-block" id="btn-uredi">Uredi</button>
                <button type="button" class="btn btn-danger btn-block" id="btn-obrisi">Obriši</button>
            </div>
        `;

        // Scope-aj kroz container - drugi moduli (ponude, narudzbe, ...)
        // koriste iste id-ove i mogu biti istovremeno u DOM-u (skriveni).
        container.querySelector('#btn-back-list').addEventListener('click', showList);
        container.querySelector('#btn-uredi').addEventListener('click', () => openForm(e.id));
        container.querySelector('#btn-obrisi').addEventListener('click', () => handleDelete(e));

        const btnPdf = container.querySelector('#btn-otvori-pdf');
        if (btnPdf) {
            btnPdf.addEventListener('click', () => window.open(e.url, '_blank', 'noopener'));
        }
    }

    function handleDelete(e) {
        if (!window.confirm(`Sigurno obrisati edukaciju "${e.naziv}"?`)) return;
        deleteEdukacija(e.id);
        showList();
    }

    // ----- Forma -----
    function openForm(editId) {
        closeForm();

        const isEdit = !!editId;
        const e = isEdit ? (getById(editId) || {}) : {};
        const initialTip = TIPOVI.includes(e.tip) ? e.tip : 'video';

        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'edukacija-form-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', isEdit ? 'Uredi edukaciju' : 'Nova edukacija');

        overlay.innerHTML = `
            <div class="overlay-header">
                <button type="button" class="icon-btn" id="overlay-close" aria-label="Zatvori">✕</button>
                <h2 class="overlay-title">${isEdit ? 'Uredi edukaciju' : 'Nova edukacija'}</h2>
            </div>
            <form class="overlay-body" id="edukacija-form" novalidate>
                <div class="form-group">
                    <label class="form-label" for="f-naziv">
                        Naziv <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-naziv" name="naziv" type="text" required
                           autocapitalize="sentences" value="${escapeHtml(e.naziv || '')}">
                    <div class="form-error" id="err-naziv" hidden>Naziv je obavezan.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-kategorija">Kategorija</label>
                    <input class="form-input" id="f-kategorija" name="kategorija" type="text"
                           autocapitalize="words" value="${escapeHtml(e.kategorija || '')}"
                           placeholder="npr. Stolarija, CNC, Materijali...">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-opis">Opis</label>
                    <textarea class="form-textarea" id="f-opis" name="opis" rows="3">${escapeHtml(e.opis || '')}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">
                        Tip <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <div class="tip-selector" role="radiogroup" aria-label="Tip edukacije">
                        ${TIPOVI.map(k => `
                            <button type="button" class="tip-btn ${initialTip === k ? 'active' : ''}"
                                    data-tip="${k}" role="radio" aria-checked="${initialTip === k}">
                                <span class="tip-btn-label">${TIP_FORM_LABELS[k]}</span>
                            </button>
                        `).join('')}
                    </div>
                    <input type="hidden" name="tip" id="f-tip" value="${escapeHtml(initialTip)}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-url">
                        URL <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-url" name="url" type="url"
                           inputmode="url" autocapitalize="off" autocorrect="off"
                           placeholder="${escapeHtml(URL_PLACEHOLDERS[initialTip])}"
                           value="${escapeHtml(e.url || '')}">
                    <div class="form-error" id="err-url" hidden>URL mora počinjati s "https://".</div>
                </div>

                <div class="overlay-actions">
                    <button type="submit" class="btn btn-primary btn-block">Spremi</button>
                    <button type="button" class="btn btn-ghost btn-block" id="btn-odustani">Odustani</button>
                </div>
            </form>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        setTimeout(() => {
            const f = document.getElementById('f-naziv');
            if (f) f.focus();
        }, 50);

        // Tip selector
        overlay.querySelectorAll('.tip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tip = btn.getAttribute('data-tip');
                overlay.querySelectorAll('.tip-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                document.getElementById('f-tip').value = tip;
                const urlInput = document.getElementById('f-url');
                if (urlInput) urlInput.placeholder = URL_PLACEHOLDERS[tip] || '';
            });
        });

        document.getElementById('overlay-close').addEventListener('click', closeForm);
        document.getElementById('btn-odustani').addEventListener('click', closeForm);
        document.getElementById('edukacija-form').addEventListener('submit', (ev) => {
            ev.preventDefault();
            handleSubmit(isEdit ? editId : null);
        });
    }

    function handleSubmit(editId) {
        const form = document.getElementById('edukacija-form');
        if (!form) return;

        const data = {
            naziv: form.naziv.value,
            kategorija: form.kategorija.value,
            opis: form.opis.value,
            tip: form.tip.value,
            url: form.url.value
        };

        let hasError = false;

        const errNaziv = document.getElementById('err-naziv');
        if (!data.naziv || !data.naziv.trim()) {
            if (errNaziv) errNaziv.hidden = false;
            hasError = true;
        } else if (errNaziv) {
            errNaziv.hidden = true;
        }

        const errUrl = document.getElementById('err-url');
        if (!isHttpsUrl(data.url)) {
            if (errUrl) errUrl.hidden = false;
            hasError = true;
        } else if (errUrl) {
            errUrl.hidden = true;
        }

        if (hasError) {
            if (!data.naziv || !data.naziv.trim()) form.naziv.focus();
            else form.url.focus();
            return;
        }

        let saved;
        if (editId) {
            saved = updateEdukacija(editId, {
                naziv: data.naziv.trim(),
                kategorija: data.kategorija.trim(),
                opis: data.opis.trim(),
                tip: TIPOVI.includes(data.tip) ? data.tip : 'video',
                url: data.url.trim()
            });
        } else {
            saved = createEdukacija(data);
        }

        closeForm();

        if (saved) {
            showDetail(saved.id);
        } else {
            showList();
        }
    }

    function closeForm() {
        const ov = document.getElementById('edukacija-form-overlay');
        if (ov) ov.remove();
        if (!document.querySelector('.overlay') && !document.querySelector('.slide-panel') && !document.querySelector('.photo-viewer') && !document.querySelector('.aufmass-overlay') && !document.querySelector('.gallery-viewer')) {
            document.body.classList.remove('overlay-open');
        }
    }

    // ----- Init -----
    function init() {
        render();

        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'edukacije') {
                // Zadrži "Više" gumb aktivnim u donjoj navigaciji
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                const viseBtn = document.querySelector('.nav-btn[data-target="vise"]');
                if (viseBtn) viseBtn.classList.add('active');

                if (state.view === 'detail' && !getById(state.selectedId)) {
                    state.view = 'list';
                    state.selectedId = null;
                }
                render();
            } else {
                closeForm();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('edukacija-form-overlay')) {
                closeForm();
            }
        });

        // Otvaranje iz "Više" izbornika
        document.querySelectorAll('.menu-item[data-target="edukacije"]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.Nav.show('edukacije');
            });
        });
    }

    window.App = window.App || {};
    window.App.Edukacije = {
        init,
        getAll
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
