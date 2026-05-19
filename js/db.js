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
    db.version(2).stores({
        kupci:       'id',
        narudzbe:    'id',
        ponude:      'id',
        termini:     'id',
        edukacije:   'id',
        sync_queue:  '++id, table, record_id, action, timestamp, status',
        meta:        'key'
    });
    db.version(3).stores({
        kupci:                'id',
        narudzbe:             'id',
        ponude:               'id',
        termini:              'id',
        edukacije:            'id',
        sync_queue:           '++id, table, record_id, action, timestamp, status',
        meta:                 'key',
        materijali_katalog:   'id, dobavljac, kategorija',
        narudzba_materijali:  'id, narudzba_id, narudzeno'
    });
    db.version(4).stores({
        kupci:                'id',
        narudzbe:             'id',
        ponude:               'id',
        termini:              'id',
        edukacije:            'id',
        sync_queue:           '++id, table, record_id, action, timestamp, status',
        meta:                 'key',
        materijali_katalog:   'id, dobavljac, kategorija, dobavljac_id, katalog_naziv',
        narudzba_materijali:  'id, narudzba_id, narudzeno, dobavljac_id',
        dobavljaci:           'id'
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
            db.meta.clear(),
            db.materijali_katalog.clear(),
            db.narudzba_materijali.clear(),
            db.dobavljaci.clear()
        ]);
    }

    async function migrateFromLocalStorage() {
        const migrated = await db.meta.get('migrated_from_localstorage');
        if (migrated) return { migrated: false, reason: 'already_done' };

        const tables = ['kupci', 'narudzbe', 'ponude', 'termini', 'edukacije'];
        let totalMigrated = 0;
        const migratedData = {};

        for (const t of tables) {
            const raw = localStorage.getItem(t) || localStorage.getItem('renato.' + t);
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data) && data.length > 0) {
                        await db.table(t).bulkPut(data);
                        migratedData[t] = data;
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
            timestamp: new Date().toISOString(),
            totalRecords: totalMigrated
        });
        console.info('Migration lokalna: ' + totalMigrated + ' Datensätze von localStorage zu IndexedDB.');
        // localStorage ostaje kao backup – ne briše se
        return { migrated: true, totalMigrated, data: migratedData };
    }

    window.App = window.App || {};
    window.App.DB = { db, loadAll, saveAll, getOne, putOne, deleteOne, clearAll, migrateFromLocalStorage };
})();
