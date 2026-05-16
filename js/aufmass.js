/* ============================================
   Renato Stolarija - Modul: Aufmaß / Skiciranje
   7a: grundgerüst (overlay, modovi, canvas)
   7b: olovka, radirka, boja, debljina, undo
   7c (planirano): linija, tekst, spremanje u narudžbu
   ============================================ */

(function () {
    'use strict';

    const COLORS = [
        { value: '#E53E3E', name: 'Crvena' },
        { value: '#1A1208', name: 'Crna' },
        { value: '#2B6CB0', name: 'Plava' },
        { value: '#276749', name: 'Zelena' },
        { value: '#C9A84C', name: 'Zlatna' }
    ];
    const DEFAULT_COLOR = '#1A1208';
    const STROKE_SIZES = { S: 2, M: 5, L: 10 };
    const SIZE_DOT_VISUAL = { S: 4, M: 8, L: 14 };
    const DEFAULT_STROKE_SIZE = 'M';
    const ERASER_MULTIPLIER = 4;
    const UNDO_MAX = 20;

    const state = {
        open: false,
        narudzbaId: null,
        narudzbaNaziv: '',
        mode: 'karo',                       // 'karo' | 'foto'
        bgImage: null,
        tool: 'pen',                        // 'pen' | 'eraser'
        color: DEFAULT_COLOR,
        strokeSize: DEFAULT_STROKE_SIZE,
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        undoStack: []                       // dataURL-ovi nakon svakog poteza, max UNDO_MAX
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

    function hasUnsavedDrawing() {
        return state.undoStack.length > 0;
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
        state.tool = 'pen';
        state.color = DEFAULT_COLOR;
        state.strokeSize = DEFAULT_STROKE_SIZE;
        state.isDrawing = false;
        state.undoStack = [];

        buildOverlay();
        state.open = true;

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        requestAnimationFrame(() => {
            setupCanvases();
            redrawBg();
        });
    }

    function close() {
        if (hasUnsavedDrawing()) {
            if (!window.confirm('Imate nespremljen crtež. Zatvoriti bez spremanja?')) return;
        }
        const ov = document.getElementById('aufmass-overlay');
        if (ov) ov.remove();
        state.open = false;
        state.bgImage = null;
        state.isDrawing = false;
        state.undoStack = [];
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

                <span class="aufmass-tools-sep" aria-hidden="true"></span>

                <button type="button" class="aufmass-tool-btn ${state.tool === 'pen' ? 'active' : ''}"
                        data-tool="pen" aria-label="Olovka">✏️</button>
                <button type="button" class="aufmass-tool-btn ${state.tool === 'eraser' ? 'active' : ''}"
                        data-tool="eraser" aria-label="Radirka">⬜</button>

                <span class="aufmass-tools-sep" aria-hidden="true"></span>

                <div class="aufmass-colors" role="radiogroup" aria-label="Boja">
                    ${COLORS.map(c => `
                        <button type="button" class="aufmass-color ${state.color === c.value ? 'active' : ''}"
                                data-color="${escapeHtml(c.value)}" aria-label="${escapeHtml(c.name)}"
                                style="background-color: ${escapeHtml(c.value)};"></button>
                    `).join('')}
                </div>

                <span class="aufmass-tools-sep" aria-hidden="true"></span>

                <div class="aufmass-sizes" role="radiogroup" aria-label="Debljina linije">
                    ${Object.keys(STROKE_SIZES).map(s => `
                        <button type="button" class="aufmass-size-btn ${state.strokeSize === s ? 'active' : ''}"
                                data-size="${s}" aria-label="Debljina ${s}">
                            <span class="aufmass-size-dot" style="width:${SIZE_DOT_VISUAL[s]}px;height:${SIZE_DOT_VISUAL[s]}px;"></span>
                        </button>
                    `).join('')}
                </div>

                <span class="aufmass-tools-sep" aria-hidden="true"></span>

                <button type="button" class="aufmass-tool-btn" id="aufmass-undo" aria-label="Poništi" disabled>↶</button>
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-danger" id="aufmass-clear" aria-label="Obriši sve">🗑</button>

                <span class="aufmass-tools-sep" aria-hidden="true"></span>

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

        bindToolbarEvents();
        bindCanvasEvents();
    }

    function bindToolbarEvents() {
        document.getElementById('aufmass-close').addEventListener('click', close);
        document.getElementById('aufmass-save').addEventListener('click', handleSave);
        document.getElementById('aufmass-photo-input').addEventListener('change', handlePhotoLoad);

        document.querySelectorAll('.aufmass-mode-btn').forEach(b => {
            b.addEventListener('click', () => setMode(b.getAttribute('data-mode')));
        });
        document.querySelectorAll('.aufmass-tool-btn[data-tool]').forEach(b => {
            b.addEventListener('click', () => setTool(b.getAttribute('data-tool')));
        });
        document.querySelectorAll('.aufmass-color').forEach(b => {
            b.addEventListener('click', () => setColor(b.getAttribute('data-color')));
        });
        document.querySelectorAll('.aufmass-size-btn').forEach(b => {
            b.addEventListener('click', () => setStrokeSize(b.getAttribute('data-size')));
        });

        document.getElementById('aufmass-undo').addEventListener('click', undo);
        document.getElementById('aufmass-clear').addEventListener('click', handleClear);
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

    // ----- Pozadina ----
    function redrawBg() {
        if (!bgCtx) return;
        const w = bgCanvas.clientWidth;
        const h = bgCanvas.clientHeight;
        bgCtx.clearRect(0, 0, w, h);
        bgCtx.fillStyle = '#FFFFFF';
        bgCtx.fillRect(0, 0, w, h);

        if (state.mode === 'foto') {
            if (state.bgImage) drawPhoto(state.bgImage, w, h);
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
        const scale = Math.min(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        bgCtx.drawImage(img, dx, dy, dw, dh);
    }

    // ----- Mode / tool / boja / debljina -----
    function setMode(mode) {
        if (mode !== 'karo' && mode !== 'foto') return;
        if (mode === state.mode) return;

        if (hasUnsavedDrawing()) {
            if (!window.confirm('Imate nespremljen crtež. Promjena podloge će ga izbrisati. Nastaviti?')) {
                return;
            }
        }

        state.mode = mode;
        state.bgImage = null;
        clearDrawingAndStack();

        document.querySelectorAll('.aufmass-mode-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });
        const photoLoad = document.getElementById('aufmass-photo-load');
        if (photoLoad) photoLoad.classList.toggle('hidden', mode !== 'foto');

        redrawBg();
    }

    function setTool(tool) {
        if (tool !== 'pen' && tool !== 'eraser') return;
        state.tool = tool;
        document.querySelectorAll('.aufmass-tool-btn[data-tool]').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tool') === tool);
        });
    }

    function setColor(color) {
        if (!color) return;
        state.color = color;
        document.querySelectorAll('.aufmass-color').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-color') === color);
        });
        // Ako je radirka aktivna, prebaci na olovku - korisnik je očito odabrao boju.
        if (state.tool === 'eraser') setTool('pen');
    }

    function setStrokeSize(size) {
        if (!STROKE_SIZES[size]) return;
        state.strokeSize = size;
        document.querySelectorAll('.aufmass-size-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-size') === size);
        });
    }

    // ----- Učitavanje fotografije -----
    function handlePhotoLoad(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;

        const proceed = () => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    state.bgImage = img;
                    clearDrawingAndStack();
                    redrawBg();
                };
                img.onerror = () => console.error('Aufmass: nije moguće učitati sliku');
                img.src = ev.target.result;
            };
            reader.onerror = () => console.error('Aufmass: čitanje datoteke nije uspjelo');
            reader.readAsDataURL(file);
        };

        if (hasUnsavedDrawing()) {
            if (!window.confirm('Imate nespremljen crtež. Učitavanje nove fotografije će ga izbrisati. Nastaviti?')) return;
        }
        proceed();
    }

    function clearDrawingAndStack() {
        if (drawCtx) {
            drawCtx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
        }
        state.undoStack = [];
        updateUndoButton();
        updateSpremiButton();
    }

    // ----- Resize -----
    function onResize() {
        if (!state.open) return;
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

    // ----- Crtanje (olovka / radirka) -----
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
        // Uvijek spriječi scroll/zoom dok prst dotiče platno
        if (e.cancelable) e.preventDefault();
        if (e.type === 'touchstart') startStroke(e);
        else if (e.type === 'touchmove') moveStroke(e);
        else if (e.type === 'touchend' || e.type === 'touchcancel') endStroke(e);
    }

    function handleMouse(e) {
        if (e.type === 'mousedown') {
            if (e.cancelable) e.preventDefault();
            startStroke(e);
        } else if (e.type === 'mousemove') {
            moveStroke(e);
        } else if (e.type === 'mouseup') {
            endStroke(e);
        } else if (e.type === 'mouseleave') {
            if (state.isDrawing) endStroke(e);
        }
    }

    function getPos(e) {
        if (!drawCanvas) return { x: 0, y: 0 };
        const rect = drawCanvas.getBoundingClientRect();
        let src;
        if (e.touches && e.touches.length > 0) src = e.touches[0];
        else if (e.changedTouches && e.changedTouches.length > 0) src = e.changedTouches[0];
        else src = e;
        return {
            x: src.clientX - rect.left,
            y: src.clientY - rect.top
        };
    }

    function applyStrokeStyle() {
        if (!drawCtx) return;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        if (state.tool === 'eraser') {
            drawCtx.globalCompositeOperation = 'destination-out';
            drawCtx.lineWidth = STROKE_SIZES[state.strokeSize] * ERASER_MULTIPLIER;
            drawCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.lineWidth = STROKE_SIZES[state.strokeSize];
            drawCtx.strokeStyle = state.color;
        }
    }

    function startStroke(e) {
        if (!drawCtx) return;
        // Ignoriraj multi-touch - obrađujemo samo jedan prst.
        if (e.touches && e.touches.length > 1) return;

        state.isDrawing = true;
        applyStrokeStyle();

        const pos = getPos(e);
        state.lastX = pos.x;
        state.lastY = pos.y;

        // Mali segment kako bi i jednostavni dodir ostavio točku.
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
        drawCtx.lineTo(pos.x + 0.1, pos.y + 0.1);
        drawCtx.stroke();
    }

    function moveStroke(e) {
        if (!state.isDrawing || !drawCtx) return;
        if (e.touches && e.touches.length > 1) return;

        const pos = getPos(e);
        drawCtx.beginPath();
        drawCtx.moveTo(state.lastX, state.lastY);
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();

        state.lastX = pos.x;
        state.lastY = pos.y;
    }

    function endStroke() {
        if (!state.isDrawing) return;
        state.isDrawing = false;
        // Uvijek vrati composite na default - kritično nakon radirke.
        if (drawCtx) drawCtx.globalCompositeOperation = 'source-over';
        pushUndoSnapshot();
        updateSpremiButton();
    }

    // ----- Undo -----
    function pushUndoSnapshot() {
        if (!drawCanvas) return;
        try {
            const data = drawCanvas.toDataURL('image/png');
            state.undoStack.push(data);
            if (state.undoStack.length > UNDO_MAX) {
                state.undoStack.shift();
            }
            updateUndoButton();
        } catch (err) {
            console.error('Aufmass: undo snapshot nije moguć:', err);
        }
    }

    function undo() {
        if (state.undoStack.length === 0) return;

        state.undoStack.pop();

        if (drawCtx) {
            drawCtx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
        }

        if (state.undoStack.length > 0) {
            const data = state.undoStack[state.undoStack.length - 1];
            const img = new Image();
            img.onload = () => {
                if (drawCtx) {
                    drawCtx.drawImage(img, 0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
                }
            };
            img.src = data;
        }

        updateUndoButton();
        updateSpremiButton();
    }

    function handleClear() {
        if (state.undoStack.length === 0) return;
        if (!window.confirm('Izbrisati cijeli crtež?')) return;
        clearDrawingAndStack();
    }

    function handleSave() {
        // 7c: spremanje u narudžbu. Za sada placeholder - tipka samo
        // signalizira da postoji crtež za spremiti.
    }

    function updateUndoButton() {
        const btn = document.getElementById('aufmass-undo');
        if (btn) btn.disabled = state.undoStack.length === 0;
    }

    function updateSpremiButton() {
        const btn = document.getElementById('aufmass-save');
        if (!btn) return;
        const has = hasUnsavedDrawing();
        btn.disabled = !has;
        btn.textContent = has ? 'Spremi ✓' : 'Spremi';
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
