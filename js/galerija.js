/* ============================================
   Renato Stolarija - Modul: Galerija
   Agregira fotografije iz svih narudžbi. Ne sprema vlastite podatke
   (samo dodavanje/brisanje fotografija ide preko window.App.Narudzbe).
   ============================================ */

(function () {
    'use strict';

    // Source of truth za kategorije je window.App.Narudzbe.KATEGORIJE;
    // ovo je fallback ako se modul učita prije narudžbi.
    const KATEGORIJE_FALLBACK = ['Kuhinja', 'Spavaća soba', 'Dnevni boravak', 'Kupaonica', 'Ured', 'Ostalo'];
    const DEFAULT_KATEGORIJA = 'Ostalo';
    const LONGPRESS_MS = 600;
    const SWIPE_THRESHOLD = 50;

    const state = {
        view: 'list',           // 'list' | 'gallery'
        groupMode: 'projekti',  // 'projekti' | 'kategorije'
        gallery: null,          // { type: 'project'|'kategorija', key, naziv, kupacIme, photos }
        viewer: null            // { photos, index } | null
    };

    // Pomoćni flag za potiskivanje click-a nakon long-pressa.
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

    function getKategorije() {
        if (window.App.Narudzbe && Array.isArray(window.App.Narudzbe.KATEGORIJE)) {
            return window.App.Narudzbe.KATEGORIJE;
        }
        return KATEGORIJE_FALLBACK;
    }

    function kupacIme(kupacId) {
        if (!kupacId || !window.App.Kupci) return '';
        const k = window.App.Kupci.getById(kupacId);
        return k ? (k.ime || '') : '';
    }

    function statusLabel(status) {
        if (window.App.Narudzbe && window.App.Narudzbe.STATUS_LABELS) {
            return window.App.Narudzbe.STATUS_LABELS[status] || status || '';
        }
        return status || '';
    }

    // ----- Agregacija -----
    function getProjekti() {
        if (!window.App.Narudzbe) return [];
        return window.App.Narudzbe.getAll()
            .filter(n => Array.isArray(n.fotografije) && n.fotografije.length > 0)
            .map(n => ({
                narudzbaId: n.id,
                naziv: n.naziv || 'Bez naziva',
                kupacIme: kupacIme(n.kupac_id),
                status: n.status,
                kategorija: n.kategorija || DEFAULT_KATEGORIJA,
                fotografije: n.fotografije
            }))
            .sort((a, b) => a.naziv.localeCompare(b.naziv, 'hr'));
    }

    function getFotografijePoKategoriji() {
        const map = {};
        getKategorije().forEach(k => { map[k] = []; });
        if (!window.App.Narudzbe) return map;

        window.App.Narudzbe.getAll().forEach(n => {
            const kat = n.kategorija || DEFAULT_KATEGORIJA;
            if (!map[kat]) map[kat] = [];
            (n.fotografije || []).forEach((src, fotoIndex) => {
                map[kat].push({
                    src,
                    narudzbaId: n.id,
                    fotoIndex,
                    narudzbaNaziv: n.naziv || 'Bez naziva',
                    kupacIme: kupacIme(n.kupac_id),
                    kategorija: kat
                });
            });
        });
        return map;
    }

    function buildProjectPhotos(narudzbaId) {
        const n = window.App.Narudzbe && window.App.Narudzbe.getById(narudzbaId);
        if (!n) return [];
        const kupac = kupacIme(n.kupac_id);
        return (n.fotografije || []).map((src, i) => ({
            src,
            narudzbaId: n.id,
            fotoIndex: i,
            narudzbaNaziv: n.naziv || 'Bez naziva',
            kupacIme: kupac,
            kategorija: n.kategorija || DEFAULT_KATEGORIJA
        }));
    }

    // ----- Glavni render -----
    function render() {
        const container = document.getElementById('galerija-content');
        if (!container) return;

        if (state.view === 'gallery') {
            renderGalleryView();
        } else {
            renderListView();
        }
    }

    // ----- Lista (projekti / kategorije) -----
    function renderListView() {
        const container = document.getElementById('galerija-content');
        if (!container) return;

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back-vise">‹ Više</button>

            <div class="galerija-toolbar">
                <div class="view-toggle" role="tablist" aria-label="Grupiranje galerije">
                    <button type="button" class="view-toggle-btn ${state.groupMode === 'projekti' ? 'active' : ''}"
                            data-mode="projekti" role="tab">Projekti</button>
                    <button type="button" class="view-toggle-btn ${state.groupMode === 'kategorije' ? 'active' : ''}"
                            data-mode="kategorije" role="tab">Kategorije</button>
                </div>
            </div>

            <div id="galerija-list-container"></div>
        `;

        document.getElementById('btn-back-vise').addEventListener('click', () => {
            window.App.Nav.show('vise');
        });

        container.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.groupMode = btn.getAttribute('data-mode');
                render();
            });
        });

        if (state.groupMode === 'kategorije') {
            renderKategorijeList();
        } else {
            renderProjektiList();
        }
    }

    function renderProjektiList() {
        const cont = document.getElementById('galerija-list-container');
        if (!cont) return;

        const projekti = getProjekti();
        if (projekti.length === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nema fotografija.</p>
                    <p class="placeholder-hint">Otvorite narudžbu i dodajte fotografije iz galerije ili modula Narudžbe.</p>
                </div>
            `;
            return;
        }

        cont.innerHTML = `
            <ul class="gallery-project-list">
                ${projekti.map(p => `
                    <li>
                        <button type="button" class="gallery-project-card" data-narudzba="${escapeHtml(p.narudzbaId)}">
                            <div class="gallery-project-cover">
                                <img src="${p.fotografije[0]}" alt="" loading="lazy">
                            </div>
                            <div class="gallery-project-info">
                                <div class="gallery-project-name">${escapeHtml(p.naziv)}</div>
                                ${p.kupacIme ? `<div class="gallery-project-kupac">${escapeHtml(p.kupacIme)}</div>` : ''}
                                <div class="gallery-project-meta">
                                    ${p.status ? `<span class="status-badge status-${escapeHtml(p.status)}">${escapeHtml(statusLabel(p.status))}</span>` : ''}
                                    <span class="gallery-project-count">${p.fotografije.length} ${p.fotografije.length === 1 ? 'fotografija' : 'fotografija'}</span>
                                </div>
                            </div>
                        </button>
                    </li>
                `).join('')}
            </ul>
        `;

        cont.querySelectorAll('.gallery-project-card').forEach(card => {
            card.addEventListener('click', () => {
                openProjectGallery(card.getAttribute('data-narudzba'));
            });
        });
    }

    function renderKategorijeList() {
        const cont = document.getElementById('galerija-list-container');
        if (!cont) return;

        const map = getFotografijePoKategoriji();
        const kategorije = getKategorije();

        const ukupno = kategorije.reduce((s, k) => s + (map[k] ? map[k].length : 0), 0);
        if (ukupno === 0) {
            cont.innerHTML = `
                <div class="empty-state">
                    <p>Još nema fotografija ni u jednoj kategoriji.</p>
                </div>
            `;
            return;
        }

        cont.innerHTML = `
            <div class="kategorija-grid">
                ${kategorije.map(k => {
                    const fotos = map[k] || [];
                    const count = fotos.length;
                    const cover = count > 0 ? fotos[0].src : null;
                    return `
                        <button type="button" class="kategorija-tile ${count === 0 ? 'kategorija-tile-empty' : ''}"
                                data-kategorija="${escapeHtml(k)}" ${count === 0 ? 'disabled' : ''}>
                            <div class="kategorija-tile-cover">
                                ${cover ? `<img src="${cover}" alt="" loading="lazy">` : '<span class="kategorija-tile-placeholder">—</span>'}
                            </div>
                            <div class="kategorija-tile-name">${escapeHtml(k)}</div>
                            <div class="kategorija-tile-count">${count} ${count === 1 ? 'fotografija' : 'fotografija'}</div>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        cont.querySelectorAll('.kategorija-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const kat = tile.getAttribute('data-kategorija');
                openKategorijaGallery(kat);
            });
        });
    }

    // ----- Galerija (projekt ili kategorija) -----
    function openProjectGallery(narudzbaId) {
        const photos = buildProjectPhotos(narudzbaId);
        const n = window.App.Narudzbe.getById(narudzbaId);
        if (!n) return;
        state.gallery = {
            type: 'project',
            key: narudzbaId,
            naziv: n.naziv || 'Bez naziva',
            kupacIme: kupacIme(n.kupac_id),
            kategorija: n.kategorija || DEFAULT_KATEGORIJA,
            photos
        };
        state.view = 'gallery';
        render();
    }

    function openKategorijaGallery(kategorija) {
        const map = getFotografijePoKategoriji();
        const photos = map[kategorija] || [];
        state.gallery = {
            type: 'kategorija',
            key: kategorija,
            naziv: kategorija,
            kupacIme: '',
            kategorija: kategorija,
            photos
        };
        state.view = 'gallery';
        render();
    }

    function renderGalleryView() {
        const container = document.getElementById('galerija-content');
        if (!container) return;

        // Osvježi snimku fotografija (možda je nešto obrisano/dodano)
        if (state.gallery.type === 'project') {
            state.gallery.photos = buildProjectPhotos(state.gallery.key);
            // Ako je narudžba u međuvremenu obrisana
            if (!window.App.Narudzbe.getById(state.gallery.key)) {
                state.view = 'list';
                state.gallery = null;
                render();
                return;
            }
        } else if (state.gallery.type === 'kategorija') {
            const map = getFotografijePoKategoriji();
            state.gallery.photos = map[state.gallery.key] || [];
        }

        const isProject = state.gallery.type === 'project';
        const photos = state.gallery.photos;

        container.innerHTML = `
            <button type="button" class="btn btn-ghost btn-back" id="btn-back-list">‹ Nazad</button>

            <header class="gallery-header">
                <h3 class="gallery-header-title">${escapeHtml(state.gallery.naziv)}</h3>
                ${state.gallery.kupacIme ? `<div class="gallery-header-kupac">${escapeHtml(state.gallery.kupacIme)}</div>` : ''}
                <div class="gallery-header-meta">
                    ${isProject
                        ? `<span class="gallery-header-kategorija">${escapeHtml(state.gallery.kategorija)}</span>`
                        : ''}
                    <span class="gallery-header-count">${photos.length} ${photos.length === 1 ? 'fotografija' : 'fotografija'}</span>
                </div>
            </header>

            ${isProject ? `
                <label class="btn btn-secondary btn-block gallery-add-btn">
                    <input type="file" accept="image/*" capture="environment" id="gal-add-input" hidden>
                    <span>+ Dodaj foto</span>
                </label>
                <div class="gallery-status" id="gallery-status" aria-live="polite"></div>
            ` : ''}

            ${photos.length === 0
                ? `<div class="empty-state"><p>Nema fotografija.</p></div>`
                : `<div class="gallery-grid" id="gallery-grid">
                    ${photos.map((p, i) => `
                        <button type="button" class="gallery-tile" data-index="${i}"
                                aria-label="Otvori fotografiju ${i + 1} od ${photos.length}">
                            <img src="${p.src}" alt="" loading="lazy">
                        </button>
                    `).join('')}
                   </div>`
            }
        `;

        document.getElementById('btn-back-list').addEventListener('click', () => {
            state.view = 'list';
            state.gallery = null;
            render();
        });

        if (isProject) {
            const input = document.getElementById('gal-add-input');
            if (input) input.addEventListener('change', handleAddPhoto);
        }

        const grid = document.getElementById('gallery-grid');
        if (grid) {
            grid.querySelectorAll('.gallery-tile').forEach(tile => {
                const idx = parseInt(tile.getAttribute('data-index'), 10);
                // Tap → viewer; long-press → action sheet
                tile.addEventListener('click', () => {
                    if (suppressNextClick) {
                        suppressNextClick = false;
                        return;
                    }
                    openViewer(state.gallery.photos, idx);
                });
                attachLongpress(tile, () => openPhotoActionSheet(idx));
            });
        }
    }

    async function handleAddPhoto(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file || !state.gallery || state.gallery.type !== 'project') return;

        const status = document.getElementById('gallery-status');
        if (status) status.textContent = 'Obrađujem fotografiju...';

        try {
            if (!window.App.Narudzbe || typeof window.App.Narudzbe.addFoto !== 'function') {
                throw new Error('Modul narudžbi nije dostupan.');
            }
            await window.App.Narudzbe.addFoto(state.gallery.key, file);
            if (status) status.textContent = '';
            render();
        } catch (err) {
            console.error('Greška pri dodavanju fotografije u galeriji:', err);
            if (status) status.textContent = err.message || 'Greška pri dodavanju fotografije.';
        }
    }

    function openPhotoActionSheet(photoIndex) {
        const photo = state.gallery && state.gallery.photos && state.gallery.photos[photoIndex];
        if (!photo) return;

        showActionSheet([
            {
                label: 'Obriši fotografiju',
                danger: true,
                action: () => {
                    if (!window.confirm('Sigurno obrisati ovu fotografiju?')) return;
                    if (window.App.Narudzbe && typeof window.App.Narudzbe.removeFoto === 'function') {
                        window.App.Narudzbe.removeFoto(photo.narudzbaId, photo.fotoIndex);
                        render();
                    }
                }
            },
            { label: 'Odustani', action: null }
        ]);
    }

    // ----- Vollbild viewer -----
    function openViewer(photos, index) {
        if (!photos || !photos.length) return;
        closeViewer();
        state.viewer = { photos, index: Math.max(0, Math.min(index, photos.length - 1)) };
        renderViewer();
    }

    function closeViewer() {
        const ov = document.getElementById('gallery-viewer-overlay');
        if (ov) ov.remove();
        state.viewer = null;
        if (!hasAnyOverlay()) document.body.classList.remove('overlay-open');
    }

    function viewerStep(delta) {
        if (!state.viewer) return;
        const n = state.viewer.photos.length;
        if (n <= 1) return;
        state.viewer.index = (state.viewer.index + delta + n) % n;
        renderViewer();
    }

    function renderViewer() {
        if (!state.viewer) return;
        const ov = document.getElementById('gallery-viewer-overlay') || createViewerShell();
        const photo = state.viewer.photos[state.viewer.index];
        const total = state.viewer.photos.length;

        ov.querySelector('.gallery-viewer-image').src = photo.src;
        ov.querySelector('.gallery-viewer-image').alt = `Fotografija ${state.viewer.index + 1}`;
        ov.querySelector('#viewer-counter').textContent = `${state.viewer.index + 1} / ${total}`;
        ov.querySelector('#viewer-naziv').textContent = photo.narudzbaNaziv || '';
        ov.querySelector('#viewer-kupac').textContent = photo.kupacIme || '';

        const left = ov.querySelector('.gallery-viewer-arrow-left');
        const right = ov.querySelector('.gallery-viewer-arrow-right');
        const showArrows = total > 1;
        left.style.display = showArrows ? '' : 'none';
        right.style.display = showArrows ? '' : 'none';
    }

    function createViewerShell() {
        const ov = document.createElement('div');
        ov.className = 'gallery-viewer';
        ov.id = 'gallery-viewer-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Pregled fotografije');

        ov.innerHTML = `
            <button type="button" class="icon-btn gallery-viewer-close" id="viewer-close" aria-label="Zatvori">✕</button>
            <button type="button" class="gallery-viewer-arrow gallery-viewer-arrow-left" id="viewer-prev" aria-label="Prethodna">‹</button>
            <div class="gallery-viewer-image-wrap" id="viewer-wrap">
                <img class="gallery-viewer-image" alt="">
            </div>
            <button type="button" class="gallery-viewer-arrow gallery-viewer-arrow-right" id="viewer-next" aria-label="Sljedeća">›</button>
            <div class="gallery-viewer-footer">
                <div class="gallery-viewer-naziv" id="viewer-naziv"></div>
                <div class="gallery-viewer-kupac" id="viewer-kupac"></div>
                <div class="gallery-viewer-counter" id="viewer-counter"></div>
            </div>
        `;

        document.body.appendChild(ov);
        document.body.classList.add('overlay-open');

        ov.querySelector('#viewer-close').addEventListener('click', closeViewer);
        ov.querySelector('#viewer-prev').addEventListener('click', () => viewerStep(-1));
        ov.querySelector('#viewer-next').addEventListener('click', () => viewerStep(1));

        // Klik na pozadinu (van slike) zatvara
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.id === 'viewer-wrap') closeViewer();
        });

        // Swipe lijevo/desno
        attachSwipe(ov.querySelector('#viewer-wrap'), (dir) => {
            if (dir === 'left') viewerStep(1);
            else if (dir === 'right') viewerStep(-1);
        });

        return ov;
    }

    // ----- Long-press i swipe helperi -----
    function attachLongpress(el, action) {
        let timer = null;
        let triggered = false;

        function start() {
            triggered = false;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                triggered = true;
                suppressNextClick = true;
                action();
            }, LONGPRESS_MS);
        }
        function cancel() {
            if (timer) clearTimeout(timer);
            timer = null;
        }

        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchmove', cancel, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('touchcancel', cancel);

        // Desktop: contextmenu (desni klik / dugi klik na trackpadu)
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            suppressNextClick = true;
            action();
        });
    }

    function attachSwipe(el, onSwipe) {
        let startX = 0;
        let startY = 0;
        let startTime = 0;
        let tracking = false;

        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) { tracking = false; return; }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = Date.now();
            tracking = true;
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
            if (!tracking || !e.changedTouches.length) return;
            tracking = false;
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            const dt = Date.now() - startTime;
            if (dt > 800) return;
            if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
                onSwipe(dx > 0 ? 'right' : 'left');
            }
        }, { passive: true });
    }

    // ----- Action sheet -----
    function showActionSheet(items) {
        closeActionSheet();

        const backdrop = document.createElement('div');
        backdrop.className = 'action-sheet-backdrop';
        backdrop.id = 'gal-action-backdrop';
        backdrop.addEventListener('click', closeActionSheet);

        const sheet = document.createElement('div');
        sheet.className = 'action-sheet';
        sheet.id = 'gal-action-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        sheet.innerHTML = items.map((it, i) => `
            <button type="button" class="action-sheet-btn ${it.danger ? 'action-sheet-btn-danger' : ''}" data-index="${i}">
                ${escapeHtml(it.label)}
            </button>
        `).join('');

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        document.body.classList.add('overlay-open');

        sheet.querySelectorAll('.action-sheet-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => {
                closeActionSheet();
                if (items[i].action) items[i].action();
            });
        });
    }

    function closeActionSheet() {
        const a = document.getElementById('gal-action-sheet');
        const b = document.getElementById('gal-action-backdrop');
        if (a) a.remove();
        if (b) b.remove();
        if (!hasAnyOverlay()) document.body.classList.remove('overlay-open');
    }

    function hasAnyOverlay() {
        return !!document.querySelector('.overlay, .slide-panel, .photo-viewer, .gallery-viewer, .action-sheet');
    }

    // ----- Init i javni API -----
    function refresh() {
        // Pozivaju je drugi moduli nakon promjene fotografija.
        if (window.App.Nav && window.App.Nav.currentModule === 'galerija') {
            render();
        }
    }

    function init() {
        document.addEventListener('module:shown', (e) => {
            if (e.detail.module === 'galerija') {
                // Zadrži "Više" gumb aktivnim
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                const viseBtn = document.querySelector('.nav-btn[data-target="vise"]');
                if (viseBtn) viseBtn.classList.add('active');
                render();
            } else {
                closeViewer();
                closeActionSheet();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (state.viewer) {
                if (e.key === 'Escape') { closeViewer(); return; }
                if (e.key === 'ArrowLeft') { viewerStep(-1); return; }
                if (e.key === 'ArrowRight') { viewerStep(1); return; }
            }
            if (e.key === 'Escape' && document.getElementById('gal-action-sheet')) {
                closeActionSheet();
            }
        });

        // Otvaranje iz "Više" izbornika
        document.querySelectorAll('.menu-item[data-target="galerija"]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.Nav.show('galerija');
            });
        });
    }

    window.App = window.App || {};
    window.App.Galerija = {
        init,
        refresh
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
