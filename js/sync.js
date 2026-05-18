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

        setStatus('syncing');
        try {
            for (const t of TABLES) {
                const data = await App.Api.apiCall('GET', '/' + t);
                await App.DB.saveAll(t, data);
            }

            await App.Storage.initCache();

            lastSync = new Date().toISOString();
            await App.DB.db.meta.put({ key: 'last_sync', value: lastSync });

            setStatus('idle', { lastSync });
            console.info('Sync: završen u', lastSync);
            return { ok: true, lastSync };
        } catch (err) {
            console.error('Sync greška:', err);
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
        await App.DB.db.sync_queue.add({
            table:      change.table,
            record_id:  change.record_id,
            action:     change.action,
            record:     change.record,
            timestamp:  new Date().toISOString(),
            status:     'pending',
            retries:    0,
            last_error: null
        });
        updatePendingIndicator();
    }

    async function processQueue() {
        if (isProcessing) return;
        if (!navigator.onLine) { setStatus('offline'); return; }

        const pending = await App.DB.db.sync_queue
            .where('status').anyOf('pending', 'failed')
            .toArray();

        if (!pending.length) return;

        isProcessing = true;
        setStatus('syncing');

        let anySuccess = false;
        try {
            for (const item of pending) {
                try {
                    await App.DB.db.sync_queue.update(item.id, { status: 'syncing' });

                    if (item.action === 'put') {
                        await App.Api.apiCall('POST', '/' + item.table + '/bulk', [item.record]);
                    } else if (item.action === 'delete') {
                        await App.Api.apiCall('DELETE', '/' + item.table + '/' + item.record_id);
                    }

                    await App.DB.db.sync_queue.delete(item.id);
                    anySuccess = true;
                } catch (err) {
                    await App.DB.db.sync_queue.update(item.id, {
                        status:     'failed',
                        retries:    (item.retries || 0) + 1,
                        last_error: err.message
                    });
                }
            }
        } finally {
            isProcessing = false;
        }

        await updatePendingIndicator();

        // Nakon uspješnog upisa, Read-sync da lokalni cache odgovara serveru
        if (anySuccess) {
            await syncFromServer();
        } else {
            setStatus('error');
        }
    }

    async function getPendingCount() {
        return await App.DB.db.sync_queue
            .where('status').anyOf('pending', 'failed', 'syncing')
            .count();
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

    window.App = window.App || {};
    window.App.Sync = {
        syncFromServer,
        getStatus,
        getLastSync,
        onStatusChange,
        enqueueChange,
        processQueue,
        getPendingCount,
        pushInitialMigration
    };
})();
