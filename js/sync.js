(function () {
    'use strict';

    const TABLES = ['kupci', 'narudzbe', 'ponude', 'termini', 'edukacije'];

    let syncStatus = 'idle';
    let lastSync = null;
    let listeners = [];

    function setStatus(status, info) {
        syncStatus = status;
        listeners.forEach(l => l(status, info));
    }

    function onStatusChange(fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(l => l !== fn); };
    }

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

    function getStatus() { return syncStatus; }

    // ----- Sync-status indikator (UI) -----
    function updateSyncIndicator(status) {
        const el = document.getElementById('sync-indicator');
        if (!el) return;
        const label = el.querySelector('.sync-label');
        el.className = 'sync-indicator sync-' + (status || syncStatus);
        const labels = { idle: 'Online', syncing: 'Sync...', error: 'Greška', offline: 'Offline' };
        if (label) label.textContent = labels[status || syncStatus] || (status || syncStatus);
    }

    onStatusChange(updateSyncIndicator);
    document.addEventListener('DOMContentLoaded', function () { updateSyncIndicator(syncStatus); });

    // ----- Online/Offline events -----
    window.addEventListener('online', function () {
        setStatus('idle');
        syncFromServer();
    });
    window.addEventListener('offline', function () { setStatus('offline'); });

    window.App = window.App || {};
    window.App.Sync = { syncFromServer, getStatus, getLastSync, onStatusChange };
})();
