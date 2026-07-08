/* ============================================
   Renato Stolarija - Modul: Kupci
   Potpuno upravljanje kupcima (localStorage: "kupci")
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'kupci';
    const NARUDZBE_KEY = 'narudzbe';

    const Kupci = {
        // Stanje prikaza
        view: 'list',          // 'list' | 'detail'
        currentId: null,       // ID trenutno otvorenog kupca
        searchQuery: '',       // tekst pretrage

        /**
         * Inicijalizacija modula.
         */
        init() {
            document.addEventListener('module:shown', (e) => {
                if (e.detail.module === 'kupci') {
                    // Pri ulasku u modul uvijek prikaži listu
                    this.view = 'list';
                    this.currentId = null;
                    this.render();
                }
            });
            this.render();
        },

        // ---------- Podaci ----------

        /** Dohvati sve kupce. @returns {Array} */
        getAll() {
            return window.App.Storage.load(STORAGE_KEY, []);
        },

        /** Spremi listu kupaca. */
        saveAll(list) {
            return window.App.Storage.save(STORAGE_KEY, list);
        },

        /** Dohvati jednog kupca po ID-u. */
        getById(id) {
            return this.getAll().find(k => k.id === id) || null;
        },

        /**
         * Broj narudžbi za kupca (za sada najčešće 0 - modul dolazi kasnije).
         */
        countNarudzbe(kupacId) {
            const narudzbe = window.App.Storage.load(NARUDZBE_KEY, []);
            if (!Array.isArray(narudzbe)) return 0;
            return narudzbe.filter(n => n.kupac_id === kupacId).length;
        },

        /** Dodaj novog kupca. */
        create(data) {
            const list = this.getAll();
            const kupac = {
                id: window.App.Storage.generateId(),
                ime: data.ime.trim(),
                telefon: (data.telefon || '').trim(),
                email: (data.email || '').trim(),
                adresa: (data.adresa || '').trim(),
                napomena: (data.napomena || '').trim(),
                datum_unosa: this.today()
            };
            list.push(kupac);
            this.saveAll(list);
            return kupac;
        },

        /** Ažuriraj postojećeg kupca. */
        update(id, data) {
            const list = this.getAll();
            const idx = list.findIndex(k => k.id === id);
            if (idx === -1) return null;
            list[idx] = {
                ...list[idx],
                ime: data.ime.trim(),
                telefon: (data.telefon || '').trim(),
                email: (data.email || '').trim(),
                adresa: (data.adresa || '').trim(),
                napomena: (data.napomena || '').trim()
            };
            this.saveAll(list);
            return list[idx];
        },

        /** Obriši kupca po ID-u. */
        remove(id) {
            const list = this.getAll().filter(k => k.id !== id);
            this.saveAll(list);
        },

        // ---------- Pomoćne funkcije ----------

        /** Današnji datum u formatu YYYY-MM-DD. */
        today() {
            const d = new Date();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${d.getFullYear()}-${mm}-${dd}`;
        },

        /** Datum za prikaz (DD.MM.YYYY.). */
        formatDatum(iso) {
            if (!iso) return '';
            const parts = iso.split('-');
            if (parts.length !== 3) return iso;
            return `${parts[2]}.${parts[1]}.${parts[0]}.`;
        },

        /** Escape HTML-a radi sigurnog umetanja korisničkog unosa. */
        esc(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        // ---------- Prikaz (render) ----------

        render() {
            const container = document.getElementById('kupci-content');
            if (!container) return;

            if (this.view === 'detail' && this.currentId) {
                this.renderDetail(container);
            } else {
                this.renderListView(container);
            }
        },

        /** Prikaz liste kupaca + traka s pretragom i gumbom. */
        renderListView(container) {
            container.innerHTML = `
                <div class="kupci-toolbar">
                    <input type="search" class="form-input kupci-search"
                           id="kupci-search" placeholder="Pretraži po imenu..."
                           autocomplete="off" value="${this.esc(this.searchQuery)}">
                    <button type="button" class="btn btn-primary btn-block" id="kupci-novi">
                        + Novi kupac
                    </button>
                </div>
                <div class="kupci-list" id="kupci-list"></div>
            `;

            const search = container.querySelector('#kupci-search');
            search.addEventListener('input', () => {
                this.searchQuery = search.value;
                this.renderCards();
            });

            container.querySelector('#kupci-novi')
                .addEventListener('click', () => this.openForm(null));

            this.renderCards();
        },

        /** Prikaz samih kartica (osvježava se pri pretrazi bez gubitka fokusa). */
        renderCards() {
            const listEl = document.getElementById('kupci-list');
            if (!listEl) return;

            const q = this.searchQuery.trim().toLowerCase();
            let kupci = this.getAll();

            if (q) {
                kupci = kupci.filter(k => (k.ime || '').toLowerCase().includes(q));
            }

            // Sortiraj abecedno po imenu
            kupci.sort((a, b) => (a.ime || '').localeCompare(b.ime || '', 'hr'));

            if (kupci.length === 0) {
                const msg = q
                    ? 'Nema kupaca koji odgovaraju pretrazi.'
                    : 'Još nema unesenih kupaca. Dodajte prvog kupca gumbom iznad.';
                listEl.innerHTML = `<div class="empty-state">${msg}</div>`;
                return;
            }

            listEl.innerHTML = kupci.map(k => {
                const broj = this.countNarudzbe(k.id);
                const tel = k.telefon
                    ? `<span class="kupac-card-phone">${this.esc(k.telefon)}</span>`
                    : `<span class="kupac-card-phone kupac-card-phone-empty">bez broja</span>`;
                return `
                    <div class="kupac-card" data-id="${this.esc(k.id)}" role="button" tabindex="0">
                        <div class="kupac-card-info">
                            <span class="kupac-card-name">${this.esc(k.ime)}</span>
                            ${tel}
                        </div>
                        <span class="kupac-card-badge" title="Broj narudžbi">${broj}</span>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.kupac-card').forEach(card => {
                const id = card.getAttribute('data-id');
                card.addEventListener('click', () => this.openDetail(id));
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.openDetail(id);
                    }
                });
            });
        },

        /** Otvori detaljni prikaz kupca. */
        openDetail(id) {
            this.currentId = id;
            this.view = 'detail';
            this.render();
            window.scrollTo({ top: 0, behavior: 'instant' });
        },

        /** Vrati se na listu. */
        backToList() {
            this.currentId = null;
            this.view = 'list';
            this.render();
        },

        /** Prikaz detalja jednog kupca. */
        renderDetail(container) {
            const k = this.getById(this.currentId);
            if (!k) {
                this.backToList();
                return;
            }

            const broj = this.countNarudzbe(k.id);

            const row = (label, value, extra = '') => {
                const val = value
                    ? `<span class="detail-value ${extra}">${this.esc(value)}</span>`
                    : `<span class="detail-value detail-value-empty">—</span>`;
                return `
                    <div class="detail-row">
                        <span class="detail-label">${label}</span>
                        ${val}
                    </div>`;
            };

            // Telefon i email kao klikabilni linkovi ako postoje
            const telVal = k.telefon
                ? `<a class="detail-value detail-link" href="tel:${this.esc(k.telefon)}">${this.esc(k.telefon)}</a>`
                : `<span class="detail-value detail-value-empty">—</span>`;
            const mailVal = k.email
                ? `<a class="detail-value detail-link" href="mailto:${this.esc(k.email)}">${this.esc(k.email)}</a>`
                : `<span class="detail-value detail-value-empty">—</span>`;

            container.innerHTML = `
                <div class="detail-header">
                    <button type="button" class="btn-back" id="kupac-nazad">← Nazad</button>
                    <button type="button" class="btn btn-secondary" id="kupac-uredi">Uredi</button>
                </div>

                <h3 class="detail-name">${this.esc(k.ime)}</h3>

                <div class="detail-list">
                    <div class="detail-row">
                        <span class="detail-label">Telefon</span>
                        ${telVal}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email</span>
                        ${mailVal}
                    </div>
                    ${row('Adresa', k.adresa)}
                    ${row('Napomena', k.napomena)}
                    ${row('Datum unosa', this.formatDatum(k.datum_unosa))}
                    <div class="detail-row">
                        <span class="detail-label">Narudžbe</span>
                        <span class="detail-value">${broj}</span>
                    </div>
                </div>

                <div class="detail-actions">
                    <button type="button" class="btn btn-danger btn-block" id="kupac-obrisi">
                        Obriši kupca
                    </button>
                </div>
            `;

            container.querySelector('#kupac-nazad')
                .addEventListener('click', () => this.backToList());
            container.querySelector('#kupac-uredi')
                .addEventListener('click', () => this.openForm(k.id));
            container.querySelector('#kupac-obrisi')
                .addEventListener('click', () => this.confirmDelete(k));
        },

        // ---------- Formular (fullscreen overlay) ----------

        /**
         * Otvori formular. Ako je id null -> novi kupac, inače uređivanje.
         */
        openForm(id) {
            const isEdit = !!id;
            const k = isEdit ? this.getById(id) : null;
            if (isEdit && !k) return;

            const overlay = document.createElement('div');
            overlay.className = 'overlay';
            overlay.innerHTML = `
                <div class="overlay-header">
                    <button type="button" class="overlay-close" aria-label="Zatvori">✕</button>
                    <span class="overlay-title">${isEdit ? 'Uredi kupca' : 'Novi kupac'}</span>
                    <button type="button" class="overlay-save">Spremi</button>
                </div>
                <div class="overlay-body">
                    <form class="overlay-form" novalidate>
                        <div class="form-group">
                            <label class="form-label" for="f-ime">Ime i prezime *</label>
                            <input type="text" id="f-ime" class="form-input"
                                   value="${this.esc(k?.ime)}" required>
                            <span class="field-error hidden" id="err-ime">Ime je obavezno.</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-telefon">Telefon</label>
                            <input type="tel" id="f-telefon" class="form-input"
                                   value="${this.esc(k?.telefon)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-email">Email</label>
                            <input type="email" id="f-email" class="form-input"
                                   value="${this.esc(k?.email)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-adresa">Adresa</label>
                            <input type="text" id="f-adresa" class="form-input"
                                   value="${this.esc(k?.adresa)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="f-napomena">Napomena / Bilješka</label>
                            <textarea id="f-napomena" class="form-textarea">${this.esc(k?.napomena)}</textarea>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">
                            ${isEdit ? 'Spremi promjene' : 'Dodaj kupca'}
                        </button>
                    </form>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const close = () => {
                overlay.remove();
                document.body.style.overflow = '';
            };

            const form = overlay.querySelector('.overlay-form');
            const imeInput = overlay.querySelector('#f-ime');
            const errIme = overlay.querySelector('#err-ime');

            const submit = () => {
                const data = {
                    ime: imeInput.value,
                    telefon: overlay.querySelector('#f-telefon').value,
                    email: overlay.querySelector('#f-email').value,
                    adresa: overlay.querySelector('#f-adresa').value,
                    napomena: overlay.querySelector('#f-napomena').value
                };

                if (!data.ime.trim()) {
                    errIme.classList.remove('hidden');
                    imeInput.classList.add('input-invalid');
                    imeInput.focus();
                    return;
                }

                if (isEdit) {
                    this.update(id, data);
                } else {
                    this.create(data);
                }

                close();

                // Nakon spremanja osvježi odgovarajući prikaz
                if (isEdit) {
                    this.render();
                } else {
                    this.backToList();
                }
            };

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                submit();
            });
            overlay.querySelector('.overlay-save').addEventListener('click', submit);
            overlay.querySelector('.overlay-close').addEventListener('click', close);

            imeInput.addEventListener('input', () => {
                if (imeInput.value.trim()) {
                    errIme.classList.add('hidden');
                    imeInput.classList.remove('input-invalid');
                }
            });

            imeInput.focus();
        },

        // ---------- Brisanje s potvrdom ----------

        confirmDelete(k) {
            const dialog = document.createElement('div');
            dialog.className = 'dialog-backdrop';
            dialog.innerHTML = `
                <div class="dialog" role="alertdialog" aria-modal="true">
                    <h3 class="dialog-title">Obriši kupca?</h3>
                    <p class="dialog-text">
                        Kupac <strong>${this.esc(k.ime)}</strong> bit će trajno obrisan.
                        Ova radnja se ne može poništiti.
                    </p>
                    <div class="dialog-actions">
                        <button type="button" class="btn btn-ghost" id="dlg-odustani">Odustani</button>
                        <button type="button" class="btn btn-danger" id="dlg-obrisi">Obriši</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            document.body.style.overflow = 'hidden';

            const close = () => {
                dialog.remove();
                document.body.style.overflow = '';
            };

            dialog.querySelector('#dlg-odustani').addEventListener('click', close);
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) close();
            });
            dialog.querySelector('#dlg-obrisi').addEventListener('click', () => {
                this.remove(k.id);
                close();
                this.backToList();
            });
        }
    };

    // Eksponiraj modul globalno
    window.App = window.App || {};
    window.App.Kupci = Kupci;

    // Pokreni kad je DOM spreman
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Kupci.init());
    } else {
        Kupci.init();
    }
})();
