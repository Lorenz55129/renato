/* ============================================
   Renato Stolarija - Modul: Kupci
   Upravljanje kupcima (placeholder - puna funkcionalnost u sljedećem koraku)
   ============================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'kupci';

    const Kupci = {
        /**
         * Inicijalizacija modula - poziva se pri učitavanju.
         */
        init() {
            this.render();
            document.addEventListener('module:shown', (e) => {
                if (e.detail.module === 'kupci') {
                    this.render();
                }
            });
        },

        /**
         * Dohvati sve kupce iz localStorage.
         * @returns {Array} lista kupaca
         */
        getAll() {
            return window.App.Storage.load(STORAGE_KEY, []);
        },

        /**
         * Spremi listu kupaca u localStorage.
         * @param {Array} list - lista kupaca
         */
        saveAll(list) {
            return window.App.Storage.save(STORAGE_KEY, list);
        },

        /**
         * Generiraj prikaz modula (placeholder).
         */
        render() {
            const container = document.getElementById('kupci-content');
            if (!container) return;

            const kupci = this.getAll();
            const count = kupci.length;

            container.innerHTML = `
                <div class="placeholder-card">
                    <p>Modul <strong>Kupci</strong> spreman za razvoj.</p>
                    <p class="placeholder-hint">Trenutno spremljenih kupaca: ${count}</p>
                </div>
            `;
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
