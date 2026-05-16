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
    const UNDO_MAX = 20;

    const state = {
        open: false,
        narudzbaId: null,
        narudzbaNaziv: '',
        mode: 'karo',                       // 'karo' | 'foto'
        bgImage: null,
        fotoDataUrl: null,                  // Phase 4: kompresirani JPEG za foto pozadinu
        legacyMode: false,                  // Phase 4: skica je u starom formatu (samo bitmap)
        legacyImageData: null,              // Phase 4: bitmap iz legacy skice (za migraciju pri save)
        tool: 'pen',                        // 'pen' | 'linija' | 'tekst' | 'kota'
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
        kotaEndX: 0,                        // Kota: kraj zadnjeg poteza (za commit nakon popupa)
        kotaEndY: 0,
        editingSkicaId: null,               // 7c-3: id postojeće skice u edit modu
        isDirty: false,                     // 7c-3: postoji li nespremljena promjena
        elements: [],                       // Phase 2: objektni model - jedini izvor istine za crtež
        currentElement: null,               // build buffer za stift tijekom poteza
        elementsHistory: []                 // undo povijest (snapshot-i state.elements)
    };

    let bgCanvas = null;
    let drawCanvas = null;
    let bgCtx = null;
    let drawCtx = null;

    // Phase 4: keširanje Image objekata za legacy-bitmap elemente (po el.id).
    // Drži se izvan state-a jer Image nije serijalizabilan u JSON.
    const imageCache = new Map();

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

    function generateElementId() {
        return 'el-' + Math.random().toString(36).slice(2, 9);
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
        state.fotoDataUrl = null;
        state.legacyMode = false;
        state.legacyImageData = null;
        state.tool = 'pen';
        state.color = DEFAULT_COLOR;
        state.strokeSize = DEFAULT_STROKE_SIZE;
        state.isDrawing = false;
        state.lineBaseSnapshot = null;
        state.editingSkicaId = skicaId || null;
        state.isDirty = false;
        state.elements = [];
        imageCache.clear();
        state.currentElement = null;
        state.elementsHistory = [];

        buildOverlay();
        state.open = true;

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        requestAnimationFrame(() => {
            setupCanvases();

            // Phase 4: edit-mod loading
            if (state.editingSkicaId) {
                const skica = (n.aufmass_skice || []).find(s => s.id === state.editingSkicaId);

                if (skica && Array.isArray(skica.elements)) {
                    // Novi format - objekt-baziran
                    state.elements = skica.elements.slice();
                    state.mode = skica.bgMode === 'foto' ? 'foto' : 'karo';
                    syncModeToggleUI();

                    if (state.mode === 'foto' && skica.bgFoto) {
                        loadFotoFromDataUrl(skica.bgFoto).then(() => {
                            redrawBg();
                            renderElements();
                            pushUndoSnapshot();
                            updateSpremiButton();
                        });
                    } else {
                        redrawBg();
                        renderElements();
                        pushUndoSnapshot();
                        updateSpremiButton();
                    }
                } else if (skica && skica.imageData) {
                    // Legacy: samo bitmap. Onemogući alate i prikaži banner.
                    state.legacyMode = true;
                    state.legacyImageData = skica.imageData;
                    state.elements = [];
                    redrawBg();
                    const img = new Image();
                    img.onload = () => {
                        if (!drawCtx) return;
                        drawCtx.drawImage(img, 0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
                        pushUndoSnapshot();
                        updateSpremiButton();
                    };
                    img.src = skica.imageData;
                    showLegacyWarning();
                } else {
                    // skica ne postoji - tretiraj kao nov
                    state.editingSkicaId = null;
                    redrawBg();
                    renderElements();
                    pushUndoSnapshot();
                }
            } else {
                redrawBg();
                renderElements();
                pushUndoSnapshot();
            }
        });
    }

    function syncModeToggleUI() {
        document.querySelectorAll('.aufmass-mode-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === state.mode);
        });
        const photoLoad = document.getElementById('aufmass-photo-load');
        if (photoLoad) photoLoad.classList.toggle('hidden', state.mode !== 'foto');
    }

    function loadFotoFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                state.bgImage = img;
                state.fotoDataUrl = dataUrl;
                resolve();
            };
            img.onerror = () => resolve();
            img.src = dataUrl;
        });
    }

    function showLegacyWarning() {
        const ov = document.getElementById('aufmass-overlay');
        if (ov) ov.classList.add('aufmass-legacy');
        const banner = document.getElementById('aufmass-legacy-banner');
        if (banner) banner.classList.remove('hidden');
    }

    function hideLegacyWarning() {
        const ov = document.getElementById('aufmass-overlay');
        if (ov) ov.classList.remove('aufmass-legacy');
        const banner = document.getElementById('aufmass-legacy-banner');
        if (banner) banner.classList.add('hidden');
    }

    function close() {
        if (hasUnsavedDrawing()) {
            if (!window.confirm('Imate nespremljen crtež. Zatvoriti bez spremanja?')) return;
        }
        const ov = document.getElementById('aufmass-overlay');
        if (ov) ov.remove();
        state.open = false;
        state.bgImage = null;
        state.fotoDataUrl = null;
        state.legacyMode = false;
        state.legacyImageData = null;
        state.isDrawing = false;
        state.lineBaseSnapshot = null;
        state.editingSkicaId = null;
        state.isDirty = false;
        state.elements = [];
        imageCache.clear();
        state.currentElement = null;
        state.elementsHistory = [];
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

            <div class="aufmass-legacy-banner hidden" id="aufmass-legacy-banner" role="status">
                ⚠️ Stara skica - nije moguće uređivanje. Pritisni Spremi za pretvaranje u novi format.
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
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-line ${state.tool === 'linija' ? 'active' : ''}"
                        data-tool="linija" aria-label="Linija">╱ Linija</button>
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-line ${state.tool === 'tekst' ? 'active' : ''}"
                        data-tool="tekst" aria-label="Tekst">T Tekst</button>
                <button type="button" class="aufmass-tool-btn aufmass-tool-btn-line ${state.tool === 'kota' ? 'active' : ''}"
                        data-tool="kota" aria-label="Kota">↔ Kota</button>

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
        if (tool !== 'pen' && tool !== 'linija' && tool !== 'tekst' && tool !== 'kota') return;
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
            compressFotoFile(file).then(dataUrl => {
                const img = new Image();
                img.onload = () => {
                    state.bgImage = img;
                    state.fotoDataUrl = dataUrl;   // Phase 4: spremi za save
                    clearDrawingAndStack();
                    redrawBg();
                };
                img.onerror = () => console.error('Aufmass: nije moguće učitati sliku');
                img.src = dataUrl;
            }).catch(err => console.error('Aufmass: kompresija fotografije:', err));
        };

        if (hasUnsavedDrawing()) {
            if (!window.confirm('Imate nespremljen crtež. Učitavanje nove fotografije će ga izbrisati. Nastaviti?')) return;
        }
        proceed();
    }

    // Phase 4: kompresija foto datoteke (max 800px, JPEG 0.7)
    function compressFotoFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const MAX = 800;
                    const scale = Math.min(MAX / img.width, MAX / img.height, 1);
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const c = document.createElement('canvas');
                    c.width = w;
                    c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = ev.target.result;
            };
            reader.onerror = () => reject(new Error('Read failed'));
            reader.readAsDataURL(file);
        });
    }

    function clearDrawingAndStack() {
        state.elements = [];
        state.currentElement = null;
        state.elementsHistory = [];
        state.isDirty = false;
        state.lineBaseSnapshot = null;
        closeKotaPopup();
        closeTextPopup();
        renderElements();
        pushUndoSnapshot();  // baseline za buduće undo
        updateUndoButton();
        updateSpremiButton();
    }

    // ----- Resize -----
    function onResize() {
        if (!state.open) return;
        setupCanvases();
        redrawBg();
        // Phase 2: ponovo nacrtaj iz objektnog modela; koordinate su iste
        // (CSS px), pa elementi sjedaju na svoja mjesta.
        renderElements();
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
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.lineWidth = STROKE_SIZES[state.strokeSize];
        drawCtx.strokeStyle = state.color;
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

        if (state.tool === 'kota') {
            // Kota: snimi bazu i zapamti početak. drawKota interno upravlja
            // ctx state-om (save/restore) pa applyStrokeStyle nije potreban.
            state.lineStartX = pos.x;
            state.lineStartY = pos.y;
            try {
                state.lineBaseSnapshot = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
            } catch (err) {
                state.lineBaseSnapshot = null;
                console.error('Aufmass: getImageData za kotu nije moguć:', err);
            }
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

        // Phase 1: paralelno tracking - samo za olovku (radirka ide u Phase 3)
        if (state.tool === 'pen') {
            state.currentElement = {
                id: generateElementId(),
                type: 'stift',
                color: state.color,
                size: state.strokeSize,
                points: [{ x: pos.x, y: pos.y }]
            };
        }
    }

    function moveStroke(e) {
        if (!state.isDrawing || !drawCtx) return;
        if (e.touches && e.touches.length > 1) return;
        if (state.tool === 'tekst') return;   // tekst se ne crta pri pomicanju

        const pos = getPos(e);

        if (state.tool === 'kota') {
            if (state.lineBaseSnapshot) {
                drawCtx.putImageData(state.lineBaseSnapshot, 0, 0);
            }
            drawKota(drawCtx, state.lineStartX, state.lineStartY, pos.x, pos.y, '', state.color, state.strokeSize);
            state.lastX = pos.x;
            state.lastY = pos.y;
            return;
        }

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

        // Phase 1: dodaj točku u trenutni element (samo olovka)
        if (state.tool === 'pen' && state.currentElement) {
            state.currentElement.points.push({ x: pos.x, y: pos.y });
        }
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

        if (state.tool === 'kota') {
            // Komitirana scena + preview kote dok je popup otvoren.
            const pos = e ? getPos(e) : { x: state.lastX, y: state.lastY };
            state.lineBaseSnapshot = null;
            state.kotaEndX = pos.x;
            state.kotaEndY = pos.y;
            renderElements();
            if (drawCtx) {
                drawKota(drawCtx, state.lineStartX, state.lineStartY, pos.x, pos.y, '', state.color, state.strokeSize);
            }
            const dx = pos.x - state.lineStartX;
            const dy = pos.y - state.lineStartY;
            const pixelDist = Math.round(Math.sqrt(dx * dx + dy * dy));
            openKotaPopup(state.lineStartX, state.lineStartY, pos.x, pos.y, pixelDist);
            if (drawCtx) drawCtx.globalCompositeOperation = 'source-over';
            return;  // commit/cancel u popupu rade renderElements + pushUndoSnapshot
        }

        if (state.tool === 'linija') {
            const pos = e ? getPos(e) : { x: state.lastX, y: state.lastY };
            state.lineBaseSnapshot = null;
            state.elements.push({
                id: generateElementId(),
                type: 'linija',
                color: state.color,
                size: state.strokeSize,
                points: [
                    { x: state.lineStartX, y: state.lineStartY },
                    { x: pos.x, y: pos.y }
                ]
            });
        }

        if (state.tool === 'pen' && state.currentElement) {
            state.elements.push(state.currentElement);
            state.currentElement = null;
        }

        if (drawCtx) drawCtx.globalCompositeOperation = 'source-over';
        renderElements();
        pushUndoSnapshot();
        state.isDirty = true;
        updateSpremiButton();
    }

    // ----- Undo (Phase 2: samo elements-povijest, bez bitmap snapshot-a) -----
    function pushUndoSnapshot() {
        state.elementsHistory = state.elementsHistory || [];
        state.elementsHistory.push(state.elements.slice());
        if (state.elementsHistory.length > UNDO_MAX) {
            state.elementsHistory.shift();
        }
        updateUndoButton();
    }

    function undo() {
        if (!state.elementsHistory || state.elementsHistory.length <= 1) return;

        state.elementsHistory.pop();
        const prev = state.elementsHistory[state.elementsHistory.length - 1] || [];
        state.elements = prev.slice();
        renderElements();

        updateUndoButton();
        updateSpremiButton();
    }

    function handleClear() {
        if (state.elements.length === 0) return;
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

        // Phase 4: thumbnail (200px max, JPEG 0.6) - bg + draw merged.
        let thumbnail;
        try {
            const merged = document.createElement('canvas');
            merged.width = drawCanvas.width;
            merged.height = drawCanvas.height;
            const mctx = merged.getContext('2d');
            mctx.drawImage(bgCanvas, 0, 0);
            mctx.drawImage(drawCanvas, 0, 0);

            const THUMB_MAX = 200;
            const tscale = Math.min(THUMB_MAX / merged.width, THUMB_MAX / merged.height, 1);
            const tw = Math.max(1, Math.round(merged.width * tscale));
            const th = Math.max(1, Math.round(merged.height * tscale));
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = tw;
            thumbCanvas.height = th;
            thumbCanvas.getContext('2d').drawImage(merged, 0, 0, tw, th);
            thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);
        } catch (err) {
            console.error('Aufmass: thumbnail nije uspio:', err);
            thumbnail = null;
        }

        // Phase 4: za migraciju legacy skice - originalna bitmapa postaje
        // jedan legacy-bitmap element. Novi elementi (ako ih je korisnik dodao
        // nakon migracije) idu iza njega.
        let elementsToSave = state.elements.slice();
        if (state.legacyMode && state.legacyImageData) {
            elementsToSave = [{
                id: generateElementId(),
                type: 'legacy-bitmap',
                imageData: state.legacyImageData,
                x: 0,
                y: 0,
                w: drawCanvas.clientWidth,
                h: drawCanvas.clientHeight
            }].concat(state.elements);
        }

        const skicaData = {
            id: editingId || window.App.Storage.generateId(),
            naziv,
            datum: new Date().toISOString(),
            elements: elementsToSave,
            bgMode: state.mode,
            bgFoto: state.mode === 'foto' ? state.fotoDataUrl : null,
            canvasW: drawCanvas.width,
            canvasH: drawCanvas.height,
            thumbnail: thumbnail
        };

        const sve = window.App.Storage.load('narudzbe', []);
        const idx = sve.findIndex(n => n.id === narudzbaId);
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
                sve[idx].aufmass_skice[sIdx] = skicaData;
            } else {
                sve[idx].aufmass_skice.push(skicaData);
            }
        } else {
            sve[idx].aufmass_skice.push(skicaData);
        }

        // Upozorenje ako je localStorage skoro pun (> 4MB)
        try {
            const used = JSON.stringify(localStorage).length;
            if (used > 4 * 1024 * 1024) {
                alert('Upozorenje: Memorija aplikacije je skoro puna. Preporučujemo brisanje starih skica.');
            }
        } catch (e) {}

        window.App.Storage.save('narudzbe', sve);

        // Označi kao čisto i zatvori overlay bez confirm-a.
        state.isDirty = false;
        state.legacyMode = false;
        closeSavePopup();
        close();

        if (window.App.Narudzbe && typeof window.App.Narudzbe.refreshDetail === 'function') {
            window.App.Narudzbe.refreshDetail(narudzbaId);
        }
    }

    function updateUndoButton() {
        const btn = document.getElementById('aufmass-undo');
        if (!btn) return;
        // Baseline (prvi push pri otvaranju) je length===1; tek od 2 ima što popovati.
        btn.disabled = !state.elementsHistory || state.elementsHistory.length <= 1;
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
            state.elements.push({
                id: generateElementId(),
                type: 'tekst',
                color: state.color,
                size: state.strokeSize,
                x: state.textTapX,
                y: state.textTapY,
                text: text
            });
            renderElements();
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

    // ----- Phase 2: master render iz state.elements -----
    function renderElements() {
        if (!drawCtx || !drawCanvas) return;
        drawCtx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
        for (let i = 0; i < state.elements.length; i++) {
            renderElement(state.elements[i]);
        }
    }

    function renderElement(el) {
        if (!drawCtx || !el) return;
        drawCtx.save();
        drawCtx.strokeStyle = el.color;
        drawCtx.fillStyle = el.color;
        drawCtx.lineWidth = STROKE_SIZES[el.size] || 2;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.globalCompositeOperation = 'source-over';

        if (el.type === 'stift') {
            const pts = el.points || [];
            if (pts.length === 1) {
                drawCtx.beginPath();
                drawCtx.arc(pts[0].x, pts[0].y, drawCtx.lineWidth / 2, 0, Math.PI * 2);
                drawCtx.fill();
            } else if (pts.length > 1) {
                drawCtx.beginPath();
                drawCtx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    drawCtx.lineTo(pts[i].x, pts[i].y);
                }
                drawCtx.stroke();
            }
        } else if (el.type === 'linija') {
            const pts = el.points || [];
            if (pts.length >= 2) {
                drawCtx.beginPath();
                drawCtx.moveTo(pts[0].x, pts[0].y);
                drawCtx.lineTo(pts[1].x, pts[1].y);
                drawCtx.stroke();
            }
        } else if (el.type === 'tekst') {
            const size = TEXT_SIZES[el.size] || TEXT_SIZES.M;
            drawCtx.font = size + 'px sans-serif';
            drawCtx.textBaseline = 'top';
            drawCtx.fillText(el.text || '', el.x, el.y);
        } else if (el.type === 'kota') {
            drawKota(drawCtx, el.x1, el.y1, el.x2, el.y2, el.text, el.color, el.size);
        } else if (el.type === 'legacy-bitmap') {
            // Phase 4: stara skica je sad jedan element. Image se kešira po el.id.
            let img = imageCache.get(el.id);
            if (!img) {
                img = new Image();
                img.onload = () => renderElements();
                img.src = el.imageData;
                imageCache.set(el.id, img);
            }
            if (img.complete && img.naturalWidth > 0) {
                drawCtx.drawImage(img, el.x || 0, el.y || 0,
                    el.w || drawCanvas.clientWidth,
                    el.h || drawCanvas.clientHeight);
            }
        }

        drawCtx.restore();
    }

    // ----- Kota (kotirana linija s strelicama i tekstom mjere) -----
    function drawArrow(ctx, fromX, fromY, toX, toY, size) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - size * Math.cos(angle - Math.PI / 6),
            toY - size * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            toX - size * Math.cos(angle + Math.PI / 6),
            toY - size * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
    }

    function drawKota(ctx, x1, y1, x2, y2, text, color, sizeKey) {
        const ARROW = 10;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        drawArrow(ctx, x2, y2, x1, y1, ARROW);
        drawArrow(ctx, x1, y1, x2, y2, ARROW);

        if (text) {
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const size = TEXT_SIZES[sizeKey] || 18;
            ctx.font = `bold ${size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(mx - tw / 2 - 3, my - size - 3, tw + 6, size + 4);
            ctx.fillStyle = color;
            ctx.fillText(text, mx, my - 2);
        }

        ctx.restore();
    }

    function openKotaPopup(x1, y1, x2, y2, pixelDist) {
        closeKotaPopup();
        closeTextPopup();

        const wrap = document.getElementById('aufmass-canvas-wrap');
        if (!wrap) return;

        const popup = document.createElement('div');
        popup.className = 'aufmass-text-popup aufmass-kota-popup';
        popup.id = 'aufmass-kota-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-label', 'Unesi mjeru');
        popup.innerHTML = `
            <label class="aufmass-kota-label" for="aufmass-kota-input">Mjera:</label>
            <input type="text" class="aufmass-text-input aufmass-kota-input" id="aufmass-kota-input"
                   value="${pixelDist} mm" autocomplete="off">
            <button type="button" class="aufmass-text-ok" id="aufmass-kota-ok">OK</button>
            <button type="button" class="aufmass-text-cancel" id="aufmass-kota-cancel" aria-label="Odustani">✕</button>
        `;
        wrap.appendChild(popup);

        // Pozicija: sredina kote, s rubnim ispravkom prema wrap-u.
        const MARGIN = 10;
        const wrapW = wrap.clientWidth;
        const wrapH = wrap.clientHeight;
        const popupW = popup.offsetWidth;
        const popupH = popup.offsetHeight;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        let left = cx - popupW / 2;
        let top = cy - popupH / 2;
        if (left + popupW > wrapW - MARGIN) left = wrapW - popupW - MARGIN;
        if (top + popupH > wrapH - MARGIN) top = wrapH - popupH - MARGIN;
        if (left < MARGIN) left = MARGIN;
        if (top < MARGIN) top = MARGIN;
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';

        const input = document.getElementById('aufmass-kota-input');
        setTimeout(() => {
            if (!input) return;
            input.focus();
            input.select();
        }, 30);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitKota();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelKota();
            }
        });

        document.getElementById('aufmass-kota-ok').addEventListener('click', commitKota);
        document.getElementById('aufmass-kota-cancel').addEventListener('click', cancelKota);
    }

    function commitKota() {
        const input = document.getElementById('aufmass-kota-input');
        const text = input ? (input.value || '').trim() : '';

        state.lineBaseSnapshot = null;
        state.elements.push({
            id: generateElementId(),
            type: 'kota',
            color: state.color,
            size: state.strokeSize,
            x1: state.lineStartX,
            y1: state.lineStartY,
            x2: state.kotaEndX,
            y2: state.kotaEndY,
            text: text
        });
        closeKotaPopup();
        renderElements();
        pushUndoSnapshot();
        state.isDirty = true;
        updateSpremiButton();
    }

    function cancelKota() {
        // Otkažeš kotu - element se ne dodaje. Samo re-render sa
        // postojećim elementima briše preview-liniju.
        state.lineBaseSnapshot = null;
        closeKotaPopup();
        renderElements();
    }

    function closeKotaPopup() {
        const p = document.getElementById('aufmass-kota-popup');
        if (p) p.remove();
    }

    // ----- Init i javni API -----
    function init() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('aufmass-save-popup')) {
                closeSavePopup();
                return;
            }
            if (document.getElementById('aufmass-kota-popup')) {
                cancelKota();
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
