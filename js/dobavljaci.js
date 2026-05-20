/* ============================================
   Renato Stolarija – Dobavljači
   Upravljanje dobavljačima i katalozima
   ============================================ */

(function () {
    'use strict';

    // ---------- State ----------
    const state = { view: 'list', editId: null };
    let dobavljaciCache = [];

    // ---------- Auto-mapping rules ----------
    const AUTO_MAP_RULES = [
        { field: 'sifra',      keywords: ['šifra', 'sifra', 'artbr', 'art.', 'art-nr', 'artnr', 'code', 'sku', 'šif'] },
        { field: 'naziv',      keywords: ['naziv', 'name', 'opis', 'bezeichnung', 'produkt'] },
        { field: 'struktura',  keywords: ['struktura', 'struct', 'dekor', 'décor', 'decor', 'dekör', 'oberfl'] },
        { field: 'dobavljac',  keywords: ['marka', 'brand', 'hersteller', 'marke', 'producer', 'brend'] },
        { field: 'kategorija', keywords: ['kategorija', 'kategorie', 'category', 'tip', 'vrsta'] },
        { field: 'debljina',   keywords: ['debljina', 'dicke', 'thickness', 'thk'] },
        { field: 'cijena',     keywords: ['cijena', 'cena', 'price', 'preis', 'vp ', 'vpcj', 'kalk'] },
        { field: 'format',     keywords: ['format', 'size', 'dimension', 'mjera'] },
        { field: 'abs_08',     keywords: ['abs 0,8', 'abs0.8', 'abs_08', 'abs-0.8', 'abs08', 'abs 08'] },
        { field: 'abs_2',      keywords: ['abs 2,', 'abs2,', 'abs_2', 'abs-2', 'abs 2m', 'abs2m', 'abs 2mm'] },
        { field: 'napomena',   keywords: ['napomena', 'remark', 'notiz', 'note', 'komentar', 'comment'] },
    ];

    function autoMap(headers) {
        const mapping = {};
        const usedFields = new Set();
        headers.forEach((h, idx) => {
            const hl = (h || '').toLowerCase();
            for (const rule of AUTO_MAP_RULES) {
                if (usedFields.has(rule.field)) continue;
                if (rule.keywords.some(k => hl.includes(k))) {
                    mapping[rule.field] = idx;
                    usedFields.add(rule.field);
                    break;
                }
            }
        });
        return mapping;
    }

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
    // Upload modal – 3-step: Datoteka → Kolone → Potvrda
    // prefill: { dobavljac_id?, dobavljac_naziv?, katalog_naziv? }
    // ============================================================
    const FIELD_OPTIONS = [
        { value: '',           label: '— ignorisati —' },
        { value: 'sifra',      label: 'Šifra' },
        { value: 'naziv',      label: 'Naziv ✱' },
        { value: 'struktura',  label: 'Struktura' },
        { value: 'dobavljac',  label: 'Marka (Hersteller)' },
        { value: 'kategorija', label: 'Kategorija' },
        { value: 'debljina',   label: 'Debljina (mm)' },
        { value: 'cijena',     label: 'Cijena' },
        { value: 'format',     label: 'Format' },
        { value: 'abs_08',     label: 'ABS 0,8mm (KM/m)' },
        { value: 'abs_2',      label: 'ABS 2mm (KM/m)' },
        { value: 'napomena',   label: 'Napomena' },
    ];

    async function openUploadModal(prefill) {
        prefill = prefill || {};
        let dobavljaciList;
        try {
            dobavljaciList = await App.Api.apiCall('GET', '/dobavljaci');
        } catch (e) {
            dobavljaciList = [...dobavljaciCache];
        }

        // Shared context carried across steps
        const ctx = {
            dobavljac_id:  prefill.dobavljac_id  || '',
            katalog_naziv: prefill.katalog_naziv || '',
            file:          null,
            headers:       [],
            previewRows:   [],
            mapping:       {},
            existingCount: 0,
        };

        // Build modal skeleton
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay mat-modal-overlay';
        overlay.innerHTML = `
            <div class="modal mat-modal um-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Učitaj cjenovnik</h3>
                    <button type="button" class="modal-close" id="um-close">✕</button>
                </div>
                <div class="um-stepper">
                    <div class="um-step active" data-s="1"><span class="um-step-num">1</span> Datoteka</div>
                    <div class="um-step-sep">›</div>
                    <div class="um-step" data-s="2"><span class="um-step-num">2</span> Kolone</div>
                    <div class="um-step-sep">›</div>
                    <div class="um-step" data-s="3"><span class="um-step-num">3</span> Potvrda</div>
                </div>
                <div id="um-step-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeModal = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        overlay.querySelector('#um-close').addEventListener('click', closeModal);

        const stepBody = overlay.querySelector('#um-step-body');

        function setActiveStep(n) {
            overlay.querySelectorAll('.um-step[data-s]').forEach(el => {
                const s = parseInt(el.dataset.s);
                el.classList.toggle('active', s === n);
                el.classList.toggle('done', s < n);
            });
        }

        // ── STEP 1: Datoteka ──────────────────────────────────────
        function renderStep1() {
            setActiveStep(1);
            stepBody.innerHTML = `
                <div class="mat-add-form">
                    <div class="form-group">
                        <label class="form-label">Dobavljač *</label>
                        <select id="um-dobavljac" class="form-input">
                            <option value="">— odaberi dobavljača —</option>
                            ${dobavljaciList.map(d => `
                                <option value="${esc(d.id)}"
                                        ${ctx.dobavljac_id === d.id ? 'selected' : ''}>
                                    ${esc(d.naziv)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Naziv kataloga *</label>
                        <input type="text" id="um-katalog-naziv" class="form-input"
                               placeholder="npr. Ploče, Šarke, Vijci"
                               value="${esc(ctx.katalog_naziv)}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Excel datoteka (.xlsx) *</label>
                        <label class="btn btn-secondary dob-file-label">
                            <input type="file" id="um-file" accept=".xlsx" hidden>
                            <span id="um-file-name">${ctx.file ? esc(ctx.file.name) : 'Odaberi datoteku'}</span>
                        </label>
                    </div>
                    <div id="um-s1-err" class="form-error hidden"></div>
                    <div class="mat-modal-btns">
                        <button type="button" class="btn btn-primary" id="um-s1-next" disabled>Dalje →</button>
                        <button type="button" class="btn btn-secondary" id="um-cancel">Odustani</button>
                    </div>
                </div>
            `;

            const dobSel  = stepBody.querySelector('#um-dobavljac');
            const katInp  = stepBody.querySelector('#um-katalog-naziv');
            const fileInp = stepBody.querySelector('#um-file');
            const fileNm  = stepBody.querySelector('#um-file-name');
            const nextBtn = stepBody.querySelector('#um-s1-next');
            const errEl   = stepBody.querySelector('#um-s1-err');

            function checkReady() {
                nextBtn.disabled = !(ctx.file && dobSel.value && katInp.value.trim());
            }

            dobSel.addEventListener('change', () => { ctx.dobavljac_id = dobSel.value; checkReady(); });
            katInp.addEventListener('input',  () => { ctx.katalog_naziv = katInp.value.trim(); checkReady(); });
            fileInp.addEventListener('change', () => {
                ctx.file = fileInp.files[0] || null;
                fileNm.textContent = ctx.file ? ctx.file.name : 'Odaberi datoteku';
                checkReady();
            });

            stepBody.querySelector('#um-cancel').addEventListener('click', closeModal);

            // Restore "Dalje" state if coming back from step 2
            if (ctx.file) checkReady();

            nextBtn.addEventListener('click', async () => {
                const dobId    = dobSel.value;
                const katNaziv = katInp.value.trim();
                if (!ctx.file || !dobId || !katNaziv) return;

                ctx.dobavljac_id  = dobId;
                ctx.katalog_naziv = katNaziv;

                nextBtn.disabled    = true;
                nextBtn.textContent = 'Čitanje...';
                errEl.classList.add('hidden');

                // POST preview
                const fd = new FormData();
                fd.append('file', ctx.file);
                try {
                    const resp = await fetch('/api/materijali/katalog/preview', {
                        method:  'POST',
                        headers: { 'Authorization': 'Bearer ' + App.Api.getToken() },
                        body:    fd
                    });
                    if (!resp.ok) {
                        const e = await resp.json().catch(() => ({ error: 'Preview greška' }));
                        throw new Error(e.error || 'Preview greška');
                    }
                    const preview    = await resp.json();
                    ctx.headers      = preview.headers;
                    ctx.previewRows  = preview.rows;

                    // Count existing entries (for overwrite warning in step 3)
                    const allKat = await App.DB.loadAll('materijali_katalog');
                    ctx.existingCount = allKat.filter(
                        m => m.dobavljac_id === dobId && m.katalog_naziv === katNaziv
                    ).length;

                    // Load saved mapping or auto-map from headers
                    const lsKey = 'mat-mapping-' + dobId + '-' + encodeURIComponent(katNaziv);
                    const saved = localStorage.getItem(lsKey);
                    if (saved) {
                        try { ctx.mapping = JSON.parse(saved); }
                        catch { ctx.mapping = autoMap(ctx.headers); }
                    } else {
                        ctx.mapping = autoMap(ctx.headers);
                    }

                    renderStep2();
                } catch (err) {
                    errEl.textContent   = 'Greška: ' + err.message;
                    errEl.classList.remove('hidden');
                    nextBtn.disabled    = false;
                    nextBtn.textContent = 'Dalje →';
                }
            });
        }

        // ── STEP 2: Mapiranje kolona ──────────────────────────────
        function renderStep2() {
            setActiveStep(2);

            const rowsHtml = ctx.headers.map((h, idx) => {
                const sample = ctx.previewRows
                    .map(row => row[idx] || '')
                    .filter(v => v)
                    .slice(0, 2)
                    .join(', ');

                // Which field is currently mapped to this column?
                const mappedField = Object.keys(ctx.mapping).find(f => ctx.mapping[f] === idx) || '';

                const opts = FIELD_OPTIONS.map(f =>
                    `<option value="${f.value}" ${f.value === mappedField ? 'selected' : ''}>${esc(f.label)}</option>`
                ).join('');

                return `
                    <div class="um-map-row">
                        <div class="um-col-header">${esc(h || 'Kolona ' + (idx + 1))}</div>
                        <div class="um-col-sample">${esc(sample)}</div>
                        <select class="um-col-select form-input" data-col="${idx}">${opts}</select>
                    </div>
                `;
            }).join('');

            stepBody.innerHTML = `
                <div class="um-map-container">
                    <p class="um-map-hint">Povežite Excel kolone s poljima baze. Naziv je obavezan (✱).</p>
                    <div class="um-map-grid">${rowsHtml}</div>
                    <div id="um-s2-err" class="form-error hidden"></div>
                    <div class="mat-modal-btns">
                        <button type="button" class="btn btn-primary"   id="um-s2-next">Dalje →</button>
                        <button type="button" class="btn btn-secondary" id="um-s2-back">← Natrag</button>
                    </div>
                </div>
            `;

            stepBody.querySelector('#um-s2-back').addEventListener('click', renderStep1);

            // Live error clear when Naziv is selected
            stepBody.querySelectorAll('.um-col-select').forEach(sel => {
                sel.addEventListener('change', () => {
                    const errEl = stepBody.querySelector('#um-s2-err');
                    if (!errEl.classList.contains('hidden')) {
                        const hasNaziv = [...stepBody.querySelectorAll('.um-col-select')]
                            .some(s => s.value === 'naziv');
                        if (hasNaziv) errEl.classList.add('hidden');
                    }
                });
            });

            stepBody.querySelector('#um-s2-next').addEventListener('click', () => {
                const errEl = stepBody.querySelector('#um-s2-err');

                // Build mapping from selects (field → colIdx)
                const newMapping = {};
                stepBody.querySelectorAll('.um-col-select').forEach(sel => {
                    const field  = sel.value;
                    const colIdx = parseInt(sel.dataset.col);
                    if (field) newMapping[field] = colIdx;
                });

                // Validate: naziv required
                if (newMapping.naziv == null) {
                    errEl.textContent = 'Naziv kolona je obavezna. Odaberite kolonu za "Naziv ✱".';
                    errEl.classList.remove('hidden');
                    return;
                }

                ctx.mapping = newMapping;

                // Persist mapping to localStorage
                const lsKey = 'mat-mapping-' + ctx.dobavljac_id + '-' + encodeURIComponent(ctx.katalog_naziv);
                try { localStorage.setItem(lsKey, JSON.stringify(newMapping)); } catch (e) { /* quota */ }

                renderStep3();
            });
        }

        // ── STEP 3: Potvrda & Upload ──────────────────────────────
        function renderStep3() {
            setActiveStep(3);

            const dobNaziv     = dobavljaciList.find(d => d.id === ctx.dobavljac_id)?.naziv || ctx.dobavljac_id;
            const mappedLabels = Object.keys(ctx.mapping).map(f => {
                const opt = FIELD_OPTIONS.find(o => o.value === f);
                return opt ? opt.label.replace(' ✱', '') : f;
            }).join(', ');

            const warnHtml = ctx.existingCount > 0
                ? `<div class="dob-upload-warn">
                       Postojeći katalog „${esc(ctx.katalog_naziv)}" za „${esc(dobNaziv)}"
                       (${ctx.existingCount} stavki) će biti zamijenjen.
                   </div>`
                : '';

            stepBody.innerHTML = `
                <div class="mat-add-form">
                    <div class="um-confirm-summary">
                        <div class="um-confirm-row"><span>Dobavljač</span><strong>${esc(dobNaziv)}</strong></div>
                        <div class="um-confirm-row"><span>Katalog</span><strong>${esc(ctx.katalog_naziv)}</strong></div>
                        <div class="um-confirm-row"><span>Datoteka</span><strong>${esc(ctx.file ? ctx.file.name : '')}</strong></div>
                        <div class="um-confirm-row"><span>Polja</span><strong>${esc(mappedLabels)}</strong></div>
                    </div>
                    ${warnHtml}
                    <div id="um-s3-status" class="hidden"></div>
                    <div class="mat-modal-btns">
                        <button type="button" class="btn btn-primary"   id="um-s3-upload">Učitaj</button>
                        <button type="button" class="btn btn-secondary" id="um-s3-back">← Natrag</button>
                    </div>
                </div>
            `;

            stepBody.querySelector('#um-s3-back').addEventListener('click', renderStep2);

            stepBody.querySelector('#um-s3-upload').addEventListener('click', async () => {
                const uploadBtn = stepBody.querySelector('#um-s3-upload');
                const statusEl  = stepBody.querySelector('#um-s3-status');
                uploadBtn.disabled  = true;
                statusEl.className  = 'mat-upload-status';
                statusEl.textContent = 'Učitavanje...';
                statusEl.classList.remove('hidden');

                const formData = new FormData();
                formData.append('file',          ctx.file);
                formData.append('dobavljac_id',  ctx.dobavljac_id);
                formData.append('katalog_naziv', ctx.katalog_naziv);
                formData.append('mapping',       JSON.stringify(ctx.mapping));

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

                    // Refresh catalog in IndexedDB
                    const katalogResp = await fetch('/api/materijali/katalog', {
                        headers: { 'Authorization': 'Bearer ' + App.Api.getToken() }
                    });
                    if (!katalogResp.ok) throw new Error('Greška pri dohvatu kataloga');
                    const noviKatalog = await katalogResp.json();
                    await App.DB.saveAll('materijali_katalog', noviKatalog);

                    statusEl.textContent = `✓ Učitano ${result.imported} materijala.`;
                    statusEl.className   = 'mat-upload-status mat-upload-ok';

                    document.dispatchEvent(new CustomEvent('materijali:katalog-updated'));
                    setTimeout(closeModal, 1500);
                } catch (err) {
                    statusEl.textContent = '✗ Greška: ' + err.message;
                    statusEl.className   = 'mat-upload-status mat-upload-err';
                    uploadBtn.disabled   = false;
                }
            });
        }

        // Start at step 1
        renderStep1();

        return new Promise(resolve => {
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
