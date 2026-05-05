# Contractor Daily Availability — Design Spec

**Date:** 2026-05-05
**Status:** Approved

## Problem

The current `contractor_assignments` table stores a single static `labour_count` per contractor-package-type_of_work combination. There is no way for an executive to record daily available counts or track how availability changes over time. This blocks reporting on workforce trends and makes the Labour Mobilization report stale.

## Goal

Allow executives to enter available counts for active contractors on a daily basis, retain full historical data, and use that data for reports.

---

## Database

### New Table: `contractor_daily_log`

```sql
CREATE TABLE contractor_daily_log (
  log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id       UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES packages(package_id),
  type_of_work        VARCHAR(50) NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  available_count     INTEGER NOT NULL CHECK (available_count >= 0),
  additional_expected INTEGER CHECK (additional_expected >= 0),
  expected_date       DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contractor_id, package_id, type_of_work, date)
);
```

**UNIQUE constraint:** one entry per contractor + package + type_of_work per day. Attempting a duplicate returns an error; the UI directs the executive to edit the existing row instead.

**`expected_date`:** the date when additional expected workers will arrive. This is the field consumed by the Labour Mobilization report.

### Migration

- Existing `contractor_assignments` rows are migrated into `contractor_daily_log` with `date = created_at::date`, preserving `labour_count → available_count`, `additional_expected`, and `expected_date`.
- `contractor_assignments` table is dropped after migration.
- `contractors` table is unchanged.

---

## API

Auth required: Admin or LabourMob role (same as current assignments routes).

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/users/contractors/daily-log?date=YYYY-MM-DD` | Fetch all entries for a date (defaults to today). Returns contractor name, package name, type_of_work, available_count, additional_expected, expected_date. |
| `POST` | `/users/contractors/daily-log` | Create entry for today. Body: `{ contractor_id, package_id, type_of_work, available_count, additional_expected?, expected_date? }` |
| `PATCH` | `/users/contractors/daily-log/:logId` | Update an entry. Today's entries only — past dates are rejected with 403. |
| `DELETE` | `/users/contractors/daily-log/:logId` | Delete an entry. Today only. |

Existing `GET/POST/PATCH /users/contractors` routes are unchanged.

All previous `/users/contractors/:id/assignments` routes are removed.

---

## UI — ContractorsPage

The page is split into two clearly separated sections.

### Section 1 — Daily Availability Log (top, primary)

A flat table. No expandable rows. Shows today's entries by default.

**Columns:** Contractor Name | Package | Type of Work | Available Count | Additional Expected | Expected Arrival Date | Actions

**Add Row:** Opens an inline green row with:
- Contractor (dropdown from master list)
- Package (dropdown)
- Type of Work (dropdown — same 11 predefined options)
- Available Count (number, required)
- Additional Expected (number, optional)
- Expected Arrival Date (date picker, optional)
- Save / Cancel buttons

**Edit:** Inline editing of existing rows. Only today's entries are editable — past date rows render without action buttons.

**Delete:** Removes the entry (today only).

**Date filter:** At the top of the section, defaults to today. Past dates show entries read-only with no Add/Edit/Delete controls.

**Duplicate error:** If an executive tries to add a row for a combination that already exists today, the UI shows an inline error: *"Entry already exists for this combination today — edit the existing row instead."*

### Section 2 — Contractor Master (below, secondary)

The existing unique contractors table. Columns: Name | Contact | Mobilized By | Status | Actions.

- Add Contractor, Edit, Toggle Active all work exactly as today.
- The expandable assignments editor is removed (assignments no longer exist as a separate concept).
- This list feeds the reservation dropdown unchanged.

---

## Labour Mobilization Report

Currently queries `contractor_assignments`. Updated to query `contractor_daily_log` for a user-selected date (defaulting to the most recent date with entries).

The `expected_date` field from `contractor_daily_log` is used in the "By Mobilized By" section to show when additional workers are expected to arrive — matching the existing report behavior.

---

## Out of Scope

- Entry for past or future dates (always today only)
- Bulk import of daily counts
- Notifications or reminders for missing daily entries
- Changes to the reservation dropdown or reservation workflow
