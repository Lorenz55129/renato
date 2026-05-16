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
                    : ''}
                <button type="button" class="btn btn-secondary btn-block" id="btn-aufmass">Otvori ploču za skiciranje</button>
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
        document.getElementById('btn-back').addEventListener('click', showList);
        document.getElementById('btn-uredi').addEventListener('click', () => openForm(n.id));
        document.getElementById('btn-obrisi').addEventListener('click', () => handleDelete(n));

        const btnStatus = document.getElementById('btn-status');
        if (btnStatus) btnStatus.addEventListener('click', () => handleAdvanceStatus(n));

        const btnAufmass = document.getElementById('btn-aufmass');
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
        const photoInput = document.getElementById('photo-input');
        if (photoInput) photoInput.addEventListener('change', handlePhotoSelect);

        // Photo thumbnails
        container.querySelectorAll('.photo-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                openPhotoViewer(idx);
            });
        });
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
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('photo-viewer-overlay')) {
                closePhotoViewer();
            } else if (document.getElementById('narudzba-form-overlay')) {
                closeForm();
            }
        });

        // Ako se kupac obriše u modulu Kupci, prikaz "Nepoznat kupac" se sam riješi
        // pri sljedećem renderu - ne treba poseban listener.
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
        addFoto,
        removeFoto,
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
