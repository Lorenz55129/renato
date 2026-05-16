/* ============================================
   Renato Stolarija - Glavna aplikacijska logika
   Navigacija + localStorage pomoćne funkcije
   ============================================ */

(function () {
    'use strict';

    // ----- localStorage prefix -----
    const STORAGE_PREFIX = 'renato.';

    // ----- localStorage pomoćne funkcije -----
    const Storage = {
        /**
         * Spremi podatke u localStorage pod zadanim ključem.
         * @param {string} key - ključ (bez prefiksa)
         * @param {*} value - vrijednost (bit će serijalizirana u JSON)
         */
        save(key, value) {
            try {
                localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
                return true;
            } catch (err) {
                console.error('Storage.save error:', err);
                return false;
            }
        },

        /**
         * Učitaj podatke iz localStorage.
         * @param {string} key - ključ (bez prefiksa)
         * @param {*} fallback - vrijednost ako ključ ne postoji
         */
        load(key, fallback = null) {
            try {
                const raw = localStorage.getItem(STORAGE_PREFIX + key);
                if (raw === null) return fallback;
                return JSON.parse(raw);
            } catch (err) {
                console.error('Storage.load error:', err);
                return fallback;
            }
        },

        /**
         * Obriši ključ iz localStorage.
         * @param {string} key - ključ (bez prefiksa)
         */
        remove(key) {
            try {
                localStorage.removeItem(STORAGE_PREFIX + key);
                return true;
            } catch (err) {
                console.error('Storage.remove error:', err);
                return false;
            }
        },

        /**
         * Generira jedinstveni ID temeljen na vremenu i slučajnom broju.
         */
        generateId() {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substring(2, 8);
            return `${timestamp}-${random}`;
        }
    };

    // ----- Navigacija između modula -----
    const Nav = {
        currentModule: 'dashboard',

        init() {
            const buttons = document.querySelectorAll('.nav-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-target');
                    if (target) this.show(target);
                });
            });
        },

        /**
         * Prikaži zadani modul i sakrij ostale.
         * @param {string} moduleName - ime modula (npr. "kupci")
         */
        show(moduleName) {
            const modules = document.querySelectorAll('.module');
            modules.forEach(m => {
                if (m.getAttribute('data-module') === moduleName) {
                    m.classList.remove('hidden');
                } else {
                    m.classList.add('hidden');
                }
            });

            const buttons = document.querySelectorAll('.nav-btn');
            buttons.forEach(btn => {
                if (btn.getAttribute('data-target') === moduleName) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            this.currentModule = moduleName;

            // Obavijesti modul da je prikazan (za kasnije module)
            const event = new CustomEvent('module:shown', { detail: { module: moduleName } });
            document.dispatchEvent(event);

            // Skrolaj na vrh pri promjeni modula
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    };

    // ----- Dashboard (Početna) - agregira podatke iz svih modula -----
    const Dashboard = {
        init() {
            document.addEventListener('module:shown', (e) => {
                if (e.detail.module === 'dashboard') this.update();
            });
            // Početni prikaz - module:shown se ne ispaljuje pri prvom učitavanju.
            this.update();
        },

        update() {
            const root = document.getElementById('dashboard-content');
            if (!root) return;

            const narudzbe = Storage.load('narudzbe', []);
            const termini = Storage.load('termini', []);
            const ponude = Storage.load('ponude', []);

            const today = this.todayISO();
            const { start, end } = this.weekRange();

            const otvorene = narudzbe.filter(n => n.status !== 'gotovo').length;
            const isporukaTjedan = narudzbe.filter(n =>
                n.status !== 'gotovo' &&
                n.datum_isporuke &&
                n.datum_isporuke >= start &&
                n.datum_isporuke <= end
            ).length;
            const poslane = ponude.filter(p => p.status === 'poslano').length;
            const danasniTermini = termini
                .filter(t => t.datum === today)
                .sort((a, b) => (a.vrijeme_od || '00:00').localeCompare(b.vrijeme_od || '00:00'));

            this.setText('ds-otvorene', otvorene);
            this.setText('ds-isporuka', isporukaTjedan);
            this.setText('ds-poslane', poslane);
            this.setText('ds-termini-broj', danasniTermini.length);
            this.renderTermini(danasniTermini);
        },

        renderTermini(list) {
            const el = document.getElementById('ds-termini-list');
            if (!el) return;
            if (!list.length) {
                el.innerHTML = '<p class="placeholder-hint">Nema termina za danas.</p>';
                return;
            }
            el.innerHTML = '<ul class="dashboard-termin-list">' + list.map(t => {
                const time = t.vrijeme_od ? this.esc(t.vrijeme_od) : '—';
                const naziv = this.esc(t.naziv || 'Bez naziva');
                const kupac = this.esc(t.kupac_naziv || '');
                return `
                    <li class="dashboard-termin-item">
                        <span class="dashboard-termin-time">${time}</span>
                        <div class="dashboard-termin-main">
                            <div class="dashboard-termin-naziv">${naziv}</div>
                            ${kupac ? `<div class="dashboard-termin-kupac">${kupac}</div>` : ''}
                        </div>
                    </li>
                `;
            }).join('') + '</ul>';
        },

        setText(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        },

        esc(s) {
            if (s === null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        todayISO() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        },

        weekRange() {
            const d = new Date();
            const dow = d.getDay();           // 0 = Nedjelja
            const diff = dow === 0 ? -6 : 1 - dow;
            const start = new Date(d);
            start.setDate(d.getDate() + diff);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
            return { start: fmt(start), end: fmt(end) };
        }
    };

    // ----- Javni API (globalno dostupno za druge module) -----
    window.App = {
        Storage,
        Nav,
        Dashboard
    };

    // ----- Inicijalizacija ----
    document.addEventListener('DOMContentLoaded', () => {
        Nav.init();
        Dashboard.init();
        console.info('Renato Stolarija - aplikacija pokrenuta.');
    });
})();
