# Renato Stolarija – Changelog

## 2026-05-19 – Session F-1 + Filter

### Commits
| Hash | Beschreibung |
|------|-------------|
| `63c9805` | feat: 4 Filter im Dodaj-Modal + Code-Wiederverwendung |
| `7305874` | feat: Kategorija-Filter wiederhergestellt (4 Filter-Zeilen) |
| `dcf9ed2` | feat: Marka-Filter + Lieferant in Katalog-Karte |
| `fe7e31b` | feat: Phase F-1 Dobavljači-Modul |
| `5ecf6e9` | feat: Materijali katalog Phase E enhancement |

### Phase F-1: Dobavljači-Modul
**Backend:**
- `db/migrations/004_dobavljaci.sql` — neue Tabelle, ALTER TABLE für katalog + positionen, Elgrad-Seed
- `routes/dobavljaci.js` — CRUD (GET/POST/PUT/DELETE), JOIN für katalog_count/stavki_count
- `routes/materijali.js` — Upload scoped auf dobavljac_id+katalog_naziv, dobavljac_id in Positionen

**Frontend:**
- `js/db.js` v4 — dobavljaci Store + neue Indizes
- `js/sync.js` — syncFromServer lädt Dobavljači
- `js/dobavljaci.js` (neu) — Liste, Formular, Katalozi-Sektion, openUploadModal()
- `index.html` — module-dobavljaci + Menüeintrag
- `js/materijali.js` — Upload-Button delegiert an App.Dobavljaci.openUploadModal()

### Filter-Verbesserungen (alle in js/materijali.js)
- **4 Filter-Zeilen**: Dobavljač (lieferant_id) / Marka (hersteller) / Kategorija / Debljina
- **Reset-Kaskade**: Dobavljač→ Marka+Kategorija; Marka→Kategorija
- **Karte**: Zeile 1 Šifra·Naziv·Marka, Zeile 2 Lieferant·Katalog·Debljina·Format
- **Code-Wiederverwendung**: filterKatalogItems() + renderKatalogCard(m, mapOverride) global
- **Dodaj-Modal**: gleiche 4 Filter, gleiche Karten, eigener modalFilters-State

---

## 2026-05-19 – Session Phase E Enhancement

### Phase E: Materijali-Modul (js/materijali.js komplett neu)
- Debljina-Filter (dynamisch, numerisch sortiert)
- 3-Zeilen Katalog-Karten mit ABS-Preiszeile + Gold-Pill
- openAddModal() → Array [main, ...absPositions]
- ABS-Buttons (+ Dodaj ABS 0,8mm / 2mm) im Ručni unos Tab
- handleDodajMaterijal() in narudzbe.js iteriert über Array-Ergebnis

### Bugs behoben
- Katalog leer nach Upload: syncFromServer Safety-Check unterbrach Sync →
  Fix: direktes GET /materijali/katalog + DB.saveAll() statt syncFromServer
- narudzbe.js: handleDodajMaterijal() für Array-Return aktualisiert

---

## Frühere Sessions (Phasen A–D, E Basis)

Siehe `/Users/mario/.claude/projects/-Users-mario-Documents-Claude-Code-renato-app/memory/PHASEN.md`
