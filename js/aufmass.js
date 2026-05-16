/* ============================================
   Renato Stolarija - Modul: Aufmaß / Skiciranje
   7a: Grundgerüst - overlay, toolbar, mode toggle, canvas + bg.
   Werkzeuge (stift/radirka/linija/tekst/undo) dolaze u 7b i 7c.
   ============================================ */

(function () {
    'use strict';

    const state = {
        open: false,
        narudzbaId: null,
        narudzbaNaziv: '',
        mode: 'karo',     // 'karo' | 'foto'
        bgImage: null     // HTMLImageElement kad je foto učitan
    };

    let bgCanvas = null;
    let drawCanvas = null;
    let bgCtx = null;
    let drawCtx = null;

    // ----- Pomoćno -----
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function hasAnyOverlay() {
        return !!document.querySelector('.overlay, .slide-panel, .photo-viewer, .gallery-viewer, .action-sheet, .aufmass-overlay');
    }

    // ----- Otvaranje / zatvaranje -----
    function openForNarudzba(narudzbaId) {
        if (state.open) return;
        const n = window.App.Narudzbe ? window.App.Narudzbe.getById(narudzbaId) : null;
        if (!n) return;

        state.narudzbaId = narudzbaId;
        state.narudzbaNaziv = n.naziv || 'Bez naziva';
        state.mode = 'karo';
        state.bgImage = null;

        buildOverlay();
        state.open = true;

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        // Inicijalno postavi platno i nacrtaj pozadinu nakon što je layout gotov
        requestAnimationFrame(() => {
            setupCanvases();
            redrawBg();
        });
    }

    function close() {
        const ov = document.getElementById('aufmass-overlay');
        if (ov) ov.remove();
        state.open = false;
        state.bgImage = null;
        bgCanvas = drawCanvas = bgCtx = drawCtx = null;

        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);

        if (!hasAnyOverlay()) document.body.classList.remove('overlay-open');
    }

    function buildOverlay() {
        const ov = document.createElement('div');
        ov.className = 'aufmass-overlay';
        ov.id = 'aufmass-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Skiciranje');

        ov.innerHTML = `
            <div class="aufmass-header">
                <button type="button" class="icon-btn" id="aufmass-close" aria-label="Zatvori">✕</button>
                <h2 class="aufmass-title">${escapeHtml(state.narudzbaNaziv)}</h2>
                <button type="button" class="btn btn-secondary aufmass-save" id="aufmass-save" disabled>Spremi</button>
            </div>

            <div class="aufmass-tools">
                <div class="aufmass-mode-toggle" role="tablist" aria-label="Vrsta podloge">
                    <button type="button" class="aufmass-mode-btn ${state.mode === 'karo' ? 'active' : ''}"
                            data-mode="karo" role="tab">Karo</button>
                    <button type="button" class="aufmass-mode-btn ${state.mode === 'foto' ? 'active' : ''}"
                            data-mode="foto" role="tab">Foto</button>
                </div>
                <label class="aufmass-photo-load ${state.mode === 'foto' ? '' : 'hidden'}" id="aufmass-photo-load">
                    <input type="file" accept="image/*" id="aufmass-photo-input" hidden>
                    <span>Učitaj fotografiju</span>
                </label>
            </div>

            <div class="aufmass-canvas-wrap" id="aufmass-canvas-wrap">
                <canvas class="aufmass-canvas aufmass-canvas-bg" id="aufmass-bg"></canvas>
                <canvas class="aufmass-canvas aufmass-canvas-draw" id="aufmass-draw"></canvas>
            </div>
        `;

        document.body.appendChild(ov);
        document.body.classList.add('overlay-open');

        bgCanvas = document.getElementById('aufmass-bg');
        drawCanvas = document.getElementById('aufmass-draw');

        document.getElementById('aufmass-close').addEventListener('click', close);

        ov.querySelectorAll('.aufmass-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode')));
        });

        document.getElementById('aufmass-photo-input').addEventListener('change', handlePhotoLoad);

        bindCanvasEvents();
    }

    // ----- Canvas setup (DPR-aware) -----
    function setupCanvases() {
        const wrap = document.getElementById('aufmass-canvas-wrap');
        if (!wrap || !bgCanvas || !drawCanvas) return;

        const rect = wrap.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        const dpr = window.devicePixelRatio || 1;

        [bgCanvas, drawCanvas].forEach(c => {
            c.style.width = w + 'px';
            c.style.height = h + 'px';
            c.width = Math.floor(w * dpr);
            c.height = Math.floor(h * dpr);
            const ctx = c.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        });

        bgCtx = bgCanvas.getContext('2d');
        drawCtx = drawCanvas.getContext('2d');
    }

    // ----- Pozadina: karo grid ili učitani foto -----
    function redrawBg() {
        if (!bgCtx) return;
        const w = bgCanvas.clientWidth;
        const h = bgCanvas.clientHeight;
        bgCtx.clearRect(0, 0, w, h);
        bgCtx.fillStyle = '#FFFFFF';
        bgCtx.fillRect(0, 0, w, h);

        if (state.mode === 'foto') {
            if (state.bgImage) drawPhoto(state.bgImage, w, h);
            // Inače: prazno bijelo platno dok korisnik ne učita foto
        } else {
            drawGrid(w, h);
        }
    }

    function drawGrid(w, h) {
        const step = 20;
        bgCtx.strokeStyle = '#E8E8E8';
        bgCtx.lineWidth = 1;
        bgCtx.beginPath();
        for (let x = 0; x <= w; x += step) {
            // +0.5 za pin-sharp linije
            bgCtx.moveTo(x + 0.5, 0);
            bgCtx.lineTo(x + 0.5, h);
        }
        for (let y = 0; y <= h; y += step) {
            bgCtx.moveTo(0, y + 0.5);
            bgCtx.lineTo(w, y + 0.5);
        }
        bgCtx.stroke();
    }

    function drawPhoto(img, w, h) {
        // object-fit: contain
        const scale = Math.min(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        bgCtx.drawImage(img, dx, dy, dw, dh);
    }

    // ----- Mode toggle -----
    function setMode(mode) {
        if (mode !== 'karo' && mode !== 'foto') return;
        state.mode = mode;

        document.querySelectorAll('.aufmass-mode-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });

        const photoLoad = document.getElementById('aufmass-photo-load');
        if (photoLoad) photoLoad.classList.toggle('hidden', mode !== 'foto');

        redrawBg();
    }

    function handlePhotoLoad(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                state.bgImage = img;
                redrawBg();
            };
            img.onerror = () => {
                console.error('Aufmass: nije moguće učitati sliku');
            };
            img.src = ev.target.result;
        };
        reader.onerror = () => {
            console.error('Aufmass: čitanje datoteke nije uspjelo');
        };
        reader.readAsDataURL(file);
    }

    // ----- Resize -----
    function onResize() {
        if (!state.open) return;
        // Sačuvaj eventualne crteže prije promjene veličine (za 7a još nema crteža).
        let preserved = null;
        if (drawCanvas) {
            try { preserved = drawCanvas.toDataURL(); } catch (err) { preserved = null; }
        }
        setupCanvases();
        redrawBg();
        if (preserved && drawCtx) {
            const img = new Image();
            img.onload = () => {
                drawCtx.drawImage(img, 0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
            };
            img.src = preserved;
        }
    }

    // ----- Touch / Mouse eventi (placeholder za 7b) -----
    function bindCanvasEvents() {
        if (!drawCanvas) return;

        ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev => {
            drawCanvas.addEventListener(ev, handleTouch, { passive: false });
        });
        ['mousedown', 'mousemove', 'mouseup', 'mouseleave'].forEach(ev => {
            drawCanvas.addEventListener(ev, handleMouse);
        });
    }

    function handleTouch(e) {
        // Spriječi scroll/zoom dok korisnik povlači prstom po platnu.
        e.preventDefault();
        if (e.type === 'touchstart' || e.type === 'touchend') {
            console.log('aufmass touch:', e.type, e.touches.length);
        }
    }

    function handleMouse(e) {
        if (e.type === 'mousedown' || e.type === 'mouseup') {
            console.log('aufmass mouse:', e.type);
        }
    }

    // ----- Init i javni API -----
    function init() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.open) {
                close();
            }
        });
    }

    window.App = window.App || {};
    window.App.Aufmass = {
        init,
        openForNarudzba
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
