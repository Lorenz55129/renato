/* ============================================
   Renato Stolarija – Dobavljači
   Upravljanje dobavljačima i katalozima
   ============================================ */

(function () {
    'use strict';

    // ---------- State ----------
    const state = { view: 'list', editId: null };
    let dobavljaciCache = [];

    // ---------- Init ----------
    function init() {
        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'dobavljaci') {
                state.view = 'list';
                render();
            }
        });
        document.querySelectorAll('.menu-item[data-target="dobavljaci"]').forEach(btn => {
            btn.addEventListener('click', () => App.Nav.show('dobavljaci'));
        });
    }

    // ---------- Main render ----------
    function render() {
        const root = document.getElementById('dobavljaci-content');
        if (!root) return;
        if (state.view === 'list') renderList(root);
        else renderForm(root, state.editId);
    }

    // ============================================================
    // LISTA
    // ============================================================
    async function renderList(root) {
        root.innerHTML = '<p class="placeholder-hint">Učitavanje...</p>';
        try {
            dobavljaciCache = await App.Api.apiCall('GET', '/dobavljaci');
        } catch (e) {
            root.innerHTML = `<p class="placeholder-hint">Greška: ${esc(e.message)}</p>`;
            return;
        }

        root.innerHTML = `
            <div class="list-toolbar">
                <button type="button" class="btn btn-primary btn-sm" id="btn-novi-dob">+ Novi dobavljač</button>
            </div>
            ${dobavljaciCache.length === 0
                ? '<p class="placeholder-hint">Nema dobavljača. Dodajte prvog.</p>'
                : `<ul class="dob-list">${dobavljaciCache.map(d => renderCard(d)).join('')}</ul>`
            }
        `;

        root.querySelector('#btn-novi-dob').addEventListener('click', () => {
            state.view = 'form';
            state.editId = null;
            render();
        });
        root.querySelectorAll('.dob-uredi-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.view = 'form';
                state.editId = btn.dataset.id;
                render();
            });
        });
    }

    function renderCard(d) {
        const katalogInfo = `${d.katalog_count || 0} kataloga · ${d.stavki_count || 0} stavki`;
        return `
            <li class="dob-card">
                <div class="dob-card-body">
                    <div class="dob-naziv">${esc(d.naziv)}</div>
                    ${(d.email || d.telefon) ? `<div class="dob-kontakt">
                        ${d.email   ? `<a href="mailto:${esc(d.email)}"   class="dob-contact-link">${esc(d.email)}</a>` : ''}
                        ${d.telefon ? `<a href="tel:${esc(d.telefon)}" class="dob-contact-link">${esc(d.telefon)}</a>` : ''}
                    </div>` : ''}
                    <div class="dob-stats">${katalogInfo}</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm dob-uredi-btn" data-id="${esc(d.id)}">Uredi</button>
            </li>
        `;
    }

    // ============================================================
    // FORMA (kreiranje / uređivanje)
    // ============================================================
    async function renderForm(root, editId) {
        const d = editId ? dobavljaciCache.find(x => x.id === editId) : null;

        // Učitaj kataloge za ovog dobavljača iz lokalnog IndexedDB
        let katalozi = [];
        if (editId) {
            try {
                const allKatalog = await App.DB.loadAll('materijali_katalog');
                const mine = allKatalog.filter(m => m.dobavljac_id === editId);
                const byName = {};
                mine.forEach(m => {
                    const k = m.katalog_naziv || 'Bez naziva';
                    byName[k] = (byName[k] || 0) + 1;
                });
                katalozi = Object.entries(byName).map(([naziv, count]) => ({ naziv, count }));
            } catch (e) { /* silent */ }
        }

        root.innerHTML = `
            <div class="dob-form-nav">
                <button type="button" class="btn-text" id="dob-back">← Dobavljači</button>
            </div>
            <form id="dob-form" class="card dob-form-card">
                <div class="form-group">
                    <label class="form-label" for="dob-naziv">Naziv *</label>
                    <input type="text" id="dob-naziv" class="form-input" required
                           value="${esc(d?.naziv || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="dob-kontakt-osoba">Kontakt osoba</label>
                    <input type="text" id="dob-kontakt-osoba" class="form-input"
                           value="${esc(d?.kontakt_osoba || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="dob-email">Email</label>
                    <input type="email" id="dob-email" class="form-input"
                           value="${esc(d?.email || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="dob-telefon">Telefon</label>
                    <input type="tel" id="dob-telefon" class="form-input"
                           value="${esc(d?.telefon || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="dob-adresa">Adresa</label>
                    <input type="text" id="dob-adresa" class="form-input"
                           value="${esc(d?.adresa || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="dob-napomena">Napomena</label>
                    <textarea id="dob-napomena" class="form-input" rows="2">${esc(d?.napomena || '')}</textarea>
                </div>
                <div id="dob-error" class="form-error hidden"></div>
                <div class="dob-form-actions">
                    <button type="submit" class="btn btn-primary">Spremi</button>
                    ${d ? `<button type="button" class="btn btn-danger btn-sm" id="dob-delete">Obriši</button>` : ''}
                </div>
            </form>

            ${katalozi.length > 0 ? `
            <div class="card dob-katalozi-card">
                <h4 class="dob-katalozi-title">Katalozi</h4>
                <ul class="dob-katalozi-list">
                    ${katalozi.map(k => `
                        <li class="dob-katalog-row">
                            <div class="dob-katalog-info">
                                <span class="dob-katalog-naziv">${esc(k.naziv)}</span>
                                <span class="dob-katalog-count">${k.count} stavki</span>
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm dob-zamijeni-btn"
                                    data-dob-id="${esc(editId)}"
                                    data-dob-naziv="${esc(d?.naziv || '')}"
                                    data-katalog-naziv="${esc(k.naziv)}">
                                Zamijeni cjenovnik
                            </button>
                        </li>
                    `).join('')}
                </ul>
                <button type="button" class="btn btn-secondary btn-sm dob-dodaj-katalog-btn"
                        data-dob-id="${esc(editId)}" data-dob-naziv="${esc(d?.naziv || '')}"
                        style="margin-top:8px;">
                    + Dodaj novi katalog
                </button>
            </div>` : (editId ? `
            <div class="card dob-katalozi-card">
                <h4 class="dob-katalozi-title">Katalozi</h4>
                <p class="placeholder-hint" style="margin:0 0 8px;">Nema kataloga.</p>
                <button type="button" class="btn btn-secondary btn-sm dob-dodaj-katalog-btn"
                        data-dob-id="${esc(editId)}" data-dob-naziv="${esc(d?.naziv || '')}">
                    + Dodaj katalog
                </button>
            </div>` : '')}
        `;

        root.querySelector('#dob-back').addEventListener('click', () => {
            state.view = 'list';
            render();
        });

        root.querySelector('#dob-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = root.querySelector('#dob-error');
            errEl.classList.add('hidden');
            const body = {
                naziv:         root.querySelector('#dob-naziv').value.trim(),
                kontakt_osoba: root.querySelector('#dob-kontakt-osoba').value.trim() || null,
                email:         root.querySelector('#dob-email').value.trim() || null,
                telefon:       root.querySelector('#dob-telefon').value.trim() || null,
                adresa:        root.querySelector('#dob-adresa').value.trim() || null,
                napomena:      root.querySelector('#dob-napomena').value.trim() || null,
            };
            try {
                if (editId) {
                    await App.Api.apiCall('PUT', '/dobavljaci/' + editId, body);
                } else {
                    const result = await App.Api.apiCall('POST', '/dobavljaci', body);
                    state.editId = result.id;
                }
                // Refresh cache
                dobavljaciCache = await App.Api.apiCall('GET', '/dobavljaci');
                await App.DB.saveAll('dobavljaci', dobavljaciCache);
                state.view = 'list';
                render();
            } catch (err) {
                errEl.textContent = 'Greška: ' + err.message;
                errEl.classList.remove('hidden');
            }
        });

        const deleteBtn = root.querySelector('#dob-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('Obrisati dobavljača "' + (d?.naziv || '') + '"?')) return;
                try {
                    await App.Api.apiCall('DELETE', '/dobavljaci/' + editId);
                    dobavljaciCache = dobavljaciCache.filter(x => x.id !== editId);
                    await App.DB.saveAll('dobavljaci', dobavljaciCache);
                    state.view = 'list';
                    render();
                } catch (err) {
                    if (err.message.includes('has_katalozi')) {
                        alert('Ovaj dobavljač ima aktivne kataloge i ne može se obrisati.');
                    } else {
                        alert('Greška: ' + err.message);
                    }
                }
            });
        }

        // Zamijeni cjenovnik buttons
        root.querySelectorAll('.dob-zamijeni-btn, .dob-dodaj-katalog-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openUploadModal({
                    dobavljac_id:    btn.dataset.dobId,
                    dobavljac_naziv: btn.dataset.dobNaziv,
                    katalog_naziv:   btn.dataset.katalogNaziv || ''
                }).then(() => render());
            });
        });
    }

    // ============================================================
    // Upload modal – dijeli se s Materijali modulom
    // prefill: { dobavljac_id?, dobavljac_naziv?, katalog_naziv? }
    // ============================================================
    async function openUploadModal(prefill) {
        prefill = prefill || {};
        let dobavljaciList;
        try {
            dobavljaciList = await App.Api.apiCall('GET', '/dobavljaci');
        } catch (e) {
            dobavljaciList = [...dobavljaciCache];
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay mat-modal-overlay';
        overlay.innerHTML = `
            <div class="modal mat-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Učitaj cjenovnik</h3>
                    <button type="button" class="modal-close" id="um-close">✕</button>
                </div>
                <div class="mat-add-form">
                    <div class="form-group">
                        <label class="form-label" for="um-dobavljac">Dobavljač *</label>
                        <select id="um-dobavljac" class="form-input">
                            <option value="">— odaberi dobavljača —</option>
                            ${dobavljaciList.map(d => `
                                <option value="${esc(d.id)}"
                                        ${prefill.dobavljac_id === d.id ? 'selected' : ''}>
                                    ${esc(d.naziv)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="um-katalog-naziv">Naziv kataloga *</label>
                        <input type="text" id="um-katalog-naziv" class="form-input"
                               placeholder="npr. Ploče, Šarke, Vijci"
                               value="${esc(prefill.katalog_naziv || '')}">
                    </div>
                    <div id="um-warn" class="dob-upload-warn hidden"></div>
                    <div class="form-group">
                        <label class="form-label">Excel datoteka (.xlsx) *</label>
                        <label class="btn btn-secondary dob-file-label">
                            <input type="file" id="um-file" accept=".xlsx" hidden>
                            <span id="um-file-name">Odaberi datoteku</span>
                        </label>
                    </div>
                    <div id="um-status" class="hidden"></div>
                    <div class="mat-modal-btns">
                        <button type="button" class="btn btn-primary" id="um-submit" disabled>Učitaj</button>
                        <button type="button" class="btn btn-secondary" id="um-cancel">Odustani</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeModal = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        overlay.querySelector('#um-close').addEventListener('click', closeModal);
        overlay.querySelector('#um-cancel').addEventListener('click', closeModal);

        const dobSel     = overlay.querySelector('#um-dobavljac');
        const katalogInp = overlay.querySelector('#um-katalog-naziv');
        const fileInput  = overlay.querySelector('#um-file');
        const fileName   = overlay.querySelector('#um-file-name');
        const submitBtn  = overlay.querySelector('#um-submit');
        const warnEl     = overlay.querySelector('#um-warn');
        const statusEl   = overlay.querySelector('#um-status');

        let selectedFile = null;

        async function updateWarn() {
            const dobId    = dobSel.value;
            const katNaziv = katalogInp.value.trim();
            if (!dobId || !katNaziv) { warnEl.classList.add('hidden'); return; }
            const allKat = await App.DB.loadAll('materijali_katalog');
            const existing = allKat.filter(m => m.dobavljac_id === dobId && m.katalog_naziv === katNaziv);
            if (existing.length > 0) {
                const dobNaziv = dobavljaciList.find(d => d.id === dobId)?.naziv || dobId;
                warnEl.textContent = `Postojeći katalog "${katNaziv}" za "${dobNaziv}" (${existing.length} stavki) će biti zamijenjen.`;
                warnEl.classList.remove('hidden');
            } else {
                warnEl.classList.add('hidden');
            }
        }

        function checkReady() {
            submitBtn.disabled = !(selectedFile && dobSel.value && katalogInp.value.trim());
        }

        dobSel.addEventListener('change',   () => { updateWarn(); checkReady(); });
        katalogInp.addEventListener('input', () => { updateWarn(); checkReady(); });
        fileInput.addEventListener('change', () => {
            selectedFile = fileInput.files[0] || null;
            fileName.textContent = selectedFile ? selectedFile.name : 'Odaberi datoteku';
            checkReady();
        });

        updateWarn();

        submitBtn.addEventListener('click', async () => {
            const dobavljac_id  = dobSel.value;
            const katalog_naziv = katalogInp.value.trim();
            if (!dobavljac_id || !katalog_naziv || !selectedFile) return;

            submitBtn.disabled = true;
            statusEl.className  = 'mat-upload-status';
            statusEl.textContent = 'Učitavanje...';
            statusEl.classList.remove('hidden');

            const formData = new FormData();
            formData.append('file',          selectedFile);
            formData.append('dobavljac_id',  dobavljac_id);
            formData.append('katalog_naziv', katalog_naziv);

            try {
                const resp = await fetch('/api/materijali/katalog/upload', {
                    method:  'POST',
                    headers: { 'Authorization': 'Bearer ' + App.Api.getToken() },
                    body:    formData
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({ error: 'Upload greška' }));
                    throw new Error(err.error || 'Upload greška');
                }
                const result = await resp.json();

                // Osvježi katalog u IndexedDB
                const katalogResp = await fetch('/api/materijali/katalog', {
                    headers: { 'Authorization': 'Bearer ' + App.Api.getToken() }
                });
                if (!katalogResp.ok) throw new Error('Greška pri dohvatu kataloga');
                const noviKatalog = await katalogResp.json();
                await App.DB.saveAll('materijali_katalog', noviKatalog);

                statusEl.textContent = `✓ Učitano ${result.imported} materijala.`;
                statusEl.className   = 'mat-upload-status mat-upload-ok';

                // Obavijesti Materijali modul o promjeni
                document.dispatchEvent(new CustomEvent('materijali:katalog-updated'));

                setTimeout(closeModal, 1500);
            } catch (err) {
                statusEl.textContent = '✗ Greška: ' + err.message;
                statusEl.className   = 'mat-upload-status mat-upload-err';
                submitBtn.disabled   = false;
            }
        });

        return new Promise(resolve => {
            // Resolve when modal closes (success or cancel)
            const observer = new MutationObserver(() => {
                if (!document.body.contains(overlay)) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(document.body, { childList: true });
        });
    }

    // ---------- Helper ----------
    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', () => init());
    window.App = window.App || {};
    window.App.Dobavljaci = { openUploadModal };
}());
