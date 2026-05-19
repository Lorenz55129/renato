/* ============================================
   Renato Stolarija - Modul: Narudžbe
   Projekti / narudžbe povezani s kupcima: lista, detalji,
   forma za unos/uređivanje, status workflow, mjere, fotografije.
   Pohrana u localStorage pod ključem "narudzbe".
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'narudzbe';

    const STATUSI = ['upit', 'ponuda', 'narudzba', 'izrada', 'montaza', 'gotovo'];

    const STATUS_LABELS = {
        upit: 'Upit',
        ponuda: 'Ponuda',
        narudzba: 'Narudžba',
        izrada: 'Izrada',
        montaza: 'Montaža',
        gotovo: 'Gotovo'
    };

    const KATEGORIJE = ['Kuhinja', 'Spavaća soba', 'Dnevni boravak', 'Kupaonica', 'Ured', 'Ostalo'];
    const DEFAULT_KATEGORIJA = 'Ostalo';

    // Maksimalne dimenzije i kvaliteta za kompresiju fotografija (zaštita localStorage limita).
    const PHOTO_MAX_DIM = 1280;
    const PHOTO_QUALITY = 0.82;

    const state = {
        view: 'list',          // 'list' | 'detail'
        selectedId: null,
        filter: 'all'          // 'all' | 'aktivi' | 'gotovo'
    };

    // Slušatelji koje treba očistiti kad se forma zatvori.
    let pendingKupacListener = null;

    // Sprječava da click iza long-pressa otvori viewer.
    let suppressNextClick = false;

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

    function kupacIme(kupacId) {
        if (!kupacId) return 'Bez kupca';
        if (!window.App.Kupci) return '—';
        const k = window.App.Kupci.getById(kupacId);
        return k ? k.ime : 'Nepoznat kupac';
    }

    // ----- Pristup podacima -----
    function getAll() {
        return window.App.Storage.load(STORAGE_KEY, []);
    }

    function saveAll(list) {
        return window.App.Storage.save(STORAGE_KEY, list);
    }

    function getById(id) {
        return getAll().find(n => n.id === id) || null;
    }

    function getByKupacId(kupacId) {
        return getAll().filter(n => n.kupac_id === kupacId);
    }

    function buildMjere(src) {
        src = src || {};
        return {
            sirina: (src.sirina || '').toString().trim(),
            visina: (src.visina || '').toString().trim(),
            dubina: (src.dubina || '').toString().trim(),
            napomena_mjere: (src.napomena_mjere || '').toString().trim()
        };
    }

    function createNarudzba(data) {
        const list = getAll();
        const novi = {
            id: window.App.Storage.generateId(),
            kupac_id: data.kupac_id || null,
            naziv: (data.naziv || '').trim(),
            status: STATUSI[0],
            opis: (data.opis || '').trim(),
            materijal: (data.materijal || '').trim(),
            boja_povrsina: (data.boja_povrsina || '').trim(),
            kategorija: KATEGORIJE.includes(data.kategorija) ? data.kategorija : DEFAULT_KATEGORIJA,
            mjere: buildMjere(data.mjere),
            fotografije: [],
            datum_unosa: todayISO(),
            datum_isporuke: data.datum_isporuke || ''
        };
        list.push(novi);
        saveAll(list);
        return novi;
    }

    function updateNarudzba(id, patch) {
        const list = getAll();
        const i = list.findIndex(n => n.id === id);
        if (i === -1) return null;
        list[i] = { ...list[i], ...patch };
        saveAll(list);
        return list[i];
    }

    function deleteNarudzba(id) {
        const list = getAll().filter(n => n.id !== id);
        saveAll(list);
    }

    function nextStatus(current) {
        const i = STATUSI.indexOf(current);
        if (i === -1 || i >= STATUSI.length - 1) return null;
        return STATUSI[i + 1];
    }

    // ----- Kompresija slike (canvas → JPEG base64) -----
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Čitanje datoteke nije uspjelo.'));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Nije moguće učitati sliku.'));
                img.onload = () => {
                    let { width, height } = img;
                    if (width > PHOTO_MAX_DIM || height > PHOTO_MAX_DIM) {
                        const ratio = Math.min(PHOTO_MAX_DIM / width, PHOTO_MAX_DIM / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
                    } catch (err) {
                        reject(err);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // ----- Prikaz: lista narudžbi -----
    function renderList() {
        const container = document.getElementById('narudzbe-content');
        if (!container) return;

        container.innerHTML = `
            <div class="narudzbe-toolbar">
                <div class="filter-tabs" role="tablist" aria-label="Filter narudžbi">
                    <button type="button" class="filter-tab ${state.filter === 'all' ? 'active' : ''}" data-filter="all" role="tab">Sve</button>
                    <button type="button" class="filter-tab ${state.filter === 'aktivi' ? 'active' : ''}" data-filter="aktivi" role="tab">Aktivne</button>
                    <button type="button" class="filter-tab ${state.filter === 'gotovo' ? 'active' : ''}" data-filter="gotovo" role="tab">Gotove</button>
                </div>
                <button type="button" class="btn btn-primary btn-block" id="btn-nova-narudzba">+ Nova narudžba</button>
            </div>
            <div id="narudzbe-list-container"></div>
        `;

        container.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.filter = tab.getAttribute('data-filter');
                renderList();
            });
        });

        const btnNew = document.getElementById('btn-nova-narudzba');
        if (btnNew) btnNew.addEventListener('click', () => openForm(null));

        renderListContainer();
    }

    function applyFilter(list) {
        if (state.filter === 'aktivi') return list.filter(n => n.status !== 'gotovo');
        if (state.filter === 'gotovo') return list.filter(n => n.status === 'gotovo');
        return list.slice();
    }

    function renderListContainer() {
        const cont = document.getElementById('narudzbe-list-container');
        if (!cont) return;

        const all = getAll();
        const filtered = applyFilter(all);

        // Sortiraj: aktivne prvo po datumu isporuke (uzlazno), gotove po datumu unosa (silazno).
        filtered.sort((a, b) => {
            if (a.status === 'gotovo' && b.status !== 'gotovo') return 1;
            if (b.status === 'gotovo' && a.status !== 'gotovo') return -1;
            const ad = a.datum_isporuke || '9999-12-31';
            const bd = b.datum_isporuke || '9999-12-31';
            return ad.localeCompare(bd);
        });

        if (all.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nemate unesenih narudžbi.</p>
                    <p class="placeholder-hint">Dodajte prvu narudžbu klikom na "+ Nova narudžba".</p>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Nema narudžbi u ovom filteru.</p>
                </div>
            `;
            return;
        }

        cont.innerHTML = `
            <ul class="narudzba-list">
                ${filtered.map(n => `
                    <li class="narudzba-card" data-id="${escapeHtml(n.id)}" role="button" tabindex="0">
                        <div class="narudzba-card-main">
                            <div class="narudzba-card-title">${escapeHtml(n.naziv || 'Bez naziva')}</div>
                            <div class="narudzba-card-kupac">${escapeHtml(kupacIme(n.kupac_id))}</div>
                            <div class="narudzba-card-meta">
                                <span class="status-badge status-${escapeHtml(n.status)}">${escapeHtml(STATUS_LABELS[n.status] || n.status)}</span>
                                ${n.datum_isporuke
                                    ? `<span class="narudzba-card-date">Isporuka: ${escapeHtml(formatDate(n.datum_isporuke))}</span>`
                                    : ''}
                            </div>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;

        cont.querySelectorAll('.narudzba-card').forEach(card => {
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

    // ----- Prikaz: detalji narudžbe -----
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
        const container = document.getElementById('narudzbe-content');
        if (!container) return;

        const n = getById(state.selectedId);
        if (!n) {
            showList();
            return;
        }

        const sljedeci = nextStatus(n.status);
        const fotografije = n.fotografije || [];
        const linkedPonude = getLinkedPonude(n.id);
        const m = n.mjere || {};

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back">‹ Nazad</button>

            <div class="detail-card">
                <h3 class="detail-title">${escapeHtml(n.naziv || 'Bez naziva')}</h3>

                <div class="detail-row">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        <span class="status-badge status-${escapeHtml(n.status)}">${escapeHtml(STATUS_LABELS[n.status] || n.status)}</span>
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Kupac</div>
                    <div class="detail-value">${escapeHtml(kupacIme(n.kupac_id))}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Datum unosa</div>
                    <div class="detail-value">${escapeHtml(formatDate(n.datum_unosa))}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Datum isporuke</div>
                    <div class="detail-value">${n.datum_isporuke ? escapeHtml(formatDate(n.datum_isporuke)) : '—'}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Opis projekta</div>
                    <div class="detail-value detail-value-multiline">${escapeHtml(n.opis || '—')}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Materijal</div>
                    <div class="detail-value">${escapeHtml(n.materijal || '—')}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Boja i površina</div>
                    <div class="detail-value">${escapeHtml(n.boja_povrsina || '—')}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Kategorija</div>
                    <div class="detail-value">${escapeHtml(n.kategorija || DEFAULT_KATEGORIJA)}</div>
                </div>
            </div>

            <section class="detail-section">
                <h4 class="detail-section-title">Mjere</h4>
                <div class="mjere-grid">
                    <div class="form-group">
                        <label class="form-label" for="mjere-sirina">Širina (cm)</label>
                        <input class="form-input" id="mjere-sirina" type="number" inputmode="decimal"
                               step="0.1" data-field="sirina" value="${escapeHtml(m.sirina || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="mjere-visina">Visina (cm)</label>
                        <input class="form-input" id="mjere-visina" type="number" inputmode="decimal"
                               step="0.1" data-field="visina" value="${escapeHtml(m.visina || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="mjere-dubina">Dubina (cm)</label>
                        <input class="form-input" id="mjere-dubina" type="number" inputmode="decimal"
                               step="0.1" data-field="dubina" value="${escapeHtml(m.dubina || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="mjere-napomena">Napomena (mjere)</label>
                    <textarea class="form-textarea" id="mjere-napomena" data-field="napomena_mjere" rows="2">${escapeHtml(m.napomena_mjere || '')}</textarea>
                </div>
                <div class="mjere-status" id="mjere-status" aria-live="polite"></div>
            </section>

            <section class="detail-section">
                <h4 class="detail-section-title">Fotografije <span class="detail-section-count">(${fotografije.length})</span></h4>

                ${fotografije.length === 0
                    ? `<p class="placeholder-hint">Nema dodanih fotografija.</p>`
                    : `<div class="photo-grid">
                        ${fotografije.map((src, i) => `
                            <button type="button" class="photo-thumb" data-index="${i}" aria-label="Otvori fotografiju ${i + 1}">
                                <img src="${src}" alt="Fotografija ${i + 1}" loading="lazy">
                            </button>
                        `).join('')}
                       </div>`}

                <label class="btn btn-secondary btn-block photo-add-btn">
                    <input type="file" accept="image/*" capture="environment" id="photo-input" hidden>
                    <span>Dodaj foto</span>
                </label>
                <div class="photo-status" id="photo-status" aria-live="polite"></div>
            </section>

            <section class="detail-section">
                <h4 class="detail-section-title">Skice <span class="detail-section-count">(${(n.aufmass_skice || []).length})</span></h4>
                ${(n.aufmass_skice || []).length === 0
                    ? `<p class="placeholder-hint">Nema spremljenih skica.</p>`
                    : `<div class="photo-grid skica-grid">
                        ${(n.aufmass_skice || []).map(s => {
                            const thumbSrc = s.thumbnail || s.imageData || '';
                            return `
                            <div class="skica-cell">
                                <button type="button" class="photo-thumb skica-thumb" data-skica-id="${escapeHtml(s.id)}"
                                        aria-label="Otvori skicu: ${escapeHtml(s.naziv || '')}">
                                    ${thumbSrc
                                        ? `<img src="${thumbSrc}" alt="" loading="lazy">`
                                        : `<span class="skica-no-preview">Nema pregleda</span>`}
                                </button>
                                <div class="skica-naziv">${escapeHtml(s.naziv || 'Bez naziva')}</div>
                                <div class="skica-datum">${escapeHtml(formatSkicaDatum(s.datum))}</div>
                                <button type="button" class="btn btn-ghost skica-edit-btn" data-skica-id="${escapeHtml(s.id)}">
                                    ✏️ Uredi
                                </button>
                            </div>
                        `;}).join('')}
                       </div>`}
                <button type="button" class="btn btn-secondary btn-block" id="btn-aufmass">Nova skica</button>
            </section>

            <section class="detail-section" id="section-materijal-pozicije">
                <div class="detail-section-header">
                    <h4 class="detail-section-title">Materijal <span class="detail-section-count" id="mat-pos-count"></span></h4>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-dodaj-materijal">+ Dodaj</button>
                </div>
                <div id="mat-pozicije-list"><p class="placeholder-hint">Učitavanje...</p></div>
            </section>

            <section class="detail-section">
                <h4 class="detail-section-title">Ponude <span class="detail-section-count">(${linkedPonude.length})</span></h4>
                ${linkedPonude.length === 0
                    ? `<p class="placeholder-hint">Nema povezanih ponuda.</p>`
                    : `<ul class="linked-ponuda-list">
                        ${linkedPonude.map(p => `
                            <li class="linked-ponuda-card" data-ponuda-id="${escapeHtml(p.id)}" role="button" tabindex="0">
                                <div class="linked-ponuda-main">
                                    <div class="linked-ponuda-broj">${escapeHtml(p.broj || '?')}</div>
                                    <div class="linked-ponuda-meta">
                                        <span class="status-badge status-${escapeHtml(p.status)}">${escapeHtml(ponudaStatusLabel(p.status))}</span>
                                        <span class="linked-ponuda-date">${escapeHtml(formatDate(p.datum_ponude))}</span>
                                    </div>
                                </div>
                                <div class="linked-ponuda-amount">${escapeHtml(formatPonudaBrutto(p))}</div>
                            </li>
                        `).join('')}
                       </ul>`
                }
                <button type="button" class="btn btn-secondary btn-block" id="btn-nova-ponuda-za-narudzbu">Nova ponuda za ovu narudžbu</button>
            </section>

            <div class="detail-actions">
                ${sljedeci
                    ? `<button type="button" class="btn btn-primary btn-block" id="btn-status">
                          Sljedeći korak: ${escapeHtml(STATUS_LABELS[sljedeci])}
                       </button>`
                    : `<div class="status-final-note">Narudžba je gotova.</div>`}
                <button type="button" class="btn btn-ghost btn-block" id="btn-uredi">Uredi</button>
                <button type="button" class="btn btn-danger btn-block" id="btn-obrisi">Obriši</button>
            </div>
        `;

        // ----- Bindings -----
        // Scope-aj kroz container - getElementById može pogoditi istoimene
        // gumbe iz drugih (skrivenih) modula u DOM-u.
        container.querySelector('#btn-back').addEventListener('click', showList);
        container.querySelector('#btn-uredi').addEventListener('click', () => openForm(n.id));
        container.querySelector('#btn-obrisi').addEventListener('click', () => handleDelete(n));

        const btnStatus = container.querySelector('#btn-status');
        if (btnStatus) btnStatus.addEventListener('click', () => handleAdvanceStatus(n));

        const btnAufmass = container.querySelector('#btn-aufmass');
        if (btnAufmass) {
            btnAufmass.addEventListener('click', () => {
                if (window.App.Aufmass && typeof window.App.Aufmass.openForNarudzba === 'function') {
                    window.App.Aufmass.openForNarudzba(n.id);
                }
            });
        }

        // Mjere - auto-save na blur
        container.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('blur', () => saveMjereField(n.id, inp));
        });

        // Photo input
        const photoInput = container.querySelector('#photo-input');
        if (photoInput) photoInput.addEventListener('change', handlePhotoSelect);

        // Photo thumbnails (selektira samo prave fotografije, ne skice)
        container.querySelectorAll('.photo-thumb[data-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                openPhotoViewer(idx);
            });
        });

        // Skica thumbnails (tap = viewer, longpress = obriši)
        container.querySelectorAll('.skica-thumb').forEach(btn => {
            const skicaId = btn.getAttribute('data-skica-id');
            btn.addEventListener('click', () => {
                if (suppressNextClick) {
                    suppressNextClick = false;
                    return;
                }
                const skica = (n.aufmass_skice || []).find(s => s.id === skicaId);
                if (skica) openSkicaViewer(skica);
            });
            attachLongpress(btn, () => handleDeleteSkica(n.id, skicaId));
        });

        // Skica edit buttons → otvori aufmaß s postojećom skicom
        container.querySelectorAll('.skica-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skicaId = btn.getAttribute('data-skica-id');
                if (window.App.Aufmass && typeof window.App.Aufmass.openForNarudzba === 'function') {
                    window.App.Aufmass.openForNarudzba(n.id, skicaId);
                }
            });
        });

        // Vezane ponude: tap → otvori Ponude modul i prikaži ovu ponudu
        container.querySelectorAll('.linked-ponuda-card').forEach(card => {
            const pid = card.getAttribute('data-ponuda-id');
            const open = () => {
                if (!window.App.Ponude || typeof window.App.Ponude.openDetail !== 'function') return;
                if (window.App.Ponude.openDetail(pid)) {
                    window.App.Nav.show('ponude');
                }
            };
            card.addEventListener('click', open);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
            });
        });

        // Nova ponuda za ovu narudžbu (otvara Ponude formu s pretpunjenim kupcem/narudžbom)
        const btnNovaPonuda = container.querySelector('#btn-nova-ponuda-za-narudzbu');
        if (btnNovaPonuda) {
            btnNovaPonuda.addEventListener('click', () => {
                if (window.App.Ponude && typeof window.App.Ponude.openForm === 'function') {
                    window.App.Ponude.openForm(null, {
                        narudzba_id: n.id,
                        kupac_id: n.kupac_id
                    });
                }
            });
        }

        // Materijal pozicije – učitaj asinkrono
        const btnDodajMat = container.querySelector('#btn-dodaj-materijal');
        if (btnDodajMat) {
            btnDodajMat.addEventListener('click', () => handleDodajMaterijal(n.id, container));
        }
        loadMaterijaliPozicije(n.id, container);
    }

    // ----- Materijal pozicije -----

    async function loadMaterijaliPozicije(narudzbaId, container) {
        const listEl = container.querySelector('#mat-pozicije-list');
        const countEl = container.querySelector('#mat-pos-count');
        if (!listEl) return;

        let positions = [];
        try {
            positions = await App.Api.apiCall('GET', '/materijali/positions?narudzba_id=' + encodeURIComponent(narudzbaId));
        } catch (e) {
            // Fallback: IndexedDB cache
            const all = await App.DB.loadAll('narudzba_materijali');
            positions = all.filter(p => p.narudzba_id === narudzbaId);
        }

        if (countEl) countEl.textContent = positions.length ? '(' + positions.length + ')' : '';

        if (!positions.length) {
            listEl.innerHTML = '<p class="placeholder-hint">Nema materijala za ovu narudžbu.</p>';
            return;
        }

        listEl.innerHTML = `
            <ul class="mat-pozicije-list">
                ${positions.map(p => `
                    <li class="mat-pozicija-item ${p.narudzeno ? 'naruceno' : ''}">
                        <label class="mat-pozicija-cb-label" title="Naručeno">
                            <input type="checkbox" class="mat-pos-cb" data-id="${escapeHtml(p.id)}"
                                   ${p.narudzeno ? 'checked' : ''}>
                        </label>
                        <div class="mat-pozicija-info">
                            <div class="mat-pozicija-naziv">${escapeHtml(p.naziv)}</div>
                            <div class="mat-pozicija-meta">
                                ${p.dobavljac ? `<span class="mat-dobavljac">${escapeHtml(p.dobavljac)}</span>` : ''}
                                <span class="mat-kolicina">${escapeHtml(String(p.kolicina))} ${escapeHtml(p.jedinica || 'kom')}</span>
                                ${p.cijena != null ? `<span class="mat-cijena-sm">${parseFloat(p.cijena).toFixed(2).replace('.', ',')} KM/m²</span>` : ''}
                                ${p.napomena ? `<span class="mat-napomena-sm">${escapeHtml(p.napomena)}</span>` : ''}
                            </div>
                        </div>
                        <div class="mat-pozicija-actions">
                            <button type="button" class="btn btn-ghost btn-sm mat-pos-del"
                                    data-id="${escapeHtml(p.id)}" title="Obriši">✕</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;

        // Naručeno checkbox
        listEl.querySelectorAll('.mat-pos-cb').forEach(cb => {
            cb.addEventListener('change', async () => {
                try {
                    const pos = positions.find(p => p.id === cb.dataset.id);
                    if (!pos) return;
                    await App.Api.apiCall('PUT', '/materijali/positions/' + cb.dataset.id, {
                        ...pos, narudzeno: cb.checked ? 1 : 0
                    });
                    // Refresh section
                    loadMaterijaliPozicije(narudzbaId, container);
                } catch (e) {
                    cb.checked = !cb.checked;
                    alert('Greška: ' + e.message);
                }
            });
        });

        // Obriši
        listEl.querySelectorAll('.mat-pos-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Stvarno obrisati ovu poziciju?')) return;
                try {
                    await App.Api.apiCall('DELETE', '/materijali/positions/' + btn.dataset.id);
                    loadMaterijaliPozicije(narudzbaId, container);
                } catch (e) {
                    alert('Greška pri brisanju: ' + e.message);
                }
            });
        });
    }

    async function handleDodajMaterijal(narudzbaId, container) {
        if (!window.App.Materijali) {
            alert('Materijali modul nije učitan.');
            return;
        }
        const result = await window.App.Materijali.openAddModal(narudzbaId);
        if (!result) return;

        const id = 'mat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        try {
            await App.Api.apiCall('POST', '/materijali/positions', {
                id,
                narudzba_id: narudzbaId,
                ...result,
                narudzeno: 0,
                created_by: App.Auth.currentUser()?.id || null
            });
            loadMaterijaliPozicije(narudzbaId, container);
        } catch (e) {
            alert('Greška pri dodavanju: ' + e.message);
        }
    }

    function saveMjereField(narudzbaId, inputEl) {
        const field = inputEl.getAttribute('data-field');
        const value = inputEl.value.trim();
        const n = getById(narudzbaId);
        if (!n) return;
        const novi = { ...(n.mjere || {}), [field]: value };
        updateNarudzba(narudzbaId, { mjere: buildMjere(novi) });
        flashMjereStatus('Spremljeno.');
    }

    function flashMjereStatus(msg) {
        const el = document.getElementById('mjere-status');
        if (!el) return;
        el.textContent = msg;
        clearTimeout(flashMjereStatus._t);
        flashMjereStatus._t = setTimeout(() => { el.textContent = ''; }, 1500);
    }

    function handleAdvanceStatus(n) {
        const next = nextStatus(n.status);
        if (!next) return;
        const ok = window.confirm(
            `Promijeniti status iz "${STATUS_LABELS[n.status]}" u "${STATUS_LABELS[next]}"?`
        );
        if (!ok) return;
        updateNarudzba(n.id, { status: next });

        // Bidirekcijska sinkronizacija: gotovo → ponudi auto-prihvati otvorene povezane ponude
        if (next === 'gotovo') {
            propagateGotovoToPonude(n.id);
        }

        renderDetail();
    }

    function handleDelete(n) {
        const ok = window.confirm(
            `Sigurno obrisati narudžbu "${n.naziv}"? Ova radnja se ne može poništiti.`
        );
        if (!ok) return;
        deleteNarudzba(n.id);
        showList();
    }

    // ----- Foto: dodaj / prikaži / obriši -----
    // Javna funkcija - koristi je galerija i interni handler.
    async function addFoto(narudzbaId, file) {
        const base64 = await compressImage(file);
        const n = getById(narudzbaId);
        if (!n) throw new Error('Narudžba ne postoji.');
        const fotografije = [...(n.fotografije || []), base64];
        const ok = updateNarudzba(narudzbaId, { fotografije });
        if (!ok) throw new Error('Spremanje nije uspjelo (prostor je možda pun).');
        if (window.App.Galerija && typeof window.App.Galerija.refresh === 'function') {
            window.App.Galerija.refresh();
        }
        return getById(narudzbaId);
    }

    function removeFoto(narudzbaId, index) {
        const n = getById(narudzbaId);
        if (!n) return null;
        const fotografije = (n.fotografije || []).filter((_, i) => i !== index);
        updateNarudzba(narudzbaId, { fotografije });
        if (window.App.Galerija && typeof window.App.Galerija.refresh === 'function') {
            window.App.Galerija.refresh();
        }
        return getById(narudzbaId);
    }

    async function handlePhotoSelect(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';   // reset za ponovni odabir iste datoteke
        if (!file) return;

        const status = document.getElementById('photo-status');
        if (status) status.textContent = 'Obrađujem fotografiju...';

        try {
            await addFoto(state.selectedId, file);
            renderDetail();
        } catch (err) {
            console.error('Greška pri dodavanju fotografije:', err);
            if (status) status.textContent = err.message || 'Greška pri dodavanju fotografije.';
        }
    }

    function openPhotoViewer(index) {
        closePhotoViewer();

        const n = getById(state.selectedId);
        if (!n || !n.fotografije || !n.fotografije[index]) return;

        const overlay = document.createElement('div');
        overlay.className = 'photo-viewer';
        overlay.id = 'photo-viewer-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', `Fotografija ${index + 1}`);

        overlay.innerHTML = `
            <button type="button" class="icon-btn photo-viewer-close" id="photo-viewer-close" aria-label="Zatvori">✕</button>
            <img class="photo-viewer-image" src="${n.fotografije[index]}" alt="Fotografija ${index + 1}">
            <div class="photo-viewer-actions">
                <button type="button" class="btn btn-danger" id="photo-viewer-delete" data-index="${index}">
                    Obriši fotografiju
                </button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        document.getElementById('photo-viewer-close').addEventListener('click', closePhotoViewer);
        document.getElementById('photo-viewer-delete').addEventListener('click', () => {
            const ok = window.confirm('Obrisati ovu fotografiju?');
            if (!ok) return;
            deletePhoto(index);
            closePhotoViewer();
            renderDetail();
        });
        // Klik na pozadinu (ne na sliku ili akcije) zatvara prikaz.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePhotoViewer();
        });
    }

    function closePhotoViewer() {
        const ov = document.getElementById('photo-viewer-overlay');
        if (ov) ov.remove();
        if (!document.querySelector('.overlay') && !document.querySelector('.photo-viewer')) {
            document.body.classList.remove('overlay-open');
        }
    }

    function deletePhoto(index) {
        if (!state.selectedId) return;
        removeFoto(state.selectedId, index);
    }

    // ----- Forma (fullscreen overlay) za novu / uređivanje -----
    function openForm(editId) {
        closeForm();

        const isEdit = !!editId;
        const n = isEdit ? (getById(editId) || {}) : {};
        const m = n.mjere || {};

        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'narudzba-form-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', isEdit ? 'Uredi narudžbu' : 'Nova narudžba');

        overlay.innerHTML = `
            <div class="overlay-header">
                <button type="button" class="icon-btn" id="overlay-close" aria-label="Zatvori">✕</button>
                <h2 class="overlay-title">${isEdit ? 'Uredi narudžbu' : 'Nova narudžba'}</h2>
            </div>
            <form class="overlay-body" id="narudzba-form" novalidate>
                <div class="form-group">
                    <label class="form-label" for="f-kupac">
                        Kupac <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <div class="inline-group">
                        <select class="form-select" id="f-kupac" name="kupac_id" required></select>
                        <button type="button" class="btn btn-secondary inline-add-btn" id="btn-add-kupac">+ Novi</button>
                    </div>
                    <div class="form-error" id="err-kupac" hidden>Odaberi kupca.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-naziv">
                        Naziv projekta <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-naziv" name="naziv" type="text"
                           required autocapitalize="sentences"
                           value="${escapeHtml(n.naziv || '')}">
                    <div class="form-error" id="err-naziv" hidden>Naziv projekta je obavezan.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-opis">Opis projekta</label>
                    <textarea class="form-textarea" id="f-opis" name="opis" rows="3">${escapeHtml(n.opis || '')}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-materijal">Materijal</label>
                    <input class="form-input" id="f-materijal" name="materijal" type="text"
                           value="${escapeHtml(n.materijal || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-boja">Boja i površina</label>
                    <input class="form-input" id="f-boja" name="boja_povrsina" type="text"
                           value="${escapeHtml(n.boja_povrsina || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-kategorija">Kategorija</label>
                    <select class="form-select" id="f-kategorija" name="kategorija">
                        ${KATEGORIJE.map(k => `<option value="${escapeHtml(k)}"${(n.kategorija || DEFAULT_KATEGORIJA) === k ? ' selected' : ''}>${escapeHtml(k)}</option>`).join('')}
                    </select>
                </div>

                <fieldset class="form-fieldset">
                    <legend class="form-legend">Mjere (cm)</legend>
                    <div class="mjere-grid">
                        <div class="form-group">
                            <label class="form-label" for="f-sirina">Širina</label>
                            <input class="form-input" id="f-sirina" name="mjere_sirina" type="number"
                                   inputmode="decimal" step="0.1"
                                   value="${escapeHtml(m.sirina || '')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-visina">Visina</label>
                            <input class="form-input" id="f-visina" name="mjere_visina" type="number"
                                   inputmode="decimal" step="0.1"
                                   value="${escapeHtml(m.visina || '')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-dubina">Dubina</label>
                            <input class="form-input" id="f-dubina" name="mjere_dubina" type="number"
                                   inputmode="decimal" step="0.1"
                                   value="${escapeHtml(m.dubina || '')}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="f-mjere-napomena">Napomena (mjere)</label>
                        <textarea class="form-textarea" id="f-mjere-napomena" name="mjere_napomena" rows="2">${escapeHtml(m.napomena_mjere || '')}</textarea>
                    </div>
                </fieldset>

                <div class="form-group">
                    <label class="form-label" for="f-isporuka">Datum isporuke</label>
                    <input class="form-input" id="f-isporuka" name="datum_isporuke" type="date"
                           value="${escapeHtml(n.datum_isporuke || '')}">
                </div>

                <div class="overlay-actions">
                    <button type="submit" class="btn btn-primary btn-block">Spremi</button>
                    <button type="button" class="btn btn-ghost btn-block" id="btn-odustani">Odustani</button>
                </div>
            </form>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        populateKupciSelect(document.getElementById('f-kupac'), n.kupac_id || '');

        setTimeout(() => {
            const f = document.getElementById('f-naziv');
            if (f) f.focus();
        }, 50);

        document.getElementById('overlay-close').addEventListener('click', closeForm);
        document.getElementById('btn-odustani').addEventListener('click', closeForm);
        document.getElementById('narudzba-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit(isEdit ? editId : null);
        });

        document.getElementById('btn-add-kupac').addEventListener('click', () => {
            openInlineKupacForm();
        });
    }

    function populateKupciSelect(select, selectedId) {
        if (!select || !window.App.Kupci) return;
        const kupci = window.App.Kupci.getAll()
            .slice()
            .sort((a, b) => (a.ime || '').localeCompare(b.ime || '', 'hr'));

        const opts = ['<option value="">-- Odaberi kupca --</option>']
            .concat(kupci.map(k =>
                `<option value="${escapeHtml(k.id)}"${k.id === selectedId ? ' selected' : ''}>${escapeHtml(k.ime || 'Bez imena')}</option>`
            ));
        select.innerHTML = opts.join('');
    }

    // Otvori kupci formu iznad ovog overlaya, te osvježi dropdown kad se kupac stvori.
    function openInlineKupacForm() {
        if (!window.App.Kupci || typeof window.App.Kupci.openForm !== 'function') return;

        // Očisti prethodni slušatelj ako postoji.
        if (pendingKupacListener) {
            document.removeEventListener('kupac:created', pendingKupacListener);
        }
        pendingKupacListener = (e) => {
            pendingKupacListener = null;
            const select = document.getElementById('f-kupac');
            if (select && e.detail && e.detail.kupac) {
                populateKupciSelect(select, e.detail.kupac.id);
            }
        };
        document.addEventListener('kupac:created', pendingKupacListener, { once: true });

        window.App.Kupci.openForm(null);
    }

    function handleSubmit(editId) {
        const form = document.getElementById('narudzba-form');
        if (!form) return;

        const data = {
            kupac_id: form.kupac_id.value,
            naziv: form.naziv.value,
            opis: form.opis.value,
            materijal: form.materijal.value,
            boja_povrsina: form.boja_povrsina.value,
            kategorija: form.kategorija ? form.kategorija.value : DEFAULT_KATEGORIJA,
            mjere: {
                sirina: form.mjere_sirina.value,
                visina: form.mjere_visina.value,
                dubina: form.mjere_dubina.value,
                napomena_mjere: form.mjere_napomena.value
            },
            datum_isporuke: form.datum_isporuke.value
        };

        let hasError = false;

        const errKupac = document.getElementById('err-kupac');
        if (!data.kupac_id) {
            if (errKupac) errKupac.hidden = false;
            hasError = true;
        } else if (errKupac) {
            errKupac.hidden = true;
        }

        const errNaziv = document.getElementById('err-naziv');
        if (!data.naziv || !data.naziv.trim()) {
            if (errNaziv) errNaziv.hidden = false;
            hasError = true;
        } else if (errNaziv) {
            errNaziv.hidden = true;
        }

        if (hasError) {
            // Fokus na prvu grešku
            if (!data.kupac_id) form.kupac_id.focus();
            else form.naziv.focus();
            return;
        }

        let saved;
        if (editId) {
            saved = updateNarudzba(editId, {
                kupac_id: data.kupac_id,
                naziv: data.naziv.trim(),
                opis: data.opis.trim(),
                materijal: data.materijal.trim(),
                boja_povrsina: data.boja_povrsina.trim(),
                kategorija: KATEGORIJE.includes(data.kategorija) ? data.kategorija : DEFAULT_KATEGORIJA,
                mjere: buildMjere(data.mjere),
                datum_isporuke: data.datum_isporuke
            });
        } else {
            saved = createNarudzba(data);
        }

        // Auto-kreiraj isporuka termin ako su uvjeti zadovoljeni
        if (saved) {
            const AKTIVNI_STATUSI = ['narudzba', 'izrada', 'montaza'];
            if (saved.datum_isporuke && AKTIVNI_STATUSI.includes(saved.status)) {
                createIsporukaTermin(saved);
            }
        }

        closeForm();

        if (editId && state.view === 'detail' && state.selectedId === editId) {
            renderDetail();
        } else if (saved) {
            showDetail(saved.id);
        } else {
            showList();
        }
    }

    function closeForm() {
        if (pendingKupacListener) {
            document.removeEventListener('kupac:created', pendingKupacListener);
            pendingKupacListener = null;
        }
        const ov = document.getElementById('narudzba-form-overlay');
        if (ov) ov.remove();
        if (!document.querySelector('.overlay') && !document.querySelector('.photo-viewer')) {
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
            if (e.detail.module === 'narudzbe') {
                // Ako smo bili u detalju, ostani u detalju samo ako narudžba još postoji.
                if (state.view === 'detail' && !getById(state.selectedId)) {
                    state.view = 'list';
                    state.selectedId = null;
                }
                render();
            } else {
                closeForm();
                closePhotoViewer();
                closeSkicaViewer();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('skica-viewer-overlay')) {
                closeSkicaViewer();
            } else if (document.getElementById('photo-viewer-overlay')) {
                closePhotoViewer();
            } else if (document.getElementById('narudzba-form-overlay')) {
                closeForm();
            }
        });

        // Ako se kupac obriše u modulu Kupci, prikaz "Nepoznat kupac" se sam riješi
        // pri sljedećem renderu - ne treba poseban listener.
    }

    // ----- Skice: format datuma, longpress, viewer, brisanje -----
    function formatSkicaDatum(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mm}.${d.getFullYear()}.`;
    }

    function attachLongpress(el, action, ms) {
        const duration = typeof ms === 'number' ? ms : 600;
        let timer = null;
        function start() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                suppressNextClick = true;
                action();
            }, duration);
        }
        function cancel() {
            if (timer) clearTimeout(timer);
            timer = null;
        }
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchmove', cancel, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('touchcancel', cancel);
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            suppressNextClick = true;
            action();
        });
    }

    function handleDeleteSkica(narudzbaId, skicaId) {
        if (!window.confirm('Sigurno obrisati ovu skicu?')) return;
        const n = getById(narudzbaId);
        if (!n) return;
        const skice = (n.aufmass_skice || []).filter(s => s.id !== skicaId);
        updateNarudzba(narudzbaId, { aufmass_skice: skice });
        renderDetail();
    }

    function openSkicaViewer(skica) {
        closeSkicaViewer();
        // Phase 4: novi format ima samo thumbnail (200px); legacy ima imageData.
        // Viewer prikazuje što god je dostupno - za detaljno pregledavanje
        // korisnik koristi gumb "Uredi".
        const src = skica.thumbnail || skica.imageData || '';
        const overlay = document.createElement('div');
        overlay.className = 'photo-viewer';
        overlay.id = 'skica-viewer-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', `Skica: ${skica.naziv || ''}`);
        overlay.innerHTML = `
            <button type="button" class="icon-btn photo-viewer-close" id="skica-viewer-close" aria-label="Zatvori">✕</button>
            ${src
                ? `<img class="photo-viewer-image" src="${src}" alt="${escapeHtml(skica.naziv || '')}">`
                : `<div class="skica-viewer-empty">Nema pregleda. Otvori s "Uredi" za detalje.</div>`}
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        document.getElementById('skica-viewer-close').addEventListener('click', closeSkicaViewer);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSkicaViewer();
        });
    }

    function closeSkicaViewer() {
        const ov = document.getElementById('skica-viewer-overlay');
        if (ov) ov.remove();
        if (!document.querySelector('.overlay') && !document.querySelector('.slide-panel') && !document.querySelector('.photo-viewer') && !document.querySelector('.gallery-viewer')) {
            document.body.classList.remove('overlay-open');
        }
    }

    // ----- Vezane ponude (bidirekcijski hook prema Ponude modulu) -----
    function getLinkedPonude(narudzbaId) {
        if (!window.App.Ponude || typeof window.App.Ponude.getByNarudzbaId !== 'function') return [];
        return window.App.Ponude.getByNarudzbaId(narudzbaId)
            .slice()
            .sort((a, b) => (b.datum_ponude || '').localeCompare(a.datum_ponude || ''));
    }

    function ponudaStatusLabel(s) {
        if (window.App.Ponude && window.App.Ponude.STATUS_LABELS) {
            return window.App.Ponude.STATUS_LABELS[s] || s || '';
        }
        return s || '';
    }

    function formatPonudaBrutto(p) {
        if (window.App.Ponude
            && typeof window.App.Ponude.getTotals === 'function'
            && typeof window.App.Ponude.formatAmount === 'function') {
            const t = window.App.Ponude.getTotals(p);
            return window.App.Ponude.formatAmount(t.brutto);
        }
        return '';
    }

    function propagateGotovoToPonude(narudzbaId) {
        if (!window.App.Ponude || typeof window.App.Ponude.getByNarudzbaId !== 'function') return;
        const linked = window.App.Ponude.getByNarudzbaId(narudzbaId);
        const otvorene = linked.filter(p => p.status !== 'prihvaceno' && p.status !== 'odbijeno');
        if (otvorene.length === 0) return;

        const ok = window.confirm(
            `Narudžba je gotova. Označi sve povezane ponude kao prihvaćene? (${otvorene.length})`
        );
        if (!ok) return;

        const sve = window.App.Storage.load('ponude', []);
        let changed = false;
        sve.forEach(p => {
            if (otvorene.some(op => op.id === p.id)) {
                p.status = 'prihvaceno';
                changed = true;
            }
        });
        if (changed) {
            window.App.Storage.save('ponude', sve);
        }
    }

    // Auto-kreiraj montaža/isporuka termin u kalendaru kad narudžba ima
    // datum_isporuke i status je aktivan. Sprječava duplikate.
    function createIsporukaTermin(narudzba) {
        if (!narudzba || !narudzba.datum_isporuke) return;
        const AKTIVNI = ['narudzba', 'izrada', 'montaza'];
        if (!AKTIVNI.includes(narudzba.status)) return;
        if (!window.App || !window.App.Storage) return;

        const termini = window.App.Storage.load('termini', []);
        const postoji = termini.some(t =>
            t.narudzba_id === narudzba.id &&
            t.tip === 'montaza' &&
            t.datum === narudzba.datum_isporuke
        );
        if (postoji) return;

        const kupac = (window.App.Kupci && typeof window.App.Kupci.getById === 'function')
            ? window.App.Kupci.getById(narudzba.kupac_id)
            : null;

        termini.push({
            id: window.App.Storage.generateId(),
            narudzba_id: narudzba.id,
            kupac_naziv: kupac ? kupac.ime : (narudzba.naziv || ''),
            tip: 'montaza',
            naziv: 'Isporuka: ' + (narudzba.naziv || ''),
            datum: narudzba.datum_isporuke,
            vrijeme_od: '',
            vrijeme_do: '',
            napomena: 'Automatski kreiran pri postavljanju datuma isporuke.',
            datum_unosa: new Date().toISOString()
        });

        window.App.Storage.save('termini', termini);

        if (window.App.Kalendar && typeof window.App.Kalendar.refresh === 'function') {
            window.App.Kalendar.refresh();
        }
    }

    // Javno: pozivaju ga drugi moduli (npr. aufmass nakon spremanja skice).
    function refreshDetail(narudzbaId) {
        if (state.view === 'detail' && state.selectedId === narudzbaId) {
            renderDetail();
        }
    }

    // Postavi detaljni prikaz (npr. iz drugog modula, prije Nav.show('narudzbe')).
    function openDetail(id) {
        if (!getById(id)) return false;
        state.view = 'detail';
        state.selectedId = id;
        if (window.App.Nav && window.App.Nav.currentModule === 'narudzbe') {
            renderDetail();
        }
        return true;
    }

    // Javni API modula
    window.App = window.App || {};
    window.App.Narudzbe = {
        init,
        getAll,
        getById,
        getByKupacId,
        openForm,
        openDetail,
        refreshDetail,
        addFoto,
        removeFoto,
        createIsporukaTermin,
        STATUSI,
        STATUS_LABELS,
        KATEGORIJE,
        DEFAULT_KATEGORIJA
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
