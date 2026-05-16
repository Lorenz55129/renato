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

    // ----- Javni API (globalno dostupno za druge module) -----
    window.App = {
        Storage,
        Nav
    };

    // ----- Inicijalizacija ----
    document.addEventListener('DOMContentLoaded', () => {
        Nav.init();
        console.info('Renato Stolarija - aplikacija pokrenuta.');
    });
})();
