/* ============================================
   Renato Stolarija - Modul: Kalendar
   Tjedna i mjesečna ansicht termina, povezivanje s narudžbama.
   Pohrana u localStorage pod ključem "termini".
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'termini';

    const TIPOVI = ['aufmass', 'izrada', 'montaza'];
    const TIP_LABELS = {
        aufmass: 'Snimanje mjera',
        izrada: 'Izrada',
        montaza: 'Montaža'
    };
    const TIP_COLORS = {
        aufmass: '#8B5E3C',
        izrada: '#5C3D1E',
        montaza: '#C9A84C'
    };

    const DANI_KRATKO = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];
    const DANI_PUNO = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'];
    const MJESECI = [
        'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
        'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
    ];

    const state = {
        viewMode: 'tjedna',     // 'tjedna' | 'mjesecna'
        anchorDate: '',         // ISO date - sidro za tjedan/mjesec
        panel: null             // null | { type: 'day', datum } | { type: 'termin', terminId }
    };

    // ----- Datumske pomoćne funkcije -----
    function pad(n) { return String(n).padStart(2, '0'); }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function parseISO(iso) {
        if (!iso) return null;
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function isoFromDate(d) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function addDays(iso, n) {
        const d = parseISO(iso);
        d.setDate(d.getDate() + n);
        return isoFromDate(d);
    }

    function addMonths(iso, n) {
        const d = parseISO(iso);
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + n);
        // Drži dan unutar granica novog mjeseca
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, last));
        return isoFromDate(d);
    }

    function startOfWeek(iso) {
        const d = parseISO(iso);
        const dow = d.getDay(); // 0=Ned, 1=Pon, ..., 6=Sub
        const diff = dow === 0 ? -6 : 1 - dow;
        d.setDate(d.getDate() + diff);
        return isoFromDate(d);
    }

    function startOfMonth(iso) {
        const d = parseISO(iso);
        d.setDate(1);
        return isoFromDate(d);
    }

    function formatDateLong(iso) {
        if (!iso) return '';
        const d = parseISO(iso);
        if (!d) return iso;
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
    }

    function formatDateShort(iso) {
        if (!iso) return '';
        const d = parseISO(iso);
        if (!d) return iso;
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
    }

    function dayOfWeekMonFirst(iso) {
        // 0 = Ponedjeljak, ..., 6 = Nedjelja
        const d = parseISO(iso);
        const dow = d.getDay();
        return dow === 0 ? 6 : dow - 1;
    }

    function isToday(iso) {
        return iso === todayISO();
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ----- Pristup podacima -----
    function getAll() {
        return window.App.Storage.load(STORAGE_KEY, []);
    }

    function saveAll(list) {
        return window.App.Storage.save(STORAGE_KEY, list);
    }

    function getById(id) {
        return getAll().find(t => t.id === id) || null;
    }

    function getByDatum(datum) {
        return getAll()
            .filter(t => t.datum === datum)
            .sort(sortByTime);
    }

    function sortByTime(a, b) {
        const at = a.vrijeme_od || '00:00';
        const bt = b.vrijeme_od || '00:00';
        return at.localeCompare(bt);
    }

    function createTermin(data) {
        const list = getAll();
        const novi = {
            id: window.App.Storage.generateId(),
            narudzba_id: data.narudzba_id || null,
            kupac_naziv: (data.kupac_naziv || '').trim(),
            tip: data.tip,
            naziv: (data.naziv || '').trim(),
            datum: data.datum,
            vrijeme_od: data.vrijeme_od || '',
            vrijeme_do: data.vrijeme_do || '',
            napomena: (data.napomena || '').trim(),
            datum_unosa: todayISO()
        };
        list.push(novi);
        saveAll(list);
        return novi;
    }

    function updateTermin(id, patch) {
        const list = getAll();
        const i = list.findIndex(t => t.id === id);
        if (i === -1) return null;
        list[i] = { ...list[i], ...patch };
        saveAll(list);
        return list[i];
    }

    function deleteTermin(id) {
        const list = getAll().filter(t => t.id !== id);
        saveAll(list);
    }

    // ----- Glavni render -----
    function render() {
        const container = document.getElementById('kalendar-content');
        if (!container) return;
        if (!state.anchorDate) state.anchorDate = todayISO();

        container.innerHTML = `
            <div class="kalendar-toolbar">
                <div class="view-toggle" role="tablist" aria-label="Vrsta prikaza">
                    <button type="button" class="view-toggle-btn ${state.viewMode === 'tjedna' ? 'active' : ''}"
                            data-mode="tjedna" role="tab">Tjedna</button>
                    <button type="button" class="view-toggle-btn ${state.viewMode === 'mjesecna' ? 'active' : ''}"
                            data-mode="mjesecna" role="tab">Mjesečna</button>
                </div>
                <button type="button" class="btn btn-primary btn-block" id="btn-novi-termin">+ Novi termin</button>
            </div>

            <div class="kalendar-nav">
                <button type="button" class="kalendar-nav-arrow" id="nav-prev" aria-label="Prethodno">‹</button>
                <button type="button" class="kalendar-nav-title" id="nav-today" aria-label="Skoči na danas">
                    ${renderNavTitle()}
                </button>
                <button type="button" class="kalendar-nav-arrow" id="nav-next" aria-label="Sljedeće">›</button>
            </div>

            <div id="kalendar-view"></div>
        `;

        // Toolbar events
        container.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.viewMode = btn.getAttribute('data-mode');
                render();
            });
        });

        document.getElementById('btn-novi-termin').addEventListener('click', () => {
            openForm(null, { datum: todayISO() });
        });

        document.getElementById('nav-prev').addEventListener('click', () => navigate(-1));
        document.getElementById('nav-next').addEventListener('click', () => navigate(1));
        document.getElementById('nav-today').addEventListener('click', () => {
            state.anchorDate = todayISO();
            render();
        });

        if (state.viewMode === 'tjedna') {
            renderTjedna();
        } else {
            renderMjesecna();
        }

        // Ponovno prikaži panel ako je otvoren (npr. nakon ponovnog rendera)
        renderPanel();
    }

    function renderNavTitle() {
        if (state.viewMode === 'tjedna') {
            const start = startOfWeek(state.anchorDate);
            const end = addDays(start, 6);
            return `${escapeHtml(formatDateShort(start))} – ${escapeHtml(formatDateShort(end))} ${escapeHtml(String(parseISO(end).getFullYear()))}.`;
        } else {
            const d = parseISO(state.anchorDate);
            return `${escapeHtml(MJESECI[d.getMonth()])} ${d.getFullYear()}.`;
        }
    }

    function navigate(direction) {
        if (state.viewMode === 'tjedna') {
            state.anchorDate = addDays(state.anchorDate, direction * 7);
        } else {
            state.anchorDate = addMonths(state.anchorDate, direction);
        }
        render();
    }

    // ----- Tjedna ansicht -----
    function renderTjedna() {
        const view = document.getElementById('kalendar-view');
        if (!view) return;

        const start = startOfWeek(state.anchorDate);
        const dani = [];
        for (let i = 0; i < 7; i++) {
            const iso = addDays(start, i);
            dani.push({
                iso,
                naziv: DANI_KRATKO[i],
                dan: parseISO(iso).getDate(),
                mjesec: parseISO(iso).getMonth() + 1,
                today: isToday(iso),
                termini: getByDatum(iso)
            });
        }

        view.innerHTML = `
            <div class="week-view">
                ${dani.map(d => `
                    <div class="day-row ${d.today ? 'day-row-today' : ''}" data-datum="${escapeHtml(d.iso)}">
                        <div class="day-header">
                            <div class="day-name">${escapeHtml(d.naziv)}</div>
                            <div class="day-date">${pad(d.dan)}.${pad(d.mjesec)}.</div>
                        </div>
                        <div class="day-content">
                            ${d.termini.length === 0
                                ? `<button type="button" class="day-add-btn" data-datum="${escapeHtml(d.iso)}" aria-label="Dodaj termin za ${escapeHtml(d.iso)}">+</button>`
                                : d.termini.map(t => renderTerminBlock(t)).join('')
                            }
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        view.querySelectorAll('.termin-block').forEach(el => {
            const id = el.getAttribute('data-id');
            el.addEventListener('click', () => openTerminPanel(id));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTerminPanel(id);
                }
            });
        });

        view.querySelectorAll('.day-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const datum = btn.getAttribute('data-datum');
                openForm(null, { datum });
            });
        });
    }

    function renderTerminBlock(t) {
        const tipClass = TIPOVI.includes(t.tip) ? `tip-${t.tip}` : '';
        const color = TIP_COLORS[t.tip] || '#888';
        const time = formatTimeRange(t.vrijeme_od, t.vrijeme_do);
        return `
            <div class="termin-block ${tipClass}" data-id="${escapeHtml(t.id)}"
                 role="button" tabindex="0" style="border-left-color: ${color};">
                <div class="termin-block-main">
                    <div class="termin-block-name">${escapeHtml(t.naziv || 'Bez naziva')}</div>
                    ${t.kupac_naziv ? `<div class="termin-block-kupac">${escapeHtml(t.kupac_naziv)}</div>` : ''}
                </div>
                ${time ? `<div class="termin-block-time">${escapeHtml(time)}</div>` : ''}
            </div>
        `;
    }

    function formatTimeRange(od, doVr) {
        if (!od && !doVr) return '';
        if (od && doVr) return `${od} – ${doVr}`;
        if (od) return `${od}`;
        return `do ${doVr}`;
    }

    // ----- Mjesečna ansicht -----
    function renderMjesecna() {
        const view = document.getElementById('kalendar-view');
        if (!view) return;

        const start = startOfMonth(state.anchorDate);
        const monthIndex = parseISO(start).getMonth();
        const firstDow = dayOfWeekMonFirst(start);
        const gridStart = addDays(start, -firstDow);

        const cells = [];
        for (let i = 0; i < 42; i++) {
            const iso = addDays(gridStart, i);
            const d = parseISO(iso);
            cells.push({
                iso,
                dan: d.getDate(),
                inMonth: d.getMonth() === monthIndex,
                today: isToday(iso),
                termini: getByDatum(iso)
            });
        }

        view.innerHTML = `
            <div class="month-view">
                <div class="month-header">
                    ${DANI_KRATKO.map(d => `<div class="month-header-cell">${escapeHtml(d)}</div>`).join('')}
                </div>
                <div class="month-grid">
                    ${cells.map(c => {
                        const t = c.termini;
                        const visible = t.slice(0, 3);
                        const more = t.length - visible.length;
                        return `
                            <button type="button" class="month-day ${c.inMonth ? '' : 'month-day-out'} ${c.today ? 'month-day-today' : ''}"
                                    data-datum="${escapeHtml(c.iso)}"
                                    aria-label="${escapeHtml(formatDateLong(c.iso))}, ${t.length} termina">
                                <div class="month-day-number">${c.dan}</div>
                                <div class="month-day-dots">
                                    ${visible.map(tt => {
                                        const tipClass = TIPOVI.includes(tt.tip) ? `dot-${tt.tip}` : '';
                                        return `<span class="dot ${tipClass}" aria-hidden="true"></span>`;
                                    }).join('')}
                                    ${more > 0 ? `<span class="dot-more">+${more}</span>` : ''}
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        view.querySelectorAll('.month-day').forEach(btn => {
            btn.addEventListener('click', () => {
                const datum = btn.getAttribute('data-datum');
                openDayPanel(datum);
            });
        });
    }

    // ----- Slide-up paneli (dan + termin detalji) -----
    function openDayPanel(datum) {
        state.panel = { type: 'day', datum };
        renderPanel();
    }

    function openTerminPanel(terminId) {
        state.panel = { type: 'termin', terminId };
        renderPanel();
    }

    function closePanel() {
        state.panel = null;
        renderPanel();
    }

    function renderPanel() {
        const existing = document.getElementById('kalendar-panel');
        const existingBd = document.getElementById('kalendar-panel-backdrop');
        if (existing) existing.remove();
        if (existingBd) existingBd.remove();

        if (!state.panel) {
            // Otključaj scroll samo ako više nema otvorenih overlaya
            if (!document.querySelector('.overlay') && !document.querySelector('.slide-panel') && !document.querySelector('.photo-viewer')) {
                document.body.classList.remove('overlay-open');
            }
            return;
        }

        if (state.panel.type === 'day') {
            renderDayPanel(state.panel.datum);
        } else if (state.panel.type === 'termin') {
            renderTerminDetailPanel(state.panel.terminId);
        }
    }

    function buildPanelShell(title) {
        const backdrop = document.createElement('div');
        backdrop.className = 'slide-panel-backdrop';
        backdrop.id = 'kalendar-panel-backdrop';
        backdrop.addEventListener('click', closePanel);

        const panel = document.createElement('div');
        panel.className = 'slide-panel';
        panel.id = 'kalendar-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', title);

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        document.body.classList.add('overlay-open');
        return panel;
    }

    function renderDayPanel(datum) {
        const termini = getByDatum(datum);
        const d = parseISO(datum);
        const dow = DANI_PUNO[dayOfWeekMonFirst(datum)];
        const title = `${dow}, ${formatDateLong(datum)}`;

        const panel = buildPanelShell(title);
        panel.innerHTML = `
            <button type="button" class="slide-panel-handle" id="panel-handle" aria-label="Zatvori"></button>
            <div class="slide-panel-header">
                <h3 class="slide-panel-title">${escapeHtml(title)}</h3>
                <button type="button" class="icon-btn-dark" id="panel-close" aria-label="Zatvori">✕</button>
            </div>
            <div class="slide-panel-body">
                <button type="button" class="btn btn-primary btn-block mb-2" id="panel-add">+ Novi termin za ovaj dan</button>
                ${termini.length === 0
                    ? `<div class="empty-state"><p>Nema termina za ovaj dan.</p></div>`
                    : `<ul class="panel-termin-list">
                        ${termini.map(t => `
                            <li class="panel-termin-item" data-id="${escapeHtml(t.id)}" role="button" tabindex="0"
                                style="border-left-color: ${TIP_COLORS[t.tip] || '#888'};">
                                <div class="panel-termin-main">
                                    <div class="panel-termin-name">${escapeHtml(t.naziv)}</div>
                                    ${t.kupac_naziv ? `<div class="panel-termin-kupac">${escapeHtml(t.kupac_naziv)}</div>` : ''}
                                    <div class="panel-termin-meta">
                                        <span class="status-badge" style="background-color: ${TIP_COLORS[t.tip] || '#888'}; color: #fff;">
                                            ${escapeHtml(TIP_LABELS[t.tip] || t.tip)}
                                        </span>
                                        ${formatTimeRange(t.vrijeme_od, t.vrijeme_do) ? `<span class="panel-termin-time">${escapeHtml(formatTimeRange(t.vrijeme_od, t.vrijeme_do))}</span>` : ''}
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>`
                }
            </div>
        `;

        document.getElementById('panel-handle').addEventListener('click', closePanel);
        document.getElementById('panel-close').addEventListener('click', closePanel);
        document.getElementById('panel-add').addEventListener('click', () => {
            openForm(null, { datum });
        });

        panel.querySelectorAll('.panel-termin-item').forEach(el => {
            const id = el.getAttribute('data-id');
            el.addEventListener('click', () => openTerminPanel(id));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTerminPanel(id);
                }
            });
        });
    }

    function renderTerminDetailPanel(terminId) {
        const t = getById(terminId);
        if (!t) {
            closePanel();
            return;
        }

        const narudzba = t.narudzba_id && window.App.Narudzbe
            ? window.App.Narudzbe.getById(t.narudzba_id)
            : null;

        const title = t.naziv || 'Termin';
        const panel = buildPanelShell(title);
        const color = TIP_COLORS[t.tip] || '#888';

        panel.innerHTML = `
            <button type="button" class="slide-panel-handle" id="panel-handle" aria-label="Zatvori"></button>
            <div class="slide-panel-header">
                <h3 class="slide-panel-title">${escapeHtml(title)}</h3>
                <button type="button" class="icon-btn-dark" id="panel-close" aria-label="Zatvori">✕</button>
            </div>
            <div class="slide-panel-body">
                <div class="termin-tip-row">
                    <span class="tip-color-mark" style="background-color: ${color};" aria-hidden="true"></span>
                    <span class="termin-tip-label">${escapeHtml(TIP_LABELS[t.tip] || t.tip)}</span>
                </div>

                <div class="detail-card">
                    <div class="detail-row">
                        <div class="detail-label">Datum</div>
                        <div class="detail-value">${escapeHtml(formatDateLong(t.datum))}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Vrijeme</div>
                        <div class="detail-value">${escapeHtml(formatTimeRange(t.vrijeme_od, t.vrijeme_do) || '—')}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Kupac / Naziv</div>
                        <div class="detail-value">${escapeHtml(t.kupac_naziv || '—')}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Napomena</div>
                        <div class="detail-value detail-value-multiline">${escapeHtml(t.napomena || '—')}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Datum unosa</div>
                        <div class="detail-value">${escapeHtml(formatDateLong(t.datum_unosa))}</div>
                    </div>
                </div>

                ${narudzba
                    ? `<button type="button" class="btn btn-secondary btn-block" id="btn-otvori-narudzba">
                          Otvori narudžbu: ${escapeHtml(narudzba.naziv)} →
                       </button>`
                    : (t.narudzba_id ? `<div class="placeholder-hint text-center">Povezana narudžba više ne postoji.</div>` : '')
                }

                <div class="panel-actions">
                    <button type="button" class="btn btn-primary btn-block" id="btn-uredi">Uredi</button>
                    <button type="button" class="btn btn-danger btn-block" id="btn-obrisi">Obriši</button>
                </div>
            </div>
        `;

        document.getElementById('panel-handle').addEventListener('click', closePanel);
        document.getElementById('panel-close').addEventListener('click', closePanel);
        document.getElementById('btn-uredi').addEventListener('click', () => openForm(t.id));
        document.getElementById('btn-obrisi').addEventListener('click', () => handleDelete(t));

        const btnOtvori = document.getElementById('btn-otvori-narudzba');
        if (btnOtvori) {
            btnOtvori.addEventListener('click', () => {
                if (window.App.Narudzbe && window.App.Narudzbe.openDetail(t.narudzba_id)) {
                    closePanel();
                    window.App.Nav.show('narudzbe');
                }
            });
        }
    }

    function handleDelete(t) {
        const ok = window.confirm(`Sigurno obrisati termin "${t.naziv}"?`);
        if (!ok) return;
        deleteTermin(t.id);
        closePanel();
        render();
    }

    // ----- Forma (fullscreen overlay) -----
    function openForm(editId, defaults) {
        closeForm();
        defaults = defaults || {};

        const isEdit = !!editId;
        const t = isEdit ? (getById(editId) || {}) : {};
        const tip = t.tip || '';
        const datum = t.datum || defaults.datum || todayISO();

        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'termin-form-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', isEdit ? 'Uredi termin' : 'Novi termin');

        overlay.innerHTML = `
            <div class="overlay-header">
                <button type="button" class="icon-btn" id="overlay-close" aria-label="Zatvori">✕</button>
                <h2 class="overlay-title">${isEdit ? 'Uredi termin' : 'Novi termin'}</h2>
            </div>
            <form class="overlay-body" id="termin-form" novalidate>
                <div class="form-group">
                    <label class="form-label">
                        Tip termina <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <div class="tip-selector" role="radiogroup" aria-label="Tip termina">
                        ${TIPOVI.map(k => `
                            <button type="button" class="tip-btn ${tip === k ? 'active' : ''}"
                                    data-tip="${k}" role="radio" aria-checked="${tip === k}"
                                    style="--tip-color: ${TIP_COLORS[k]};">
                                <span class="tip-btn-mark" style="background-color: ${TIP_COLORS[k]};"></span>
                                <span class="tip-btn-label">${escapeHtml(TIP_LABELS[k])}</span>
                            </button>
                        `).join('')}
                    </div>
                    <input type="hidden" name="tip" id="f-tip" value="${escapeHtml(tip)}">
                    <div class="form-error" id="err-tip" hidden>Odaberi tip termina.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-naziv">
                        Naziv <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-naziv" name="naziv" type="text" required
                           autocapitalize="sentences"
                           value="${escapeHtml(t.naziv || '')}">
                    <div class="form-error" id="err-naziv" hidden>Naziv je obavezan.</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-datum">
                        Datum <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <input class="form-input" id="f-datum" name="datum" type="date" required
                           value="${escapeHtml(datum)}">
                    <div class="form-error" id="err-datum" hidden>Datum je obavezan.</div>
                </div>

                <div class="time-row">
                    <div class="form-group">
                        <label class="form-label" for="f-od">Vrijeme od</label>
                        <input class="form-input" id="f-od" name="vrijeme_od" type="time"
                               value="${escapeHtml(t.vrijeme_od || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="f-do">Vrijeme do</label>
                        <input class="form-input" id="f-do" name="vrijeme_do" type="time"
                               value="${escapeHtml(t.vrijeme_do || '')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-narudzba">Narudžba (opcionalno)</label>
                    <select class="form-select" id="f-narudzba" name="narudzba_id"></select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-kupac-naziv">Kupac / Naziv</label>
                    <input class="form-input" id="f-kupac-naziv" name="kupac_naziv" type="text"
                           autocapitalize="words"
                           value="${escapeHtml(t.kupac_naziv || '')}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="f-napomena">Napomena</label>
                    <textarea class="form-textarea" id="f-napomena" name="napomena" rows="3">${escapeHtml(t.napomena || '')}</textarea>
                </div>

                <div class="overlay-actions">
                    <button type="submit" class="btn btn-primary btn-block">Spremi</button>
                    <button type="button" class="btn btn-ghost btn-block" id="btn-odustani">Odustani</button>
                </div>
            </form>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('overlay-open');

        populateNarudzbaSelect(document.getElementById('f-narudzba'), t.narudzba_id || '');

        setTimeout(() => {
            const f = document.getElementById('f-naziv');
            if (f) f.focus();
        }, 50);

        // Tip selector
        overlay.querySelectorAll('.tip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.tip-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                document.getElementById('f-tip').value = btn.getAttribute('data-tip');
                const err = document.getElementById('err-tip');
                if (err) err.hidden = true;
            });
        });

        // Narudžba change → autofill kupac_naziv
        const narudzbaSelect = document.getElementById('f-narudzba');
        narudzbaSelect.addEventListener('change', () => {
            const id = narudzbaSelect.value;
            if (!id) return;
            const n = window.App.Narudzbe ? window.App.Narudzbe.getById(id) : null;
            if (!n) return;
            const kupac = window.App.Kupci ? window.App.Kupci.getById(n.kupac_id) : null;
            if (kupac && kupac.ime) {
                document.getElementById('f-kupac-naziv').value = kupac.ime;
            }
        });

        document.getElementById('overlay-close').addEventListener('click', closeForm);
        document.getElementById('btn-odustani').addEventListener('click', closeForm);
        document.getElementById('termin-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit(isEdit ? editId : null);
        });
    }

    function populateNarudzbaSelect(select, selectedId) {
        if (!select) return;
        if (!window.App.Narudzbe) {
            select.innerHTML = '<option value="">-- Modul narudžbi nije učitan --</option>';
            return;
        }
        const aktivne = window.App.Narudzbe.getAll()
            .filter(n => n.status !== 'gotovo')
            .sort((a, b) => (a.naziv || '').localeCompare(b.naziv || '', 'hr'));

        const opts = ['<option value="">-- Bez narudžbe --</option>']
            .concat(aktivne.map(n => {
                const kupac = window.App.Kupci ? window.App.Kupci.getById(n.kupac_id) : null;
                const kupacIme = kupac ? kupac.ime : '';
                const label = kupacIme ? `${n.naziv} — ${kupacIme}` : n.naziv;
                return `<option value="${escapeHtml(n.id)}"${n.id === selectedId ? ' selected' : ''}>${escapeHtml(label)}</option>`;
            }));
        select.innerHTML = opts.join('');
    }

    function handleSubmit(editId) {
        const form = document.getElementById('termin-form');
        if (!form) return;

        const data = {
            tip: form.tip.value,
            naziv: form.naziv.value,
            datum: form.datum.value,
            vrijeme_od: form.vrijeme_od.value,
            vrijeme_do: form.vrijeme_do.value,
            narudzba_id: form.narudzba_id.value || null,
            kupac_naziv: form.kupac_naziv.value,
            napomena: form.napomena.value
        };

        let hasError = false;

        const errTip = document.getElementById('err-tip');
        if (!data.tip || !TIPOVI.includes(data.tip)) {
            if (errTip) errTip.hidden = false;
            hasError = true;
        } else if (errTip) {
            errTip.hidden = true;
        }

        const errNaziv = document.getElementById('err-naziv');
        if (!data.naziv || !data.naziv.trim()) {
            if (errNaziv) errNaziv.hidden = false;
            hasError = true;
        } else if (errNaziv) {
            errNaziv.hidden = true;
        }

        const errDatum = document.getElementById('err-datum');
        if (!data.datum) {
            if (errDatum) errDatum.hidden = false;
            hasError = true;
        } else if (errDatum) {
            errDatum.hidden = true;
        }

        if (hasError) return;

        let saved;
        if (editId) {
            saved = updateTermin(editId, {
                tip: data.tip,
                naziv: data.naziv.trim(),
                datum: data.datum,
                vrijeme_od: data.vrijeme_od,
                vrijeme_do: data.vrijeme_do,
                narudzba_id: data.narudzba_id,
                kupac_naziv: data.kupac_naziv.trim(),
                napomena: data.napomena.trim()
            });
        } else {
            saved = createTermin(data);
        }

        closeForm();

        // Pomakni sidro na datum spremljenog termina ako je izvan trenutnog prikaza.
        if (saved && saved.datum) {
            state.anchorDate = saved.datum;
        }

        // Ako smo uredili termin koji je trenutno otvoren u detalj-panelu, ponovo ga prikaži.
        if (editId && state.panel && state.panel.type === 'termin' && state.panel.terminId === editId) {
            render();
        } else {
            // Vrati se na prikaz; po želji prikaži detalj novostvorenog termina.
            if (saved && !editId) {
                state.panel = { type: 'termin', terminId: saved.id };
            }
            render();
        }
    }

    function closeForm() {
        const ov = document.getElementById('termin-form-overlay');
        if (ov) ov.remove();
        if (!document.querySelector('.overlay') && !document.querySelector('.slide-panel') && !document.querySelector('.photo-viewer')) {
            document.body.classList.remove('overlay-open');
        }
    }

    // ----- Inicijalizacija -----
    function init() {
        if (!state.anchorDate) state.anchorDate = todayISO();
        render();

        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'kalendar') {
                // Ako je odabrani termin obrisan negdje drugdje, očisti panel.
                if (state.panel && state.panel.type === 'termin' && !getById(state.panel.terminId)) {
                    state.panel = null;
                }
                render();
            } else {
                closeForm();
                if (state.panel) {
                    // Zatvori paneli kad korisnik napusti modul
                    state.panel = null;
                    renderPanel();
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('termin-form-overlay')) {
                closeForm();
            } else if (state.panel) {
                closePanel();
            }
        });
    }

    // Javni API modula
    window.App = window.App || {};
    window.App.Kalendar = {
        init,
        getAll,
        getByDatum,
        TIPOVI,
        TIP_LABELS,
        TIP_COLORS
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
