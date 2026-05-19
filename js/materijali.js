/* ============================================
   Renato Stolarija – Materijali
   Katalog + Lista nabavke (Einkaufsliste)
   ============================================ */

(function () {
    'use strict';

    // ---------- State ----------
    const state = {
        tab:               'katalog',
        katalogSearch:     '',
        katalogDobavljac:  'sve',   // 'sve' ili dobavljac_id (Lieferant)
        katalogMarka:      'sve',   // 'sve' ili m.dobavljac (Hersteller/brand)
        katalogKategorija: 'sve',   // 'sve' ili m.kategorija
        katalogDebljina:   'sve',
        nabavkaStatus:     'otvoreno',
    };

    // Cache dobavljač ID → naziv za prikaz u karticama
    let dobavljacMap = {};

    // ---------- Init ----------
    function init() {
        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'materijali') render();
        });
        document.querySelectorAll('.menu-item[data-target="materijali"]').forEach(btn => {
            btn.addEventListener('click', () => App.Nav.show('materijali'));
        });
    }

    // ---------- Main render ----------
    function render() {
        const root = document.getElementById('materijali-content');
        if (!root) return;

        root.innerHTML = `
            <div class="mat-tabs">
                <button type="button" class="mat-tab ${state.tab === 'katalog' ? 'active' : ''}"
                        data-tab="katalog">Katalog</button>
                <button type="button" class="mat-tab ${state.tab === 'nabavka' ? 'active' : ''}"
                        data-tab="nabavka">Lista nabavke</button>
            </div>
            <div id="mat-tab-content"></div>
        `;
        root.querySelectorAll('.mat-tab').forEach(btn => {
            btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
        });

        if (state.tab === 'katalog') renderKatalog(root.querySelector('#mat-tab-content'));
        else renderNabavka(root.querySelector('#mat-tab-content'));
    }

    // ============================================================
    // KATALOG TAB
    // ============================================================
    async function renderKatalog(container) {
        container.innerHTML = '<p class="placeholder-hint">Učitavanje...</p>';
        const [katalog, dobavljaciDB] = await Promise.all([
            App.DB.loadAll('materijali_katalog'),
            App.DB.loadAll('dobavljaci')
        ]);

        // Gradi dobavljacMap (id → naziv) za prikaz u karticama
        dobavljacMap = {};
        dobavljaciDB.forEach(d => { dobavljacMap[d.id] = d.naziv; });

        // Lieferant filter (Dobavljač): po dobavljac_id
        const dobavljacIds = [...new Set(katalog.map(m => m.dobavljac_id).filter(Boolean))];
        const dobavljaciFilters = dobavljacIds.map(id => ({
            id,
            naziv: dobavljacMap[id] || id,
        })).sort((a, b) => a.naziv.localeCompare(b.naziv));

        // Marka filter: samo za trenutni Lieferant
        const itemsForMarka = state.katalogDobavljac === 'sve'
            ? katalog
            : katalog.filter(m => m.dobavljac_id === state.katalogDobavljac);
        const marke = [...new Set(itemsForMarka.map(m => m.dobavljac).filter(Boolean))].sort();

        // Kategorija filter: samo za trenutnu Marku (i Lieferant)
        const itemsForKat = state.katalogMarka === 'sve'
            ? itemsForMarka
            : itemsForMarka.filter(m => m.dobavljac === state.katalogMarka);
        const kategorije = [...new Set(itemsForKat.map(m => m.kategorija).filter(Boolean))].sort();

        // Debljina filter
        const debljine = [...new Set(katalog.map(m => m.debljina).filter(v => v != null))]
                          .sort((a, b) => a - b);

        container.innerHTML = `
            <div class="mat-toolbar">
                <div class="mat-search-row">
                    <input type="search" id="mat-search" class="form-input mat-search"
                           placeholder="Pretraži naziv, šifra, marka..."
                           value="${esc(state.katalogSearch)}">
                    <button type="button" class="btn btn-secondary mat-upload-btn" id="mat-upload-btn"
                            title="Učitaj Excel cjenovnik">↑ Učitaj cjenovnik</button>
                </div>
                <div class="mat-filters">
                    ${dobavljaciFilters.length > 0 ? `
                    <div class="mat-filter-group">
                        <span class="mat-filter-label">Dobavljač:</span>
                        <button type="button" class="mat-filter-btn ${state.katalogDobavljac === 'sve' ? 'active' : ''}"
                                data-filter="dobavljac" data-val="sve">Sve</button>
                        ${dobavljaciFilters.map(d => `
                            <button type="button" class="mat-filter-btn ${state.katalogDobavljac === d.id ? 'active' : ''}"
                                    data-filter="dobavljac" data-val="${esc(d.id)}">${esc(d.naziv)}</button>
                        `).join('')}
                    </div>` : ''}
                    ${marke.length > 0 ? `
                    <div class="mat-filter-group">
                        <span class="mat-filter-label">Marka:</span>
                        <button type="button" class="mat-filter-btn ${state.katalogMarka === 'sve' ? 'active' : ''}"
                                data-filter="marka" data-val="sve">Sve</button>
                        ${marke.map(mk => `
                            <button type="button" class="mat-filter-btn ${state.katalogMarka === mk ? 'active' : ''}"
                                    data-filter="marka" data-val="${esc(mk)}">${esc(mk)}</button>
                        `).join('')}
                    </div>` : ''}
                    ${kategorije.length > 0 ? `
                    <div class="mat-filter-group">
                        <span class="mat-filter-label">Kategorija:</span>
                        <button type="button" class="mat-filter-btn ${state.katalogKategorija === 'sve' ? 'active' : ''}"
                                data-filter="kategorija" data-val="sve">Sve</button>
                        ${kategorije.map(k => `
                            <button type="button" class="mat-filter-btn ${state.katalogKategorija === k ? 'active' : ''}"
                                    data-filter="kategorija" data-val="${esc(k)}">${esc(k)}</button>
                        `).join('')}
                    </div>` : ''}
                    ${debljine.length > 0 ? `
                    <div class="mat-filter-group">
                        <span class="mat-filter-label">Debljina:</span>
                        <button type="button" class="mat-filter-btn ${state.katalogDebljina === 'sve' ? 'active' : ''}"
                                data-filter="debljina" data-val="sve">Sve</button>
                        ${debljine.map(d => `
                            <button type="button" class="mat-filter-btn ${state.katalogDebljina == d ? 'active' : ''}"
                                    data-filter="debljina" data-val="${d}">${d} mm</button>
                        `).join('')}
                    </div>` : ''}
                </div>
            </div>
            <div id="mat-katalog-list"></div>
        `;

        container.querySelectorAll('.mat-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const f = btn.dataset.filter;
                if (f === 'dobavljac') {
                    state.katalogDobavljac  = btn.dataset.val;
                    state.katalogMarka      = 'sve';  // reset pri promjeni lieferanta
                    state.katalogKategorija = 'sve';
                } else if (f === 'marka') {
                    state.katalogMarka      = btn.dataset.val;
                    state.katalogKategorija = 'sve';  // reset pri promjeni marke
                } else if (f === 'kategorija') {
                    state.katalogKategorija = btn.dataset.val;
                } else if (f === 'debljina') {
                    state.katalogDebljina   = btn.dataset.val;
                }
                renderKatalog(container);
            });
        });

        const searchEl = container.querySelector('#mat-search');
        searchEl.addEventListener('input', () => {
            state.katalogSearch = searchEl.value;
            renderKatalogList(container.querySelector('#mat-katalog-list'), katalog);
        });

        // Upload button → otvori modal iz Dobavljaci modula
        container.querySelector('#mat-upload-btn').addEventListener('click', async () => {
            if (window.App && window.App.Dobavljaci) {
                await App.Dobavljaci.openUploadModal(null);
                renderKatalog(container);
            }
        });

        // Re-render kataloga kad se upload uspješno završi (npr. iz Dobavljači modula)
        document.addEventListener('materijali:katalog-updated', function onUpdate() {
            document.removeEventListener('materijali:katalog-updated', onUpdate);
            renderKatalog(container);
        });

        renderKatalogList(container.querySelector('#mat-katalog-list'), katalog);
    }

    function renderKatalogList(listEl, katalog) {
        const q = state.katalogSearch.toLowerCase();
        let items = katalog;

        if (state.katalogDobavljac  !== 'sve') items = items.filter(m => m.dobavljac_id === state.katalogDobavljac);
        if (state.katalogMarka      !== 'sve') items = items.filter(m => m.dobavljac    === state.katalogMarka);
        if (state.katalogKategorija !== 'sve') items = items.filter(m => m.kategorija   === state.katalogKategorija);
        // debljina: loose equality (state may hold string or number)
        if (state.katalogDebljina   !== 'sve') items = items.filter(m => m.debljina    == state.katalogDebljina);
        if (q) items = items.filter(m =>
            (m.naziv    || '').toLowerCase().includes(q) ||
            (m.sifra    || '').toLowerCase().includes(q) ||
            (m.dobavljac|| '').toLowerCase().includes(q) ||
            (m.struktura|| '').toLowerCase().includes(q)
        );

        if (!items.length) {
            listEl.innerHTML = katalog.length === 0
                ? '<p class="placeholder-hint">Katalog je prazan. Učitajte Excel cjenovnik (↑ Učitaj cjenovnik).</p>'
                : '<p class="placeholder-hint">Nema rezultata za zadane filtere.</p>';
            return;
        }

        listEl.innerHTML = `
            <div class="mat-count">${items.length} stavki</div>
            <ul class="mat-katalog-list">
                ${items.map(m => renderKatalogCard(m)).join('')}
            </ul>
        `;
    }

    function renderKatalogCard(m) {
        const hasAbs = m.abs_08 != null || m.abs_2 != null;

        // Zeile 1: Šifra · Struktura (lijevo) | Naziv (sredina, bold) | Marka (desno, sivo)
        const sifraStruktura = [m.sifra, m.struktura].filter(Boolean).map(esc).join(' · ');

        // Zeile 2: Lieferant-Name · Katalog-Naziv · Debljina · Format
        const lieferantName = m.dobavljac_id && dobavljacMap[m.dobavljac_id]
            ? `<span class="mat-lieferant-tag">${esc(dobavljacMap[m.dobavljac_id])}</span>`
            : null;
        const meta2Parts = [
            lieferantName,
            m.katalog_naziv ? `<span>${esc(m.katalog_naziv)}</span>` : null,
            m.debljina      ? `<span>${m.debljina} mm</span>`         : null,
            m.format        ? `<span>${esc(m.format)}</span>`         : null,
        ].filter(Boolean);
        const meta2 = meta2Parts.join('<span class="mat-meta-sep"> · </span>');

        // Zeile 3: ABS-Werte
        const absLine = hasAbs ? [
            m.abs_08 != null ? `ABS 0,8mm: <strong>${formatCijena(m.abs_08)} KM/m</strong>` : null,
            m.abs_2  != null ? `ABS 2mm: <strong>${formatCijena(m.abs_2)} KM/m</strong>`    : null,
        ].filter(Boolean).join(' &nbsp;·&nbsp; ') : '';

        return `
            <li class="mat-katalog-item">
                <div class="mat-item-body">
                    <div class="mat-item-row1">
                        ${sifraStruktura ? `<span class="mat-item-sifra-str">${sifraStruktura}</span>` : ''}
                        <span class="mat-item-naziv">${esc(m.naziv)}</span>
                        ${m.dobavljac ? `<span class="mat-marka-inline">${esc(m.dobavljac)}</span>` : ''}
                    </div>
                    ${meta2 ? `<div class="mat-item-row2">${meta2}</div>` : ''}
                    ${hasAbs ? `<div class="mat-item-abs">${absLine}</div>` : ''}
                </div>
                <div class="mat-item-price-col">
                    ${m.cijena != null
                        ? `<div class="mat-item-cijena">${formatCijena(m.cijena)}<span class="mat-cijena-unit"> KM/m²</span></div>`
                        : ''}
                    ${hasAbs ? `<span class="mat-abs-pill">ABS</span>` : ''}
                </div>
            </li>
        `;
    }

    // handleKatalogUpload je preseljen u js/dobavljaci.js (openUploadModal)

    // ============================================================
    // LISTA NABAVKE TAB
    // ============================================================
    async function renderNabavka(container) {
        container.innerHTML = '<p class="placeholder-hint">Učitavanje...</p>';

        let grouped = {};
        try {
            grouped = await App.Api.apiCall('GET', '/materijali/einkauf?status=' + state.nabavkaStatus);
        } catch (e) {
            container.innerHTML = '<p class="placeholder-hint">Greška pri učitavanju.</p>';
            return;
        }

        const total = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

        container.innerHTML = `
            <div class="mat-nabavka-toolbar">
                <div class="mat-status-pills">
                    ${['otvoreno', 'naruceno', 'sve'].map(s => `
                        <button type="button" class="mat-status-pill ${state.nabavkaStatus === s ? 'active' : ''}"
                                data-status="${s}">
                            ${s === 'otvoreno' ? 'Otvoreno' : s === 'naruceno' ? 'Naručeno' : 'Sve'}
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-secondary mat-print-btn" onclick="window.print()">🖨 Ispiši listu</button>
            </div>
            ${total === 0
                ? '<p class="placeholder-hint">Nema pozicija za prikaz.</p>'
                : renderNabavkaGroups(grouped)
            }
        `;

        container.querySelectorAll('.mat-status-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.nabavkaStatus = btn.dataset.status;
                renderNabavka(container);
            });
        });

        container.querySelectorAll('.mat-narudzeno-cb').forEach(cb => {
            cb.addEventListener('change', async () => {
                const id = cb.dataset.id;
                const narudzeno = cb.checked ? 1 : 0;
                try {
                    await App.Api.apiCall('PUT', '/materijali/positions/' + id, {
                        naziv:    cb.dataset.naziv,
                        kolicina: parseFloat(cb.dataset.kolicina),
                        jedinica: cb.dataset.jedinica,
                        narudzeno
                    });
                } catch (e) {
                    cb.checked = !cb.checked;
                    alert('Greška: ' + e.message);
                }
            });
        });
    }

    function renderNabavkaGroups(grouped) {
        return Object.entries(grouped).map(([dobavljac, items]) => `
            <div class="mat-nabavka-group">
                <div class="mat-group-header">
                    <span class="mat-group-naziv">${esc(dobavljac)}</span>
                    <span class="mat-group-count">${items.length} pos.</span>
                </div>
                <ul class="mat-nabavka-list">
                    ${items.map(item => `
                        <li class="mat-nabavka-item ${item.narudzeno ? 'naruceno' : ''}">
                            <label class="mat-nabavka-cb-label">
                                <input type="checkbox" class="mat-narudzeno-cb"
                                       data-id="${esc(item.id)}"
                                       data-naziv="${esc(item.naziv)}"
                                       data-kolicina="${esc(String(item.kolicina))}"
                                       data-jedinica="${esc(item.jedinica || 'kom')}"
                                       ${item.narudzeno ? 'checked' : ''}>
                            </label>
                            <div class="mat-nabavka-info">
                                <div class="mat-nabavka-naziv">${esc(item.naziv)}</div>
                                <div class="mat-nabavka-sub">
                                    <span class="mat-nabavka-narudzba">↳ ${esc(item.narudzba_naziv)}</span>
                                    <span class="mat-nabavka-kolicina">${esc(String(item.kolicina))} ${esc(item.jedinica || 'kom')}</span>
                                    ${item.napomena ? `<span class="mat-nabavka-napomena">${esc(item.napomena)}</span>` : ''}
                                </div>
                            </div>
                            ${item.cijena != null ? `<div class="mat-nabavka-cijena">${formatCijena(item.cijena)}</div>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
    }

    // ============================================================
    // Helpers
    // ============================================================
    function formatCijena(v) {
        if (v == null) return '';
        return parseFloat(v).toFixed(2).replace('.', ',');
    }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function genId() {
        return 'mat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }

    // ============================================================
    // Dodaj-Modal — vraća Promise<Array|null>
    // Array može imati 1 poziciju (ploča) ili 2 (ploča + ABS)
    // ============================================================
    async function openAddModal(narudzbaId) {
        return new Promise(async (resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay mat-modal-overlay';

            const katalog = await App.DB.loadAll('materijali_katalog');

            overlay.innerHTML = `
                <div class="modal mat-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Dodaj materijal</h3>
                        <button type="button" class="modal-close" id="mat-modal-close">✕</button>
                    </div>
                    <div class="mat-modal-tabs">
                        <button type="button" class="mat-modal-tab active" data-modal-tab="katalog">Iz kataloga</button>
                        <button type="button" class="mat-modal-tab" data-modal-tab="rucni">Ručni unos</button>
                    </div>
                    <div id="mat-modal-body"></div>
                </div>
            `;
            document.body.appendChild(overlay);

            let activeTab = 'katalog';
            let selectedKatalog = null;

            function closeModal() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }

            function renderModalTab() {
                const body = overlay.querySelector('#mat-modal-body');
                overlay.querySelectorAll('.mat-modal-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.modalTab === activeTab);
                });
                if (activeTab === 'katalog') renderModalKatalog(body, katalog);
                else renderModalRucni(body, selectedKatalog);
            }

            overlay.querySelectorAll('.mat-modal-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeTab = btn.dataset.modalTab;
                    renderModalTab();
                });
            });

            overlay.querySelector('#mat-modal-close').addEventListener('click', () => {
                closeModal();
                resolve(null);
            });

            // ---- Katalog-Tab ----
            function renderModalKatalog(body, items) {
                body.innerHTML = `
                    <div class="mat-modal-search-row">
                        <input type="search" class="form-input mat-modal-search"
                               placeholder="Pretraži katalog..." autocomplete="off">
                    </div>
                    <ul class="mat-modal-katalog-list" id="mat-modal-katalog-items"></ul>
                `;
                const listEl  = body.querySelector('#mat-modal-katalog-items');
                const searchEl = body.querySelector('.mat-modal-search');

                function filterAndRender() {
                    const q = searchEl.value.toLowerCase();
                    const filtered = q
                        ? items.filter(m =>
                            (m.naziv    || '').toLowerCase().includes(q) ||
                            (m.sifra    || '').toLowerCase().includes(q) ||
                            (m.dobavljac|| '').toLowerCase().includes(q) ||
                            (m.struktura|| '').toLowerCase().includes(q))
                        : items.slice(0, 60);

                    listEl.innerHTML = filtered.length === 0
                        ? '<li class="mat-modal-empty">Nema rezultata.</li>'
                        : filtered.map(m => {
                            const hasAbs = m.abs_08 != null || m.abs_2 != null;
                            const meta = [
                                m.sifra    ? esc(m.sifra)    : null,
                                m.dobavljac? esc(m.dobavljac): null,
                                m.debljina ? `${m.debljina} mm` : null,
                            ].filter(Boolean).join(' · ');
                            return `
                                <li class="mat-modal-katalog-item" data-id="${esc(m.id)}">
                                    <div class="mat-item-naziv">${esc(m.naziv)}</div>
                                    <div class="mat-item-meta">
                                        ${meta ? `<span class="mat-modal-meta">${meta}</span>` : ''}
                                        ${m.cijena != null ? `<span class="mat-cijena-sm">${formatCijena(m.cijena)} KM/m²</span>` : ''}
                                        ${hasAbs ? `<span class="mat-abs-pill mat-abs-pill-sm">ABS</span>` : ''}
                                    </div>
                                    ${hasAbs ? `<div class="mat-modal-abs-info">
                                        Odgovarajući ABS:
                                        ${m.abs_08 != null ? `<span>0,8mm – ${formatCijena(m.abs_08)} KM/m</span>` : ''}
                                        ${m.abs_2  != null ? `<span>2mm – ${formatCijena(m.abs_2)} KM/m</span>` : ''}
                                    </div>` : ''}
                                </li>
                            `;
                        }).join('');

                    listEl.querySelectorAll('.mat-modal-katalog-item').forEach(li => {
                        li.addEventListener('click', () => {
                            selectedKatalog = items.find(m => m.id === li.dataset.id);
                            activeTab = 'rucni';
                            renderModalTab();
                        });
                    });
                }
                searchEl.addEventListener('input', filterAndRender);
                filterAndRender();
            }

            // ---- Ručni unos Tab ----
            function renderModalRucni(body, prefill) {
                const hasAbs = prefill && (prefill.abs_08 != null || prefill.abs_2 != null);

                body.innerHTML = `
                    <form id="mat-add-form" class="mat-add-form">
                        <div class="form-group">
                            <label class="form-label" for="maf-naziv">Naziv *</label>
                            <input type="text" id="maf-naziv" class="form-input" required
                                   value="${esc(prefill?.naziv || '')}">
                        </div>
                        <div class="mat-form-row">
                            <div class="form-group">
                                <label class="form-label" for="maf-kolicina">Količina *</label>
                                <input type="number" id="maf-kolicina" class="form-input"
                                       min="0" step="any" required value="">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="maf-jedinica">Jedinica</label>
                                <select id="maf-jedinica" class="form-input">
                                    ${['kom','m','m²','kg','paket'].map(u =>
                                        `<option value="${u}">${u}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="maf-cijena">Cijena (KM/m²)</label>
                            <input type="number" id="maf-cijena" class="form-input"
                                   min="0" step="any" value="${prefill?.cijena != null ? prefill.cijena : ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="maf-napomena">Napomena</label>
                            <input type="text" id="maf-napomena" class="form-input" value="">
                        </div>

                        ${hasAbs ? `
                        <div class="mat-abs-section">
                            <div class="mat-abs-section-label">Odgovarajući ABS:</div>
                            <div class="mat-abs-btns">
                                ${prefill.abs_08 != null ? `
                                <button type="button" class="btn mat-abs-add-btn" data-abs="08"
                                        data-cijena="${prefill.abs_08}"
                                        data-naziv="${esc('ABS traka 0,8mm – ' + (prefill.naziv || ''))}">
                                    + Dodaj ABS 0,8mm (${formatCijena(prefill.abs_08)} KM/m)
                                </button>` : ''}
                                ${prefill.abs_2 != null ? `
                                <button type="button" class="mat-abs-add-btn" data-abs="2"
                                        data-cijena="${prefill.abs_2}"
                                        data-naziv="${esc('ABS traka 2mm – ' + (prefill.naziv || ''))}">
                                    + Dodaj ABS 2mm (${formatCijena(prefill.abs_2)} KM/m)
                                </button>` : ''}
                            </div>
                        </div>` : ''}

                        <div id="maf-abs-chosen" class="mat-abs-chosen-list"></div>
                        <div id="maf-error" class="form-error hidden"></div>
                        <div class="mat-modal-btns">
                            <button type="submit" class="btn btn-primary">Spremi</button>
                            <button type="button" class="btn btn-secondary" id="maf-cancel">Odustani</button>
                        </div>
                    </form>
                `;

                // Track additional ABS positions chosen
                const chosenAbs = [];

                body.querySelectorAll('.mat-abs-add-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const absNaziv  = btn.dataset.naziv;
                        const absCijena = parseFloat(btn.dataset.cijena) || null;
                        // Prevent duplicates
                        if (chosenAbs.find(a => a.naziv === absNaziv)) return;
                        chosenAbs.push({
                            naziv:     absNaziv,
                            cijena:    absCijena,
                            dobavljac: prefill?.dobavljac || null,
                            katalog_id: null,
                            sifra:     null,
                            debljina:  null,
                        });
                        btn.disabled = true;
                        btn.textContent = '✓ ' + btn.textContent.replace('+ ', '');
                        btn.classList.add('mat-abs-add-btn-done');
                        // Show label in chosen list
                        const tag = document.createElement('div');
                        tag.className = 'mat-abs-chosen-tag';
                        tag.textContent = absNaziv;
                        body.querySelector('#maf-abs-chosen').appendChild(tag);
                    });
                });

                body.querySelector('#maf-cancel').addEventListener('click', () => {
                    closeModal();
                    resolve(null);
                });

                body.querySelector('#mat-add-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const naziv    = body.querySelector('#maf-naziv').value.trim();
                    const kolicina = parseFloat(body.querySelector('#maf-kolicina').value);
                    if (!naziv || isNaN(kolicina) || kolicina <= 0) {
                        body.querySelector('#maf-error').textContent = 'Naziv i količina su obavezni.';
                        body.querySelector('#maf-error').classList.remove('hidden');
                        return;
                    }
                    const cijena = parseFloat(body.querySelector('#maf-cijena').value);
                    const main = {
                        naziv,
                        kolicina,
                        jedinica:      body.querySelector('#maf-jedinica').value,
                        cijena:        isNaN(cijena) ? null : cijena,
                        napomena:      body.querySelector('#maf-napomena').value.trim() || null,
                        katalog_id:    prefill?.id          || null,
                        sifra:         prefill?.sifra       || null,
                        dobavljac:     prefill?.dobavljac   || null,
                        dobavljac_id:  prefill?.dobavljac_id || null,
                        debljina:      prefill?.debljina    || null,
                    };
                    // Build ABS positions: kolicina will be set in narudzbe.js (user may want different amount)
                    const absPositions = chosenAbs.map(a => ({
                        ...a,
                        kolicina: 1,
                        jedinica: 'm',
                        napomena: null,
                    }));
                    closeModal();
                    resolve([main, ...absPositions]);
                });
            }

            renderModalTab();
        });
    }

    document.addEventListener('DOMContentLoaded', () => init());
    window.App = window.App || {};
    window.App.Materijali = { openAddModal };
}());
