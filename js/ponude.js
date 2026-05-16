/* ============================================
   Renato Stolarija - Modul: Ponude
   Lista, detaljni (print-friendly) prikaz, forma s editorom pozicija,
   workflow statusa i PDF izvoz preko window.print().
   Pohrana u localStorage pod ključem "ponude".
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'ponude';

    const STATUSI = ['nacrt', 'poslano', 'prihvaceno', 'odbijeno'];
    const STATUS_LABELS = {
        nacrt: 'Nacrt',
        poslano: 'Poslano',
        prihvaceno: 'Prihvaćeno',
        odbijeno: 'Odbijeno'
    };

    const JEDINICE = ['kom', 'm²', 'm', 'h'];
    const PDV_OPCIJE = [0, 17];

    const DEFAULT_NAPOMENA_GORNJA = 'Poštovani, u nastavku vam dostavljamo ponudu za radove:';
    const DEFAULT_NAPOMENA_DONJA = 'Rok plaćanja: 15 dana. Ponuda vrijedi 30 dana.';

    const state = {
        view: 'list',     // 'list' | 'detail'
        selectedId: null,
        filter: 'all'     // 'all' | 'nacrt' | 'poslano' | 'prihvaceno' | 'odbijeno'
    };

    // Lokalno stanje forme dok se uređuje (live preračun, redoslijed pozicija)
    let formState = null;

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

    function pad(n) { return String(n).padStart(2, '0'); }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function plusDaysISO(n) {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function formatDate(iso) {
        if (!iso) return '';
        const parts = String(iso).split('-');
        if (parts.length !== 3) return iso;
        return `${parts[2]}.${parts[1]}.${parts[0]}.`;
    }

    function parseNum(v) {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (v === null || v === undefined || v === '') return 0;
        const cleaned = String(v).replace(',', '.').trim();
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }

    function formatEuro(n) {
        const v = (typeof n === 'number' && isFinite(n)) ? n : 0;
        return v.toLocaleString('hr-HR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' KM';
    }

    function formatBroj(v) {
        const n = parseNum(v);
        if (n === 0) return '0';
        if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
        return n.toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    }

    function kupacIme(kupacId) {
        if (!kupacId || !window.App.Kupci) return '';
        const k = window.App.Kupci.getById(kupacId);
        return k ? k.ime : '';
    }

    // ----- Pristup podacima -----
    function getAll() {
        return window.App.Storage.load(STORAGE_KEY, []);
    }

    function saveAll(list) {
        return window.App.Storage.save(STORAGE_KEY, list);
    }

    function getById(id) {
        return getAll().find(p => p.id === id) || null;
    }

    function getByKupacId(kupacId) {
        return getAll().filter(p => p.kupac_id === kupacId);
    }

    function getByNarudzbaId(narudzbaId) {
        return getAll().filter(p => p.narudzba_id === narudzbaId);
    }

    function nextBroj() {
        const year = new Date().getFullYear();
        const prefix = `PON-${year}-`;
        const existing = getAll()
            .map(p => p.broj)
            .filter(b => typeof b === 'string' && b.startsWith(prefix))
            .map(b => parseInt(b.slice(prefix.length), 10))
            .filter(n => !isNaN(n));
        const max = existing.length ? Math.max.apply(null, existing) : 0;
        return `${prefix}${String(max + 1).padStart(3, '0')}`;
    }

    function makePozicija(overrides) {
        return Object.assign({
            id: window.App.Storage.generateId(),
            naziv: '',
            kolicina: 1,
            jedinica: 'kom',
            cijena_jed: 0,
            popust_posto: 0
        }, overrides || {});
    }

    function createPonuda(data) {
        const list = getAll();
        const novi = {
            id: window.App.Storage.generateId(),
            broj: nextBroj(),
            kupac_id: data.kupac_id || null,
            narudzba_id: data.narudzba_id || null,
            datum_ponude: data.datum_ponude || todayISO(),
            datum_valjanosti: data.datum_valjanosti || plusDaysISO(30),
            status: 'nacrt',
            napomena_gornja: (data.napomena_gornja || '').trim(),
            pozicije: (data.pozicije || []).map(cleanPozicija),
            napomena_donja: (data.napomena_donja || '').trim(),
            pdv_posto: data.pdv_posto != null ? parseNum(data.pdv_posto) : 17
        };
        list.push(novi);
        saveAll(list);
        return novi;
    }

    function cleanPozicija(p) {
        return {
            id: p.id || window.App.Storage.generateId(),
            naziv: (p.naziv || '').toString().trim(),
            kolicina: parseNum(p.kolicina),
            jedinica: JEDINICE.includes(p.jedinica) ? p.jedinica : 'kom',
            cijena_jed: parseNum(p.cijena_jed),
            popust_posto: parseNum(p.popust_posto)
        };
    }

    function updatePonuda(id, patch) {
        const list = getAll();
        const i = list.findIndex(p => p.id === id);
        if (i === -1) return null;
        const next = Object.assign({}, list[i], patch);
        if (patch.pozicije) next.pozicije = patch.pozicije.map(cleanPozicija);
        list[i] = next;
        saveAll(list);
        return list[i];
    }

    function deletePonuda(id) {
        const list = getAll().filter(p => p.id !== id);
        saveAll(list);
    }

    // ----- Preračuni -----
    function calcPozicija(p) {
        const k = parseNum(p.kolicina);
        const c = parseNum(p.cijena_jed);
        const r = parseNum(p.popust_posto);
        return k * c * (1 - r / 100);
    }

    function calcTotals(pozicije, pdv_posto) {
        const netto = (pozicije || []).reduce((s, p) => s + calcPozicija(p), 0);
        const pdv = netto * (parseNum(pdv_posto) / 100);
        const brutto = netto + pdv;
        return { netto, pdv, brutto };
    }

    // ----- Render: lista -----
    function render() {
        if (state.view === 'detail') {
            renderDetail();
        } else {
            renderList();
        }
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

    function renderList() {
        const container = document.getElementById('ponude-content');
        if (!container) return;

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back-vise">‹ Više</button>

            <div class="ponude-toolbar">
                <div class="filter-tabs filter-tabs-scroll" role="tablist" aria-label="Filter ponuda">
                    ${renderFilterTab('all', 'Sve')}
                    ${STATUSI.map(s => renderFilterTab(s, STATUS_LABELS[s])).join('')}
                </div>
                <button type="button" class="btn btn-primary btn-block" id="btn-nova-ponuda">+ Nova ponuda</button>
            </div>
            <div id="ponude-list-container"></div>
        `;

        container.querySelector('#btn-back-vise').addEventListener('click', () => {
            window.App.Nav.show('vise');
        });

        container.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.filter = tab.getAttribute('data-filter');
                renderList();
            });
        });

        container.querySelector('#btn-nova-ponuda').addEventListener('click', () => openForm(null));

        renderListContainer();
    }

    function renderFilterTab(value, label) {
        const active = state.filter === value ? 'active' : '';
        return `<button type="button" class="filter-tab ${active}" data-filter="${escapeHtml(value)}" role="tab">${escapeHtml(label)}</button>`;
    }

    function renderListContainer() {
        const cont = document.getElementById('ponude-list-container');
        if (!cont) return;

        const all = getAll();
        const filtered = state.filter === 'all'
            ? all.slice()
            : all.filter(p => p.status === state.filter);

        // Sortiraj: najnovije prvo po datumu_ponude (silazno), pa broju (silazno)
        filtered.sort((a, b) => {
            const ad = a.datum_ponude || '';
            const bd = b.datum_ponude || '';
            if (ad !== bd) return bd.localeCompare(ad);
            return (b.broj || '').localeCompare(a.broj || '');
        });

        if (all.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nemate spremljenih ponuda.</p>
                    <p class="placeholder-hint">Dodajte prvu ponudu klikom na "+ Nova ponuda".</p>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            cont.innerHTML = `<div class="empty-state"><p>Nema ponuda u ovom filteru.</p></div>`;
            return;
        }

        cont.innerHTML = `
            <ul class="ponuda-list">
                ${filtered.map(p => {
                    const t = calcTotals(p.pozicije || [], p.pdv_posto);
                    return `
                        <li class="ponuda-card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
                            <div class="ponuda-card-main">
                                <div class="ponuda-card-broj">${escapeHtml(p.broj || '?')}</div>
                                <div class="ponuda-card-kupac">${escapeHtml(kupacIme(p.kupac_id) || 'Bez kupca')}</div>
                                <div class="ponuda-card-meta">
                                    <span class="status-badge status-${escapeHtml(p.status)}">${escapeHtml(STATUS_LABELS[p.status] || p.status)}</span>
                                    <span class="ponuda-card-date">${escapeHtml(formatDate(p.datum_ponude))}</span>
                                </div>
                            </div>
                            <div class="ponuda-card-amount">${escapeHtml(formatEuro(t.brutto))}</div>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;

        cont.querySelectorAll('.ponuda-card').forEach(card => {
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

    // ----- Render: detalji (print-friendly dokument) -----
    function renderDetail() {
        const container = document.getElementById('ponude-content');
        if (!container) return;

        const p = getById(state.selectedId);
        if (!p) {
            showList();
            return;
        }

        const kupac = p.kupac_id && window.App.Kupci ? window.App.Kupci.getById(p.kupac_id) : null;
        const narudzba = p.narudzba_id && window.App.Narudzbe ? window.App.Narudzbe.getById(p.narudzba_id) : null;
        const t = calcTotals(p.pozicije || [], p.pdv_posto);

        const drugiStatusi = STATUSI.filter(s => s !== p.status);

        container.innerHTML = `
            <div class="ponude-detail-bar no-print">
                <button type="button" class="btn btn-ghost btn-back" id="btn-back-list">‹ Nazad</button>
                <span class="status-badge status-${escapeHtml(p.status)}">${escapeHtml(STATUS_LABELS[p.status] || p.status)}</span>
            </div>

            <div class="ponuda-status-actions no-print">
                ${drugiStatusi.map(s => `
                    <button type="button" class="btn btn-ghost ponuda-status-btn" data-status="${escapeHtml(s)}">
                        Označi kao: ${escapeHtml(STATUS_LABELS[s])}
                    </button>
                `).join('')}
            </div>

            <article class="ponuda-document" id="ponuda-document">
                <header class="ponuda-doc-header">
                    <div>
                        <h1 class="ponuda-doc-title">PONUDA</h1>
                        <div class="ponuda-doc-broj">br. ${escapeHtml(p.broj || '?')}</div>
                    </div>
                    <div class="ponuda-doc-dates">
                        <div><span class="ponuda-doc-label">Datum:</span> ${escapeHtml(formatDate(p.datum_ponude))}</div>
                        <div><span class="ponuda-doc-label">Vrijedi do:</span> ${escapeHtml(formatDate(p.datum_valjanosti))}</div>
                    </div>
                </header>

                <section class="ponuda-doc-kupac">
                    <div class="ponuda-doc-label">Kupac:</div>
                    ${kupac ? `
                        <div class="ponuda-doc-kupac-name">${escapeHtml(kupac.ime || '')}</div>
                        ${kupac.adresa ? `<div>${escapeHtml(kupac.adresa)}</div>` : ''}
                        ${kupac.telefon ? `<div>Tel: ${escapeHtml(kupac.telefon)}</div>` : ''}
                        ${kupac.email ? `<div>${escapeHtml(kupac.email)}</div>` : ''}
                    ` : `<div>—</div>`}
                    ${narudzba ? `<div class="ponuda-doc-narudzba">Narudžba: ${escapeHtml(narudzba.naziv)}</div>` : ''}
                </section>

                ${p.napomena_gornja ? `<section class="ponuda-doc-napomena">${escapeHtml(p.napomena_gornja)}</section>` : ''}

                <table class="ponuda-table">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-opis">Opis</th>
                            <th class="col-kol">Količina</th>
                            <th class="col-jed">Jed.</th>
                            <th class="col-cijena">Cijena</th>
                            <th class="col-popust">Popust</th>
                            <th class="col-ukupno">Ukupno</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(p.pozicije || []).map((poz, i) => `
                            <tr>
                                <td class="col-num">${i + 1}.</td>
                                <td class="col-opis">${escapeHtml(poz.naziv || '')}</td>
                                <td class="col-kol">${escapeHtml(formatBroj(poz.kolicina))}</td>
                                <td class="col-jed">${escapeHtml(poz.jedinica || '')}</td>
                                <td class="col-cijena">${escapeHtml(formatEuro(parseNum(poz.cijena_jed)))}</td>
                                <td class="col-popust">${parseNum(poz.popust_posto) > 0 ? `${escapeHtml(formatBroj(poz.popust_posto))}%` : '—'}</td>
                                <td class="col-ukupno">${escapeHtml(formatEuro(calcPozicija(poz)))}</td>
                            </tr>
                        `).join('') || `<tr><td colspan="7" class="ponuda-table-empty">Nema pozicija.</td></tr>`}
                    </tbody>
                </table>

                <section class="ponuda-doc-totals">
                    <div class="ponuda-doc-total-line">
                        <span>Netto:</span>
                        <span>${escapeHtml(formatEuro(t.netto))}</span>
                    </div>
                    <div class="ponuda-doc-total-line">
                        <span>PDV (${escapeHtml(formatBroj(p.pdv_posto))}%):</span>
                        <span>${escapeHtml(formatEuro(t.pdv))}</span>
                    </div>
                    <div class="ponuda-doc-total-line ponuda-doc-total-brutto">
                        <span>Ukupno:</span>
                        <span>${escapeHtml(formatEuro(t.brutto))}</span>
                    </div>
                </section>

                ${p.napomena_donja ? `<section class="ponuda-doc-napomena ponuda-doc-napomena-donja">${escapeHtml(p.napomena_donja)}</section>` : ''}
            </article>

            <div class="ponuda-actions no-print">
                <button type="button" class="btn btn-secondary btn-block" id="btn-pdf">Preuzmi PDF</button>
                <button type="button" class="btn btn-primary btn-block" id="btn-uredi">Uredi</button>
                <button type="button" class="btn btn-danger btn-block" id="btn-obrisi">Obriši</button>
            </div>
        `;

        document.getElementById('btn-back-list').addEventListener('click', showList);
        document.getElementById('btn-uredi').addEventListener('click', () => openForm(p.id));
        document.getElementById('btn-obrisi').addEventListener('click', () => handleDelete(p));
        document.getElementById('btn-pdf').addEventListener('click', printPonuda);

        container.querySelectorAll('.ponuda-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const novi = btn.getAttribute('data-status');
                handleStatusChange(p, novi);
            });
        });
    }

    function handleStatusChange(ponuda, novi) {
        if (!STATUSI.includes(novi)) return;
        const ok = window.confirm(
            `Promijeniti status iz "${STATUS_LABELS[ponuda.status]}" u "${STATUS_LABELS[novi]}"?`
        );
        if (!ok) return;
        updatePonuda(ponuda.id, { status: novi });

        // Bidirekcijska sinkronizacija: prihvaceno → osvježi narudžbu (status + datum_isporuke)
        if (novi === 'prihvaceno' && ponuda.narudzba_id) {
            propagateAcceptanceToNarudzba(ponuda);
        }

        renderDetail();
    }

    function propagateAcceptanceToNarudzba(ponuda) {
        if (!window.App.Narudzbe || typeof window.App.Narudzbe.getById !== 'function') return;
        const narudzba = window.App.Narudzbe.getById(ponuda.narudzba_id);
        if (!narudzba) return;

        // Što bi se točno promijenilo?
        const patch = {};
        if (narudzba.status === 'upit' || narudzba.status === 'ponuda') {
            patch.status = 'narudzba';
        }
        if (ponuda.datum_valjanosti && !narudzba.datum_isporuke) {
            patch.datum_isporuke = ponuda.datum_valjanosti;
        }
        if (Object.keys(patch).length === 0) return;

        const ok = window.confirm(
            "Ponuda prihvaćena. Želiš li automatski ažurirati status narudžbe na 'Narudžba'?"
        );
        if (!ok) return;

        const sve = window.App.Storage.load('narudzbe', []);
        const idx = sve.findIndex(n => n.id === ponuda.narudzba_id);
        if (idx === -1) return;
        sve[idx] = Object.assign({}, sve[idx], patch);
        window.App.Storage.save('narudzbe', sve);

        if (typeof window.App.Narudzbe.refreshDetail === 'function') {
            window.App.Narudzbe.refreshDetail(ponuda.narudzba_id);
        }
    }

    function handleDelete(ponuda) {
        const ok = window.confirm(`Sigurno obrisati ponudu ${ponuda.broj}? Ova radnja se ne može poništiti.`);
        if (!ok) return;
        deletePonuda(ponuda.id);
        showList();
    }

    function printPonuda() {
        document.body.classList.add('printing-ponuda');
        // Pričekaj sljedeći frame da CSS print stilovi mogu biti pripremljeni.
        setTimeout(() => {
            window.print();
            // Ukloni klasu nakon dijaloga.
            setTimeout(() => document.body.classList.remove('printing-ponuda'), 200);
        }, 50);
    }

    // ----- Forma (fullscreen overlay) -----
    function openForm(editId, defaults) {
        closeForm();
        defaults = defaults || {};

        const isEdit = !!editId;
        const p = isEdit ? (getById(editId) || {}) : {};

        formState = {
            kupac_id: p.kupac_id || defaults.kupac_id || '',
            narudzba_id: p.narudzba_id || defaults.narudzba_id || '',
            datum_ponude: p.datum_ponude || todayISO(),
            datum_valjanosti: p.datum_valjanosti || plusDaysISO(30),
            napomena_gornja: p.napomena_gornja || (isEdit ? '' : DEFAULT_NAPOMENA_GORNJA),
            napomena_donja: p.napomena_donja || (isEdit ? '' : DEFAULT_NAPOMENA_DONJA),
            pdv_posto: p.pdv_posto != null ? p.pdv_posto : 17,
            pozicije: (p.pozicije || []).map(x => makePozicija(x)),
            expandedPozicijaId: null,
            previewBroj: isEdit ? (p.broj || '') : nextBroj()
        };

        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'ponuda-form-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', isEdit ? 'Uredi ponudu' : 'Nova ponuda');

        overlay.innerHTML = `
            <div class="overlay-header">
                <button type="button" class="icon-btn" id="overlay-close" aria-label="Zatvori">✕</button>
                <h2 class="overlay-title">${isEdit ? 'Uredi ponudu' : 'Nova ponuda'}</h2>
            </div>
            <form class="overlay-body" id="ponuda-form" novalidate>
                <div class="form-group">
                    <label class="form-label">Broj ponude</label>
                    <div class="form-readonly">${escapeHtml(formState.previewBroj)}</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-kupac">
                        Kupac <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <select class="form-select" id="f-kupac" name="kupac_id" required></select>
                    <div class="form-error" id="err-kupac" hidden>Odaberi kupca.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-narudzba">Narudžba (opcionalno)</label>
                    <select class="form-select" id="f-narudzba" name="narudzba_id"></select>
                </div>

                <div class="time-row">
                    <div class="form-group">
                        <label class="form-label" for="f-datum-ponude">Datum ponude</label>
                        <input class="form-input" id="f-datum-ponude" name="datum_ponude" type="date"
                               value="${escapeHtml(formState.datum_ponude)}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="f-datum-valjanosti">Vrijedi do</label>
                        <input class="form-input" id="f-datum-valjanosti" name="datum_valjanosti" type="date"
                               value="${escapeHtml(formState.datum_valjanosti)}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-napomena-gornja">Uvodna napomena</label>
                    <textarea class="form-textarea" id="f-napomena-gornja" name="napomena_gornja" rows="2">${escapeHtml(formState.napomena_gornja)}</textarea>
                </div>

                <section class="poz-section">
                    <div class="poz-section-header">
                        <h3 class="poz-section-title">Pozicije</h3>
                    </div>
                    <div id="poz-list" class="poz-list"></div>
                    <button type="button" class="btn btn-ghost btn-block add-poz-btn" id="btn-add-poz">+ Dodaj poziciju</button>
                </section>

                <div class="form-group">
                    <label class="form-label" for="f-pdv">PDV</label>
                    <select class="form-select" id="f-pdv" name="pdv_posto">
                        ${PDV_OPCIJE.map(v => `<option value="${v}"${v === formState.pdv_posto ? ' selected' : ''}>${v}%</option>`).join('')}
                    </select>
                </div>

                <section class="totals-block">
                    <div class="totals-row">
                        <span>Netto:</span>
                        <span id="totals-netto">0,00 KM</span>
                    </div>
                    <div class="totals-row">
                        <span id="totals-pdv-label">PDV (${escapeHtml(formState.pdv_posto)}%):</span>
                        <span id="totals-pdv">0,00 KM</span>
                    </div>
                    <div class="totals-row totals-brutto">
                        <span>Ukupno:</span>
                        <span id="totals-brutto">0,00 KM</span>
                    </div>
                </section>

                <div class="form-group">
                    <label class="form-label" for="f-napomena-donja">Završna napomena</label>
                    <textarea class="form-textarea" id="f-napomena-donja" name="napomena_donja" rows="2">${escapeHtml(formState.napomena_donja)}</textarea>
                </div>

                <div class="overlay-actions">
                    <button type="submit" class="btn btn-primary btn-block">Spremi</button>
                    <button type="button" class="btn btn-ghost btn-block" id="btn-odustani">Odustani</button>
                </div>
            </form>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        populateKupciSelect(document.getElementById('f-kupac'), formState.kupac_id);
        populateNarudzbaSelect(document.getElementById('f-narudzba'), formState.kupac_id, formState.narudzba_id);
        renderPozicijeList();
        updateGrandTotalsDisplay();

        bindFormEvents(isEdit, editId);

        setTimeout(() => {
            const sel = document.getElementById('f-kupac');
            if (sel && !formState.kupac_id) sel.focus();
        }, 50);
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

    function populateNarudzbaSelect(select, kupacId, selectedId) {
        if (!select) return;
        if (!window.App.Narudzbe || !kupacId) {
            select.innerHTML = '<option value="">-- Bez narudžbe --</option>';
            return;
        }
        const narudzbe = window.App.Narudzbe.getByKupacId(kupacId)
            .slice()
            .sort((a, b) => (a.naziv || '').localeCompare(b.naziv || '', 'hr'));
        const opts = ['<option value="">-- Bez narudžbe --</option>']
            .concat(narudzbe.map(n =>
                `<option value="${escapeHtml(n.id)}"${n.id === selectedId ? ' selected' : ''}>${escapeHtml(n.naziv || 'Bez naziva')}</option>`
            ));
        select.innerHTML = opts.join('');
    }

    function bindFormEvents(isEdit, editId) {
        document.getElementById('overlay-close').addEventListener('click', closeForm);
        document.getElementById('btn-odustani').addEventListener('click', closeForm);
        document.getElementById('ponuda-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit(isEdit ? editId : null);
        });

        document.getElementById('f-kupac').addEventListener('change', (e) => {
            formState.kupac_id = e.target.value;
            // Resetiraj narudžbu pri promjeni kupca
            formState.narudzba_id = '';
            populateNarudzbaSelect(document.getElementById('f-narudzba'), formState.kupac_id, '');
            const err = document.getElementById('err-kupac');
            if (err) err.hidden = true;
        });

        document.getElementById('f-narudzba').addEventListener('change', (e) => {
            formState.narudzba_id = e.target.value;
        });

        document.getElementById('f-datum-ponude').addEventListener('change', (e) => {
            formState.datum_ponude = e.target.value;
        });
        document.getElementById('f-datum-valjanosti').addEventListener('change', (e) => {
            formState.datum_valjanosti = e.target.value;
        });
        document.getElementById('f-napomena-gornja').addEventListener('input', (e) => {
            formState.napomena_gornja = e.target.value;
        });
        document.getElementById('f-napomena-donja').addEventListener('input', (e) => {
            formState.napomena_donja = e.target.value;
        });

        document.getElementById('f-pdv').addEventListener('change', (e) => {
            formState.pdv_posto = parseNum(e.target.value);
            updateGrandTotalsDisplay();
        });

        document.getElementById('btn-add-poz').addEventListener('click', () => {
            const novi = makePozicija();
            formState.pozicije.push(novi);
            formState.expandedPozicijaId = novi.id;
            renderPozicijeList();
            updateGrandTotalsDisplay();
            // Fokus na novi naziv
            setTimeout(() => {
                const row = document.querySelector(`.poz-row[data-id="${cssEscape(novi.id)}"]`);
                const inp = row && row.querySelector('[data-field="naziv"]');
                if (inp) inp.focus();
            }, 30);
        });

        const list = document.getElementById('poz-list');
        list.addEventListener('click', handlePozListClick);
        list.addEventListener('input', handlePozListInput);
        list.addEventListener('change', handlePozListInput);
    }

    function cssEscape(s) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
        return String(s).replace(/(["\\\[\]:.])/g, '\\$1');
    }

    function handlePozListClick(e) {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        const row = e.target.closest('.poz-row');
        if (!row) return;
        const id = row.getAttribute('data-id');

        if (action === 'toggle') {
            togglePozExpand(id);
        } else if (action === 'up') {
            movePoz(id, -1);
        } else if (action === 'down') {
            movePoz(id, 1);
        } else if (action === 'delete') {
            if (window.confirm('Obrisati ovu poziciju?')) deletePoz(id);
        }
    }

    function handlePozListInput(e) {
        const fieldEl = e.target.closest('[data-field]');
        if (!fieldEl) return;
        const field = fieldEl.getAttribute('data-field');
        const row = e.target.closest('.poz-row');
        if (!row) return;
        const id = row.getAttribute('data-id');
        const p = formState.pozicije.find(x => x.id === id);
        if (!p) return;

        if (field === 'naziv' || field === 'jedinica') {
            p[field] = fieldEl.value;
        } else {
            p[field] = parseNum(fieldEl.value);
        }

        // Live update za sažetak (naziv) i ukupno te grand totals
        if (field === 'naziv') {
            const nameEl = row.querySelector('.poz-summary-name');
            if (nameEl) nameEl.textContent = (p.naziv || '(bez naziva)');
        }
        const ukEl = document.getElementById(`poz-ukupno-${id}`);
        if (ukEl) ukEl.textContent = formatEuro(calcPozicija(p));

        updateGrandTotalsDisplay();
    }

    function togglePozExpand(id) {
        formState.expandedPozicijaId = formState.expandedPozicijaId === id ? null : id;
        renderPozicijeList();
    }

    function movePoz(id, dir) {
        const i = formState.pozicije.findIndex(p => p.id === id);
        if (i === -1) return;
        const j = i + dir;
        if (j < 0 || j >= formState.pozicije.length) return;
        const tmp = formState.pozicije[i];
        formState.pozicije[i] = formState.pozicije[j];
        formState.pozicije[j] = tmp;
        renderPozicijeList();
    }

    function deletePoz(id) {
        formState.pozicije = formState.pozicije.filter(p => p.id !== id);
        if (formState.expandedPozicijaId === id) formState.expandedPozicijaId = null;
        renderPozicijeList();
        updateGrandTotalsDisplay();
    }

    function renderPozicijeList() {
        const list = document.getElementById('poz-list');
        if (!list) return;

        if (formState.pozicije.length === 0) {
            list.innerHTML = `<div class="poz-empty">Nema pozicija. Dodaj prvu klikom ispod.</div>`;
            return;
        }

        const total = formState.pozicije.length;
        list.innerHTML = formState.pozicije.map((p, i) => renderPozicija(p, i, total)).join('');
    }

    function renderPozicija(p, index, total) {
        const expanded = formState.expandedPozicijaId === p.id;
        const ukupno = calcPozicija(p);
        return `
            <div class="poz-row ${expanded ? 'poz-row-expanded' : ''}" data-id="${escapeHtml(p.id)}">
                <button type="button" class="poz-summary" data-action="toggle">
                    <span class="poz-summary-num">${index + 1}.</span>
                    <span class="poz-summary-name">${escapeHtml(p.naziv || '(bez naziva)')}</span>
                    <span class="poz-summary-total" id="poz-ukupno-${escapeHtml(p.id)}">${escapeHtml(formatEuro(ukupno))}</span>
                </button>
                ${expanded ? `
                    <div class="poz-editor">
                        <div class="form-group">
                            <label class="form-label">Opis pozicije</label>
                            <input class="form-input" data-field="naziv" type="text"
                                   value="${escapeHtml(p.naziv || '')}" autocapitalize="sentences">
                        </div>
                        <div class="poz-grid-2">
                            <div class="form-group">
                                <label class="form-label">Količina</label>
                                <input class="form-input" data-field="kolicina" type="number"
                                       inputmode="decimal" step="0.01" min="0"
                                       value="${escapeHtml(p.kolicina)}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Jedinica</label>
                                <select class="form-select" data-field="jedinica">
                                    ${JEDINICE.map(j => `<option value="${escapeHtml(j)}"${j === p.jedinica ? ' selected' : ''}>${escapeHtml(j)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="poz-grid-2">
                            <div class="form-group">
                                <label class="form-label">Cijena (KM)</label>
                                <input class="form-input" data-field="cijena_jed" type="number"
                                       inputmode="decimal" step="0.01" min="0"
                                       value="${escapeHtml(p.cijena_jed)}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Popust (%)</label>
                                <input class="form-input" data-field="popust_posto" type="number"
                                       inputmode="decimal" step="1" min="0" max="100"
                                       value="${escapeHtml(p.popust_posto)}">
                            </div>
                        </div>
                        <div class="poz-actions">
                            <button type="button" class="btn btn-ghost poz-move" data-action="up"
                                    aria-label="Premjesti gore" ${index === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="btn btn-ghost poz-move" data-action="down"
                                    aria-label="Premjesti dolje" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="btn btn-danger poz-delete" data-action="delete">
                                Obriši
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function updateGrandTotalsDisplay() {
        if (!formState) return;
        const t = calcTotals(formState.pozicije, formState.pdv_posto);
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('totals-netto', formatEuro(t.netto));
        set('totals-pdv', formatEuro(t.pdv));
        set('totals-brutto', formatEuro(t.brutto));
        const lab = document.getElementById('totals-pdv-label');
        if (lab) lab.textContent = `PDV (${formatBroj(formState.pdv_posto)}%):`;
    }

    function handleSubmit(editId) {
        if (!formState) return;

        // Validacija: kupac obavezan
        if (!formState.kupac_id) {
            const err = document.getElementById('err-kupac');
            if (err) err.hidden = false;
            const sel = document.getElementById('f-kupac');
            if (sel) sel.focus();
            return;
        }

        // Očisti potpuno prazne pozicije (bez naziva, kolicine, cijene)
        const cleanPozicije = formState.pozicije.filter(p =>
            (p.naziv && p.naziv.trim()) ||
            parseNum(p.kolicina) ||
            parseNum(p.cijena_jed)
        );

        const data = {
            kupac_id: formState.kupac_id,
            narudzba_id: formState.narudzba_id || null,
            datum_ponude: formState.datum_ponude || todayISO(),
            datum_valjanosti: formState.datum_valjanosti || plusDaysISO(30),
            napomena_gornja: formState.napomena_gornja,
            napomena_donja: formState.napomena_donja,
            pdv_posto: parseNum(formState.pdv_posto),
            pozicije: cleanPozicije
        };

        let saved;
        if (editId) {
            saved = updatePonuda(editId, data);
        } else {
            saved = createPonuda(data);
        }

        closeForm();

        // Cross-module sync: ako je ponuda vezana za narudžbu, osvježi njen detalj.
        if (saved && saved.narudzba_id && window.App.Narudzbe && typeof window.App.Narudzbe.refreshDetail === 'function') {
            window.App.Narudzbe.refreshDetail(saved.narudzba_id);
        }

        if (saved) {
            showDetail(saved.id);
        } else {
            showList();
        }
    }

    function closeForm() {
        const ov = document.getElementById('ponuda-form-overlay');
        if (ov) ov.remove();
        formState = null;
        if (!document.querySelector('.overlay') && !document.querySelector('.slide-panel') && !document.querySelector('.photo-viewer')) {
            document.body.classList.remove('overlay-open');
        }
    }

    // ----- Inicijalizacija -----
    function init() {
        render();

        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'ponude') {
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
            if (document.getElementById('ponuda-form-overlay')) {
                closeForm();
            }
        });

        // Klik na Ponude u "Više" izborniku
        document.querySelectorAll('.menu-item[data-target="ponude"]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.Nav.show('ponude');
            });
        });
    }

    // Postavi detaljni prikaz iz drugog modula (npr. iz Narudžbe ili Kalendara).
    function openDetail(id) {
        if (!getById(id)) return false;
        state.view = 'detail';
        state.selectedId = id;
        if (window.App.Nav && window.App.Nav.currentModule === 'ponude') {
            renderDetail();
        }
        return true;
    }

    // Pomoćnici za druge module (Narudžbe prikazuje broj/Brutto vezanih ponuda).
    function getTotals(p) {
        if (!p) return { netto: 0, pdv: 0, brutto: 0 };
        return calcTotals(p.pozicije || [], p.pdv_posto);
    }

    function formatAmount(n) {
        return formatEuro(n);
    }

    // Javni API modula
    window.App = window.App || {};
    window.App.Ponude = {
        init,
        getAll,
        getById,
        getByKupacId,
        getByNarudzbaId,
        openDetail,
        openForm,
        getTotals,
        formatAmount,
        STATUSI,
        STATUS_LABELS
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
