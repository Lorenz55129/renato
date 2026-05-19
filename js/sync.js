(function () {
    'use strict';

    const TABLES = ['kupci', 'narudzbe', 'ponude', 'termini', 'edukacije'];

    let syncStatus = 'idle';
    let lastSync = null;
    let listeners = [];
    let isProcessing = false;

    function setStatus(status, info) {
        syncStatus = status;
        listeners.forEach(l => l(status, info));
    }

    function onStatusChange(fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(l => l !== fn); };
    }

    function getStatus() { return syncStatus; }

    // ----- Read-sync: Server → IndexedDB -----
    async function syncFromServer() {
        if (!navigator.onLine) {
            setStatus('offline');
            return { ok: false, reason: 'offline' };
        }

        // SAFETY 1: Queue nije prazna → ne smijemo pregaziti lokalne promjene
        const pendingCount = await getPendingCount();
        if (pendingCount > 0) {
            console.warn('Read-Sync preskočen: ' + pendingCount + ' promjena čeka slanje na server.');
            setStatus('idle');
            return { ok: false, reason: 'pending_changes' };
        }

        // SAFETY 2: Lokalno više zapisa nego na serveru → ne smijemo pregaziti
        setStatus('syncing');
        const serverData = {};
        const conflicts = [];
        try {
            for (const t of TABLES) {
                const data = await App.Api.apiCall('GET', '/' + t);
                serverData[t] = data;
                const localCount = await App.DB.db.table(t).count();
                if (localCount > data.length) {
                    conflicts.push({ table: t, local: localCount, server: data.length });
                }
            }
        } catch (err) {
            console.error('Sync greška pri dohvatu:', err);
            setStatus('error', { error: err.message });
            return { ok: false, reason: err.message };
        }

        if (conflicts.length > 0) {
            console.error('Read-Sync ABORTED – lokalno više podataka nego na serveru:', conflicts);
            console.warn('Pokreni App.Sync.forcePushAll() za spas lokalnih podataka.');
            setStatus('idle');
            return { ok: false, reason: 'local_data_not_synced', conflicts };
        }

        // Sve ok – zapiši server podatke lokalno
        try {
            for (const t of TABLES) {
                await App.DB.saveAll(t, serverData[t]);
            }

            // Katalog materijala – upload-only, ne ide kroz queue, sinkronizira se ovdje
            try {
                const katalog = await App.Api.apiCall('GET', '/materijali/katalog');
                await App.DB.saveAll('materijali_katalog', katalog);
                console.info('[Sync] Katalog: ' + katalog.length + ' stavki');
            } catch (ke) {
                console.warn('[Sync] Katalog sync preskočen:', ke.message);
            }

            // Pozicije materijala – direktni API pozivi, sinkroniziraju se kao read-only cache
            try {
                const positions = await App.Api.apiCall('GET', '/materijali/positions');
                await App.DB.saveAll('narudzba_materijali', positions);
                console.info('[Sync] Pozicije materijala: ' + positions.length);
            } catch (pe) {
                console.warn('[Sync] Pozicije sync preskočene:', pe.message);
            }

            await App.Storage.initCache();

            lastSync = new Date().toISOString();
            await App.DB.db.meta.put({ key: 'last_sync', value: lastSync });

            setStatus('idle', { lastSync });
            console.info('Sync: završen u', lastSync);
            return { ok: true, lastSync };
        } catch (err) {
            console.error('Sync greška pri pisanju:', err);
            setStatus('error', { error: err.message });
            return { ok: false, reason: err.message };
        }
    }

    async function getLastSync() {
        const row = await App.DB.db.meta.get('last_sync');
        return row ? row.value : null;
    }

    // ----- Write-sync: IndexedDB → Server -----
    async function enqueueChange(change) {
        console.log('[enqueueChange] START:', change.table, change.action, change.record_id);
        const newId = await App.DB.db.sync_queue.add({
            table:      change.table,
            record_id:  change.record_id,
            action:     change.action,
            record:     change.record,
            timestamp:  new Date().toISOString(),
            status:     'pending',
            retries:    0,
            last_error: null
        });
        const verify = await App.DB.db.sync_queue.get(newId);
        console.log('[enqueueChange] Added id=' + newId + ' verify:', verify ? verify.status : 'NOT FOUND');
        await updatePendingIndicator();
    }

    async function processQueue() {
        console.log('[processQueue] CALLED. isProcessing=' + isProcessing + ' online=' + navigator.onLine);
        if (isProcessing) return;
        if (!navigator.onLine) { setStatus('offline'); return; }

        const allItems = await App.DB.db.sync_queue.toArray();
        const pending = allItems.filter(i => i.status === 'pending' || i.status === 'failed');

        console.log('[processQueue] Pending items:', pending.length, pending.map(i => i.table + ':' + i.action));
        if (!pending.length) return;

        isProcessing = true;
        setStatus('syncing');

        let anySuccess = false;
        let anyFailed = false;
        try {
            for (const item of pending) {
                console.log('[Item] Start:', JSON.stringify({ id: item.id, table: item.table, action: item.action, record_id: item.record_id, status: item.status }));
                let success = false;
                try {
                    await App.DB.db.sync_queue.update(item.id, { status: 'syncing' });

                    if (item.action === 'put') {
                        console.log('[Item] Calling API: POST /' + item.table + '/bulk', JSON.stringify(item.record).slice(0, 120));
                        const resp = await App.Api.apiCall('POST', '/' + item.table + '/bulk', [item.record]);
                        console.log('[Item] API response:', JSON.stringify(resp));
                        if (resp && typeof resp.imported === 'number' && resp.imported >= 1) {
                            success = true;
                        } else {
                            throw new Error('Bulk potvrda neuspješna: ' + JSON.stringify(resp));
                        }
                    } else if (item.action === 'delete') {
                        console.log('[Item] Calling API: DELETE /' + item.table + '/' + item.record_id);
                        const resp = await App.Api.apiCall('DELETE', '/' + item.table + '/' + item.record_id);
                        console.log('[Item] API response:', JSON.stringify(resp));
                        if (resp && resp.ok) {
                            success = true;
                        } else {
                            throw new Error('Delete potvrda neuspješna: ' + JSON.stringify(resp));
                        }
                    }

                    console.log('[Item] success flag:', success);
                    if (!success) {
                        throw new Error('Success flag ostao false – nepoznata akcija: ' + item.action);
                    }

                    console.log('[Item] DELETING from queue:', item.id);
                    await App.DB.db.sync_queue.delete(item.id);
                    anySuccess = true;
                    console.log('[Item] Queue delete done for id:', item.id);
                } catch (err) {
                    console.error('[Item] FAILED:', item.id, item.table, item.action, err.message);
                    await App.DB.db.sync_queue.update(item.id, {
                        status:     'failed',
                        retries:    (item.retries || 0) + 1,
                        last_error: err.message
                    });
                    anyFailed = true;
                }
            }
        } finally {
            isProcessing = false;
        }

        await updatePendingIndicator();
        // Read-Sync se NE poziva ovdje – samo na Login i na manual "Sinkronizacija sad"
        setStatus(anyFailed && !anySuccess ? 'error' : 'idle');
    }

    async function getPendingCount() {
        const all = await App.DB.db.sync_queue.toArray();
        return all.filter(i => i.status === 'pending' || i.status === 'failed' || i.status === 'syncing').length;
    }

    async function updatePendingIndicator() {
        const count = await getPendingCount();
        // Ažuriraj UI direktno (listeners dobivaju pending count)
        listeners.forEach(l => l(syncStatus, { pendingCount: count }));
        updateSyncIndicator();
    }

    // ----- Sync-status indikator (UI) -----
    async function updateSyncIndicator(status) {
        const el = document.getElementById('sync-indicator');
        if (!el) return;
        const label = el.querySelector('.sync-label');
        const s = status || syncStatus;
        const pending = await getPendingCount();

        el.className = 'sync-indicator sync-' + s;
        const labels = {
            idle:    pending > 0 ? 'Čeka (' + pending + ')' : 'Online',
            syncing: pending > 0 ? 'Sync (' + pending + ')' : 'Sync...',
            error:   'Greška' + (pending > 0 ? ' (' + pending + ')' : ''),
            offline: pending > 0 ? 'Offline (' + pending + ')' : 'Offline'
        };
        if (label) label.textContent = labels[s] || s;
    }

    onStatusChange(function (status) { updateSyncIndicator(status); });
    document.addEventListener('DOMContentLoaded', function () { updateSyncIndicator(); });

    // ----- Online/Offline events -----
    window.addEventListener('online', function () {
        setStatus('idle');
        processQueue();
    });
    window.addEventListener('offline', function () { setStatus('offline'); });

    // Periodični retry svakih 30s za failed stavke
    setInterval(function () {
        if (navigator.onLine) processQueue();
    }, 30000);

    // ----- Inicijalna migracija: lokalni podaci → Server -----
    async function pushInitialMigration(migratedData) {
        if (!migratedData || Object.keys(migratedData).length === 0) {
            return { ok: true, uploaded: 0 };
        }

        if (!navigator.onLine) {
            console.warn('Offline – migracija se šalje pri sljedećem spajanju.');
            for (const [table, records] of Object.entries(migratedData)) {
                for (const record of records) {
                    await enqueueChange({ table, record_id: record.id, action: 'put', record });
                }
            }
            return { ok: false, reason: 'offline', queued: true };
        }

        setStatus('syncing');
        let totalUploaded = 0;
        try {
            for (const [table, records] of Object.entries(migratedData)) {
                if (!records.length) continue;
                await App.Api.apiCall('POST', '/' + table + '/bulk', records);
                totalUploaded += records.length;
                console.info('Migration: ' + records.length + ' ' + table + ' → Server.');
            }
            localStorage.setItem('renato_migration_completed', new Date().toISOString());
            setStatus('idle');
            return { ok: true, uploaded: totalUploaded };
        } catch (err) {
            console.error('Migration upload fehlgeschlagen:', err);
            // Fallback: u Queue za kasniji retry
            for (const [table, records] of Object.entries(migratedData)) {
                for (const record of records) {
                    await enqueueChange({ table, record_id: record.id, action: 'put', record });
                }
            }
            setStatus('error', { error: err.message });
            return { ok: false, reason: err.message };
        }
    }

    // ----- Meta info za Više ekran -----
    async function updateMetaInfo() {
        const migEl = document.getElementById('meta-migration');
        const syncEl = document.getElementById('meta-lastsync');
        if (!migEl && !syncEl) return;

        const migration = await App.DB.db.meta.get('migrated_from_localstorage');
        const lastSyncVal = await getLastSync();

        const fmt = (iso) => {
            if (!iso) return '—';
            const d = new Date(iso);
            return d.toLocaleDateString('hr-HR') + ' ' + d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
        };

        if (migEl) migEl.textContent = migration
            ? fmt(migration.timestamp) + ' (' + (migration.totalRecords || 0) + ' zap.)'
            : '—';
        if (syncEl) syncEl.textContent = fmt(lastSyncVal);
    }

    document.addEventListener('module:shown', function (e) {
        if (e.detail.module === 'vise') updateMetaInfo();
    });

    // ----- Nužna rettungsfunktion: Force-push svih lokalnih podataka na server -----
    async function forcePushAll() {
        const results = {};
        for (const t of TABLES) {
            try {
                const local = await App.DB.db.table(t).toArray();
                if (local.length === 0) {
                    results[t] = { local: 0, pushed: 0, success: true };
                    continue;
                }
                console.log('[forcePushAll]', t, ': uploading', local.length, 'records');
                const resp = await App.Api.apiCall('POST', '/' + t + '/bulk', local);
                results[t] = { local: local.length, pushed: resp.imported || 0, success: (resp.imported || 0) >= local.length };
                console.log('[forcePushAll]', t, ':', resp.imported, 'imported');
            } catch (err) {
                results[t] = { local: '?', pushed: 0, success: false, error: err.message };
                console.error('[forcePushAll]', t, 'failed:', err.message);
            }
        }
        console.table(results);
        return results;
    }

    // ----- Dijagnostika (DevTools: App.Sync.diagnose()) -----
    async function diagnose() {
        const local = {};
        for (const t of TABLES) {
            local[t] = (await App.DB.db[t].toArray()).length;
        }
        const queue = await App.DB.db.sync_queue.toArray();
        const meta  = await App.DB.db.meta.toArray();

        const server = {};
        for (const t of TABLES) {
            try {
                const data = await App.Api.apiCall('GET', '/' + t);
                server[t] = data.length;
            } catch (e) {
                server[t] = 'ERROR: ' + e.message;
            }
        }

        const rows = {};
        for (const t of TABLES) {
            rows[t] = { local: local[t], server: server[t] };
        }
        console.table(rows);
        console.log('[Sync] Queue (' + queue.length + '):', queue);
        console.log('[Sync] Meta:', meta);
        return { local, server, queue, meta };
    }

    window.App = window.App || {};
    window.App.Sync = {
        syncFromServer,
        getStatus,
        getLastSync,
        onStatusChange,
        enqueueChange,
        processQueue,
        getPendingCount,
        pushInitialMigration,
        forcePushAll,
        diagnose
    };

    // ----- Users cache (prikaz display_name u zapisima) -----
    const Users = (function () {
        let cache = [];

        async function fetchUsers() {
            try {
                const list = await App.Api.apiCall('GET', '/users/list');
                if (Array.isArray(list)) cache = list;
            } catch (e) {
                console.warn('[Users] fetchUsers greška:', e.message);
            }
        }

        function getName(userId) {
            if (!userId) return '—';
            const u = cache.find(u => u.id === userId);
            return u ? u.display_name : userId;
        }

        function getAll() { return [...cache]; }

        return { fetchUsers, getName, getAll };
    }());

    window.App.Users = Users;
})();
