(function () {
    'use strict';

    const db = new Dexie('RenatoDB');
    db.version(1).stores({
        kupci:       'id',
        narudzbe:    'id',
        ponude:      'id',
        termini:     'id',
        edukacije:   'id',
        sync_queue:  '++id, table, record_id, action, timestamp',
        meta:        'key'
    });

    async function loadAll(table) {
        return await db.table(table).toArray();
    }

    async function saveAll(table, records) {
        await db.table(table).clear();
        if (records && records.length > 0) {
            await db.table(table).bulkPut(records);
        }
    }

    async function getOne(table, id) {
        return await db.table(table).get(id);
    }

    async function putOne(table, record) {
        await db.table(table).put(record);
    }

    async function deleteOne(table, id) {
        await db.table(table).delete(id);
    }

    async function clearAll() {
        await Promise.all([
            db.kupci.clear(),
            db.narudzbe.clear(),
            db.ponude.clear(),
            db.termini.clear(),
            db.edukacije.clear(),
            db.sync_queue.clear(),
            db.meta.clear()
        ]);
    }

    async function migrateFromLocalStorage() {
        const migrated = await db.meta.get('migrated_from_localstorage');
        if (migrated) return;

        const tables = ['kupci', 'narudzbe', 'ponude', 'termini', 'edukacije'];
        let totalMigrated = 0;

        for (const t of tables) {
            // Support both bare key and 'renato.' prefix used by old Storage
            const raw = localStorage.getItem(t) || localStorage.getItem('renato.' + t);
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data) && data.length > 0) {
                        await db.table(t).bulkPut(data);
                        totalMigrated += data.length;
                    }
                } catch (e) {
                    console.warn('Migration error for', t, e);
                }
            }
        }

        await db.meta.put({
            key: 'migrated_from_localstorage',
            value: true,
            timestamp: new Date().toISOString()
        });
        console.info('Migration: ' + totalMigrated + ' Datensätze von localStorage zu IndexedDB übertragen.');
        // localStorage ostaje kao backup – ne briše se
    }

    window.App = window.App || {};
    window.App.DB = { db, loadAll, saveAll, getOne, putOne, deleteOne, clearAll, migrateFromLocalStorage };
})();
