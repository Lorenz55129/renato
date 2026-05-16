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
    const TEXT_SIZES = { S: 16, M: 22, L: 30 };
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
        lineStartX: 0,                      // 7c-1: početna točka linije
        lineStartY: 0,
        lineBaseSnapshot: null,             // 7c-1: ImageData prije linije (za live preview)
        textTapX: 0,                        // 7c-2: pozicija dodira za tekst
        textTapY: 0,
        editingSkicaId: null,               // 7c-3: id postojeće skice u edit modu
        isDirty: false,                     // 7c-3: postoji li nespremljena promjena
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
        return state.isDirty;
    }

    // ----- Otvaranje / zatvaranje -----
    function openForNarudzba(narudzbaId, skicaId) {
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
        state.lineBaseSnapshot = null;
        state.editingSkicaId = skicaId || null;
        state.isDirty = false;
        state.undoStack = [];

        buildOverlay();
        state.open = true;

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        requestAnimationFrame(() => {
            setupCanvases();
            redrawBg();

            // 7c-3: edit mod - učitaj postojeću skicu u drawCanvas i inicijaliziraj undo stack.
            if (state.editingSkicaId) {
                const skica = (n.aufmass_skice || []).find(s => s.id === state.editingSkicaId);
                if (skica && skica.imageData) {
                    const img = new Image();
                    img.onload = () => {
                        if (!drawCtx) return;
                        drawCtx.drawImage(img, 0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
                        pushUndoSnapshot();
                        updateSpremiButton();
                    };
                    img.src = skica.imageData;
                } else {
                    // Edit traženo, ali skica ne postoji - tretiraj kao nov
                    state.editingSkicaId = null;
                }
                updateSpremiButton();
            }
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
        state.lineBaseSnapshot = null;
        state.editingSkicaId = null;
        state.isDirty = false;
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
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-line ${state.tool === 'linija' ? 'active' : ''}"
                        data-tool="linija" aria-label="Linija">╱ Linija</button>
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-line ${state.tool === 'tekst' ? 'active' : ''}"
                        data-tool="tekst" aria-label="Tekst">T Tekst</button>

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
        if (tool !== 'pen' && tool !== 'eraser' && tool !== 'linija' && tool !== 'tekst') return;
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
        state.isDirty = false;
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
        const pos = getPos(e);
        state.lastX = pos.x;
        state.lastY = pos.y;

        if (state.tool === 'tekst') {
            // Tekst se ne crta na potezu - samo zapamti poziciju za endStroke.
            return;
        }

        applyStrokeStyle();

        if (state.tool === 'linija') {
            // Snimi cijeli drawCanvas kao bazu - svaki sljedeći move vraća
            // ovu bazu i preko nje crta novu liniju (živi preview bez tragova).
            state.lineStartX = pos.x;
            state.lineStartY = pos.y;
            try {
                state.lineBaseSnapshot = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
            } catch (err) {
                state.lineBaseSnapshot = null;
                console.error('Aufmass: getImageData za liniju nije moguć:', err);
            }
            return;  // Bez tap-dot-a - linija mora imati dva kraja.
        }

        // Olovka / radirka: mali segment kako bi i običan tap ostavio točku.
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
        drawCtx.lineTo(pos.x + 0.1, pos.y + 0.1);
        drawCtx.stroke();
    }

    function moveStroke(e) {
        if (!state.isDrawing || !drawCtx) return;
        if (e.touches && e.touches.length > 1) return;
        if (state.tool === 'tekst') return;   // tekst se ne crta pri pomicanju

        const pos = getPos(e);

        if (state.tool === 'linija') {
            if (state.lineBaseSnapshot) {
                drawCtx.putImageData(state.lineBaseSnapshot, 0, 0);
            }
            drawCtx.beginPath();
            drawCtx.moveTo(state.lineStartX, state.lineStartY);
            drawCtx.lineTo(pos.x, pos.y);
            drawCtx.stroke();
            state.lastX = pos.x;
            state.lastY = pos.y;
            return;
        }

        drawCtx.beginPath();
        drawCtx.moveTo(state.lastX, state.lastY);
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();
        state.lastX = pos.x;
        state.lastY = pos.y;
    }

    function endStroke(e) {
        if (!state.isDrawing) return;
        state.isDrawing = false;

        if (state.tool === 'tekst') {
            // Otvori popup na poziciji dodira - rendiranje teksta tek nakon
            // potvrde u commitText(). Ne pushaj undo ovdje.
            openTextPopup(state.lastX, state.lastY);
            if (drawCtx) drawCtx.globalCompositeOperation = 'source-over';
            return;
        }

        if (state.tool === 'linija') {
            // Finaliziraj liniju i u slučaju da korisnik nije pomaknuo prst -
            // tako tap ostavlja makar točku na startu (round cap).
            const pos = e ? getPos(e) : { x: state.lastX, y: state.lastY };
            if (state.lineBaseSnapshot && drawCtx) {
                drawCtx.putImageData(state.lineBaseSnapshot, 0, 0);
                drawCtx.beginPath();
                drawCtx.moveTo(state.lineStartX, state.lineStartY);
                drawCtx.lineTo(pos.x, pos.y);
                drawCtx.stroke();
            }
            state.lineBaseSnapshot = null;
        }

        // Uvijek vrati composite na default - kritično nakon radirke.
        if (drawCtx) drawCtx.globalCompositeOperation = 'source-over';
        pushUndoSnapshot();
        state.isDirty = true;
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
        if (state.isDirty || state.editingSkicaId) {
            openSavePopup();
        }
    }

    function formatTodayDDMMYYYY() {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mm}.${d.getFullYear()}`;
    }

    function openSavePopup() {
        closeSavePopup();
        const wrap = document.getElementById('aufmass-canvas-wrap');
        if (!wrap) return;

        // Default naziv: postojeći ako edit, inače "Skica DD.MM.YYYY"
        let defaultNaziv = '';
        if (state.editingSkicaId && window.App.Narudzbe) {
            const n = window.App.Narudzbe.getById(state.narudzbaId);
            const s = n && (n.aufmass_skice || []).find(x => x.id === state.editingSkicaId);
            if (s && s.naziv) defaultNaziv = s.naziv;
        }
        if (!defaultNaziv) defaultNaziv = 'Skica ' + formatTodayDDMMYYYY();

        const popup = document.createElement('div');
        popup.className = 'aufmass-text-popup aufmass-save-popup';
        popup.id = 'aufmass-save-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-label', 'Spremi skicu');
        popup.innerHTML = `
            <label class="aufmass-save-label" for="aufmass-save-input">Naziv skice:</label>
            <input type="text" class="aufmass-text-input aufmass-save-input" id="aufmass-save-input"
                   value="${escapeHtml(defaultNaziv)}" autocomplete="off" autocapitalize="sentences">
            <div class="aufmass-save-actions">
                <button type="button" class="aufmass-text-ok aufmass-save-ok" id="aufmass-save-ok">Spremi</button>
                <button type="button" class="aufmass-save-cancel" id="aufmass-save-cancel">Odustani</button>
            </div>
        `;
        wrap.appendChild(popup);

        const input = document.getElementById('aufmass-save-input');
        setTimeout(() => {
            if (!input) return;
            input.focus();
            input.select();
        }, 30);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSavePopup();
            }
        });

        document.getElementById('aufmass-save-ok').addEventListener('click', commitSave);
        document.getElementById('aufmass-save-cancel').addEventListener('click', closeSavePopup);
    }

    function closeSavePopup() {
        const p = document.getElementById('aufmass-save-popup');
        if (p) p.remove();
    }

    function commitSave() {
        const input = document.getElementById('aufmass-save-input');
        if (!input || !bgCanvas || !drawCanvas) { closeSavePopup(); return; }

        const naziv = (input.value || '').trim() || 'Skica';
        const narudzbaId = state.narudzbaId;
        const editingId = state.editingSkicaId;

        // Stopi pozadinu i crtež u jednu sliku, skaliranu (max 800px) i JPEG-kompresiranu
        // kako bi se izbjegla localStorage quota.
        let imageData;
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = bgCanvas.width;
            tempCanvas.height = bgCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(bgCanvas, 0, 0);
            tempCtx.drawImage(drawCanvas, 0, 0);

            const MAX = 800;
            const scale = Math.min(MAX / tempCanvas.width, MAX / tempCanvas.height, 1);
            const outW = Math.round(tempCanvas.width * scale);
            const outH = Math.round(tempCanvas.height * scale);
            const outCanvas = document.createElement('canvas');
            outCanvas.width = outW;
            outCanvas.height = outH;
            const outCtx = outCanvas.getContext('2d');
            outCtx.drawImage(tempCanvas, 0, 0, outW, outH);
            imageData = outCanvas.toDataURL('image/jpeg', 0.7);
        } catch (err) {
            console.error('Aufmass: spajanje slojeva nije uspjelo:', err);
            closeSavePopup();
            return;
        }

        // Spremi direktno u narudžbu kroz Storage.
        console.log('commitSave start, narudzbaId:', state.narudzbaId);
        const sve = window.App.Storage.load('narudzbe', []);
        const idx = sve.findIndex(n => n.id === narudzbaId);
        console.log('narudzbe geladen:', sve.length, 'gefunden:', idx);
        if (idx === -1) {
            closeSavePopup();
            return;
        }
        if (!Array.isArray(sve[idx].aufmass_skice)) {
            sve[idx].aufmass_skice = [];
        }

        if (editingId) {
            const sIdx = sve[idx].aufmass_skice.findIndex(s => s.id === editingId);
            if (sIdx !== -1) {
                sve[idx].aufmass_skice[sIdx] = Object.assign({}, sve[idx].aufmass_skice[sIdx], {
                    naziv,
                    imageData,
                    datum: new Date().toISOString()
                });
            } else {
                sve[idx].aufmass_skice.push({
                    id: window.App.Storage.generateId(),
                    naziv,
                    imageData,
                    datum: new Date().toISOString()
                });
            }
        } else {
            sve[idx].aufmass_skice.push({
                id: window.App.Storage.generateId(),
                naziv,
                imageData,
                datum: new Date().toISOString()
            });
        }

        console.log('aufmass_skice nach save:', sve[idx].aufmass_skice.length);

        // Upozorenje ako je localStorage skoro pun (> 4MB)
        try {
            const used = JSON.stringify(localStorage).length;
            if (used > 4 * 1024 * 1024) {
                alert('Upozorenje: Memorija aplikacije je skoro puna. Preporučujemo brisanje starih skica.');
            }
        } catch (e) {}

        window.App.Storage.save('narudzbe', sve);
        console.log('Storage.save fertig');

        // Označi kao čisto i zatvori overlay bez confirm-a.
        state.isDirty = false;
        closeSavePopup();
        close();

        if (window.App.Narudzbe && typeof window.App.Narudzbe.refreshDetail === 'function') {
            window.App.Narudzbe.refreshDetail(narudzbaId);
        }
    }

    function updateUndoButton() {
        const btn = document.getElementById('aufmass-undo');
        if (btn) btn.disabled = state.undoStack.length === 0;
    }

    function updateSpremiButton() {
        const btn = document.getElementById('aufmass-save');
        if (!btn) return;
        // U edit modu uvijek se može spremiti (npr. samo preimenovati);
        // u novom modu tek nakon prvog poteza.
        const canSave = state.isDirty || !!state.editingSkicaId;
        btn.disabled = !canSave;
        btn.textContent = state.isDirty ? 'Spremi ✓' : 'Spremi';
    }

    // ----- Tekst popup (7c-2) -----
    function openTextPopup(x, y) {
        closeTextPopup();

        const wrap = document.getElementById('aufmass-canvas-wrap');
        if (!wrap) return;

        state.textTapX = x;
        state.textTapY = y;

        const popup = document.createElement('div');
        popup.className = 'aufmass-text-popup';
        popup.id = 'aufmass-text-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Unesi tekst');
        popup.innerHTML = `
            <input type="text" class="aufmass-text-input" id="aufmass-text-input"
                   placeholder="Unesite tekst..." autocomplete="off" autocapitalize="sentences">
            <button type="button" class="aufmass-text-ok" id="aufmass-text-ok">OK</button>
            <button type="button" class="aufmass-text-cancel" id="aufmass-text-cancel" aria-label="Odustani">✕</button>
        `;
        wrap.appendChild(popup);

        // Rubni ispravak: minimalno MARGIN od svih strana wrap-a.
        const MARGIN = 10;
        const wrapW = wrap.clientWidth;
        const wrapH = wrap.clientHeight;
        const popupW = popup.offsetWidth;
        const popupH = popup.offsetHeight;

        let left = x;
        let top = y;
        if (left + popupW > wrapW - MARGIN) left = wrapW - popupW - MARGIN;
        if (top + popupH > wrapH - MARGIN) top = wrapH - popupH - MARGIN;
        if (left < MARGIN) left = MARGIN;
        if (top < MARGIN) top = MARGIN;
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';

        const input = document.getElementById('aufmass-text-input');
        setTimeout(() => { if (input) input.focus(); }, 30);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitText();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeTextPopup();
            }
        });

        document.getElementById('aufmass-text-ok').addEventListener('click', commitText);
        document.getElementById('aufmass-text-cancel').addEventListener('click', closeTextPopup);
    }

    function commitText() {
        const input = document.getElementById('aufmass-text-input');
        if (!input) { closeTextPopup(); return; }
        const text = input.value;
        if (text && text.trim()) {
            drawText(text, state.textTapX, state.textTapY);
            pushUndoSnapshot();
            state.isDirty = true;
            updateSpremiButton();
        }
        closeTextPopup();
    }

    function closeTextPopup() {
        const p = document.getElementById('aufmass-text-popup');
        if (p) p.remove();
    }

    function drawText(text, x, y) {
        if (!drawCtx) return;
        const size = TEXT_SIZES[state.strokeSize] || TEXT_SIZES.M;
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.fillStyle = state.color;
        drawCtx.font = size + 'px sans-serif';
        drawCtx.textBaseline = 'top';
        drawCtx.fillText(text, x, y);
    }

    // ----- Init i javni API -----
    function init() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('aufmass-save-popup')) {
                closeSavePopup();
                return;
            }
            if (document.getElementById('aufmass-text-popup')) {
                closeTextPopup();
                return;
            }
            if (state.open) close();
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
