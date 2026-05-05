# Contractor Daily Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `contractor_assignments` table with a `contractor_daily_log` table that records available counts per day, restructure ContractorsPage into a daily log section and a contractor master section, and update the Labour Mobilization report to query the new table.

**Architecture:** `contractor_daily_log` becomes the single source of truth for contractor+package+type_of_work counts, with UNIQUE per (contractor_id, package_id, type_of_work, date). Existing `contractor_assignments` data is migrated then the table is dropped. The `contractors` table is unchanged. ContractorsPage splits into two flat tables — no expandable rows. All four assignment routes are replaced by four daily-log routes.

**Tech Stack:** PostgreSQL, Node.js/Express (`asyncHandler`, `requireRole`, `AppError`), React + TanStack React Query, TypeScript, Tailwind CSS, lucide-react icons, react-hot-toast.

---

## File Map

**Create:**
- `backend/src/db/migrations/032_contractor_daily_log.sql` — New table + migrate data from contractor_assignments
- `backend/src/db/migrations/033_drop_contractor_assignments.sql` — Drop old table (run last, after all code changes)

**Modify:**
- `backend/src/routes/user.routes.js` — Add 4 daily-log routes, remove 4 assignment routes, simplify GET /contractors
- `frontend/src/api/index.ts` — Add 4 daily-log API functions, remove 4 assignment functions
- `frontend/src/pages/ContractorsPage.tsx` — Full replacement: remove AssignmentsEditor/AssignmentRow, add DailyLogRow/AddDailyLogRow, restructure main component

**Find and modify:**
- Labour Mobilization report backend route — grep to locate, update SQL from contractor_assignments → contractor_daily_log
- Labour Mobilization report frontend page — grep to locate, update API call if needed

---

### Task 1: Create migration 032 — contractor_daily_log + data migration

**Files:**
- Create: `backend/src/db/migrations/032_contractor_daily_log.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 032_contractor_daily_log.sql
CREATE TABLE IF NOT EXISTS contractor_daily_log (
  log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id       UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES packages(package_id),
  type_of_work        VARCHAR(50) NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  available_count     INTEGER NOT NULL CHECK (available_count >= 0),
  additional_expected INTEGER CHECK (additional_expected IS NULL OR additional_expected >= 0),
  expected_date       DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contractor_id, package_id, type_of_work, date)
);

-- Migrate existing data; use created_at::date so history is preserved
INSERT INTO contractor_daily_log
  (contractor_id, package_id, type_of_work, date, available_count, additional_expected, expected_date, created_at)
SELECT
  contractor_id,
  package_id,
  type_of_work,
  created_at::date AS date,
  labour_count      AS available_count,
  additional_expected,
  expected_date,
  created_at
FROM contractor_assignments
ON CONFLICT (contractor_id, package_id, type_of_work, date) DO NOTHING;
```

- [ ] **Step 2: Find the migration runner command**

Check `backend/package.json` scripts section. Look for a script like `"migrate"` or `"db:migrate"`. Run it:

```bash
# from project root or backend/
npm run migrate   # or whatever the script is named
```

- [ ] **Step 3: Verify the migration**

Connect to the DB and run:

```sql
SELECT COUNT(*) FROM contractor_daily_log;
-- Should equal COUNT(*) FROM contractor_assignments (minus any same-date duplicates)

SELECT cdl.log_id, c.name, p.package_name, cdl.type_of_work, cdl.date, cdl.available_count
FROM contractor_daily_log cdl
JOIN contractors c ON c.contractor_id = cdl.contractor_id
JOIN packages p ON p.package_id = cdl.package_id
LIMIT 5;
-- Should show migrated rows with correct data
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/032_contractor_daily_log.sql
git commit -m "feat: create contractor_daily_log table and migrate data from contractor_assignments"
```

---

### Task 2: Backend — Add daily-log routes to user.routes.js

**Files:**
- Modify: `backend/src/routes/user.routes.js`

The existing file already has a `parseNonNegativeInt` helper (around line 284). All new routes must be placed **before** any `/:id` parameterized routes to avoid Express route shadowing. Find the block of static `/contractors` routes (GET, POST) and add the four new routes immediately after the GET route.

- [ ] **Step 1: Add GET /contractors/daily-log**

Add immediately after `router.get('/contractors', ...)`:

```javascript
router.get('/contractors/daily-log', asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT cdl.log_id, cdl.contractor_id, c.name AS contractor_name,
            cdl.package_id, p.package_name, cdl.type_of_work, cdl.date,
            cdl.available_count, cdl.additional_expected, cdl.expected_date
     FROM contractor_daily_log cdl
     JOIN contractors c ON c.contractor_id = cdl.contractor_id
     JOIN packages p ON p.package_id = cdl.package_id
     WHERE cdl.date = $1
     ORDER BY c.name, p.package_name, cdl.type_of_work`,
    [date]
  );
  res.json(result.rows);
}));
```

- [ ] **Step 2: Add POST /contractors/daily-log**

```javascript
router.post('/contractors/daily-log', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { contractor_id, package_id, type_of_work, available_count, additional_expected, expected_date } = req.body;
  if (!contractor_id || !package_id || !type_of_work) {
    throw new AppError(400, 'contractor_id, package_id, and type_of_work are required');
  }
  const parsedCount = parseNonNegativeInt(available_count, 'available_count');
  const parsedExpected = (additional_expected != null && additional_expected !== '')
    ? parseNonNegativeInt(additional_expected, 'additional_expected')
    : null;
  try {
    const result = await pool.query(
      `INSERT INTO contractor_daily_log
         (contractor_id, package_id, type_of_work, available_count, additional_expected, expected_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING log_id, contractor_id, package_id, type_of_work, date,
                 available_count, additional_expected, expected_date`,
      [contractor_id, package_id, type_of_work, parsedCount, parsedExpected, expected_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'An entry for this contractor, package, and type of work already exists for today');
    if (err.code === '23503') throw new AppError(400, 'Invalid contractor_id or package_id');
    throw err;
  }
}));
```

- [ ] **Step 3: Add PATCH /contractors/daily-log/:logId**

```javascript
router.patch('/contractors/daily-log/:logId', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const { available_count, additional_expected, expected_date } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  if (available_count !== undefined) {
    fields.push(`available_count = $${i++}`);
    values.push(parseNonNegativeInt(available_count, 'available_count'));
  }
  if ('additional_expected' in req.body) {
    const val = (additional_expected === null || additional_expected === '')
      ? null
      : parseNonNegativeInt(additional_expected, 'additional_expected');
    fields.push(`additional_expected = $${i++}`);
    values.push(val);
  }
  if ('expected_date' in req.body) {
    fields.push(`expected_date = $${i++}`);
    values.push(expected_date || null);
  }
  if (fields.length === 0) throw new AppError(400, 'No fields to update');
  fields.push(`updated_at = NOW()`);
  values.push(logId);

  const result = await pool.query(
    `UPDATE contractor_daily_log SET ${fields.join(', ')}
     WHERE log_id = $${i} AND date = CURRENT_DATE
     RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new AppError(404, 'Entry not found or cannot edit past entries');
  res.json(result.rows[0]);
}));
```

- [ ] **Step 4: Add DELETE /contractors/daily-log/:logId**

```javascript
router.delete('/contractors/daily-log/:logId', requireRole('Admin', 'LabourMob'), asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const result = await pool.query(
    'DELETE FROM contractor_daily_log WHERE log_id = $1 AND date = CURRENT_DATE RETURNING log_id',
    [logId]
  );
  if (result.rows.length === 0) throw new AppError(404, 'Entry not found or cannot delete past entries');
  res.status(204).end();
}));
```

- [ ] **Step 5: Smoke test the GET route**

Start the backend and run:

```bash
curl http://localhost:3001/users/contractors/daily-log
# Expected: JSON array (empty or with migrated rows if created_at::date matches today)

curl "http://localhost:3001/users/contractors/daily-log?date=2026-01-01"
# Expected: [] if no entries for that date
```

Adjust the port to match your backend's actual port.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/user.routes.js
git commit -m "feat: add contractor daily-log routes (GET, POST, PATCH, DELETE)"
```

---

### Task 3: Backend — Remove assignment routes and simplify GET /contractors

**Files:**
- Modify: `backend/src/routes/user.routes.js`

- [ ] **Step 1: Check for any other callers of the assignment routes**

```bash
grep -r "assignments" frontend/src --include="*.ts" --include="*.tsx" -l
grep -r "contractor_assignments" backend/src --include="*.js" -l
```

The ContractorsPage and usersApi will be updated in Tasks 4 and 5. If the Labour Mobilization report also references `contractor_assignments`, note the file — it is updated in Task 6.

- [ ] **Step 2: Delete the four assignment route handlers**

Remove these four blocks from `user.routes.js`:
- `router.get('/contractors/:id/assignments', ...)`
- `router.post('/contractors/:id/assignments', ...)`
- `router.patch('/contractors/:id/assignments/:assignmentId', ...)`
- `router.delete('/contractors/:id/assignments/:assignmentId', ...)`

- [ ] **Step 3: Simplify GET /contractors — remove include=assignments branch**

The current GET /contractors route has a branch that runs a second SQL query when `include === 'assignments'` and groups results by contractor using a Map. Remove that branch entirely so the route returns a flat array of contractors only.

Read the current route body carefully first, then replace it with:

```javascript
router.get('/contractors', asyncHandler(async (req, res) => {
  const { search, all } = req.query;
  const result = await pool.query(
    `SELECT contractor_id, name, contact, mobilized_by, active_flag, created_at
     FROM contractors
     WHERE ($1::boolean OR active_flag = TRUE)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
     ORDER BY name`,
    [all === 'true', search || null]
  );
  res.json(result.rows);
}));
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/user.routes.js
git commit -m "refactor: remove contractor assignment routes, simplify GET /contractors"
```

---

### Task 4: Frontend API — Update api/index.ts

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: Remove the four assignment API functions from usersApi**

Delete:
- `getContractorAssignments`
- `createContractorAssignment`
- `updateContractorAssignment`
- `deleteContractorAssignment`

- [ ] **Step 2: Add the four daily-log API functions to usersApi**

```typescript
getDailyLog: (date?: string) =>
  client.get('/users/contractors/daily-log', { params: { date } }).then((r) => r.data),

createDailyLogEntry: (data: {
  contractor_id: string;
  package_id: string;
  type_of_work: string;
  available_count: number;
  additional_expected?: number | null;
  expected_date?: string | null;
}) => client.post('/users/contractors/daily-log', data).then((r) => r.data),

updateDailyLogEntry: (
  logId: string,
  data: {
    available_count?: number;
    additional_expected?: number | null;
    expected_date?: string | null;
  }
) => client.patch(`/users/contractors/daily-log/${logId}`, data).then((r) => r.data),

deleteDailyLogEntry: (logId: string) =>
  client.delete(`/users/contractors/daily-log/${logId}`).then((r) => r.data),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: add daily-log API functions, remove assignment API functions"
```

---

### Task 5: Frontend — Replace ContractorsPage.tsx

**Files:**
- Modify: `frontend/src/pages/ContractorsPage.tsx`

Read the full current file before replacing. Note which icon library is used (search for `from 'lucide-react'` or `from '@heroicons/react'` at the top). The replacement below uses `lucide-react` — adjust imports if the project uses a different icon library.

- [ ] **Step 1: Verify icon library in use**

```bash
grep -r "from 'lucide-react'\|from '@heroicons'" frontend/src --include="*.tsx" | head -3
```

If heroicons: replace `Pencil, Trash2, Check, X` with `PencilIcon, TrashIcon, CheckIcon, XMarkIcon` imported from `@heroicons/react/24/outline`.

- [ ] **Step 2: Verify packagesApi export name**

```bash
grep "packagesApi\|export.*packages" frontend/src/api/index.ts
```

Note the exact export name and adjust the import in the new file if needed.

- [ ] **Step 3: Replace the file**

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { usersApi, packagesApi } from '../api';

const TYPE_OF_WORK = [
  'Bridges', 'SWD', 'Precast Manholes', 'Precast SWD', 'Camp Works', 'Kerb',
  'Bridge/Labour Sheds', 'Bridge/Pier Cap Staging Purpose', 'Girder Casting Yard',
  'Casting Yard', 'Power EHV',
];

interface DailyLogEntry {
  log_id: string;
  contractor_id: string;
  contractor_name: string;
  package_id: string;
  package_name: string;
  type_of_work: string;
  date: string;
  available_count: number;
  additional_expected: number | null;
  expected_date: string | null;
}

interface Package {
  package_id: string;
  package_name: string;
}

interface Contractor {
  contractor_id: string;
  name: string;
  contact: string | null;
  mobilized_by: string | null;
  active_flag: boolean;
}

// ── Daily Log ─────────────────────────────────────────────────────────────────

function AddDailyLogRow({
  contractors,
  packages,
  onDone,
}: {
  contractors: Contractor[];
  packages: Package[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [contractorId, setContractorId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [typeOfWork, setTypeOfWork] = useState('');
  const [availableCount, setAvailableCount] = useState('');
  const [additionalExpected, setAdditionalExpected] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      usersApi.createDailyLogEntry({
        contractor_id: contractorId,
        package_id: packageId,
        type_of_work: typeOfWork,
        available_count: parseInt(availableCount, 10),
        additional_expected: additionalExpected ? parseInt(additionalExpected, 10) : null,
        expected_date: expectedDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-log'] });
      onDone();
    },
    onError: (e: any) => {
      if (e.response?.status === 409) {
        toast.error('Entry already exists for this combination today — edit the existing row instead.');
      } else {
        toast.error('Failed to add entry');
      }
    },
  });

  const handleSave = () => {
    if (!contractorId || !packageId || !typeOfWork) {
      toast.error('Contractor, package, and type of work are required');
      return;
    }
    const count = parseInt(availableCount, 10);
    if (isNaN(count) || count < 0) {
      toast.error('Available count must be a non-negative number');
      return;
    }
    mut.mutate();
  };

  return (
    <tr className="bg-green-50">
      <td className="px-3 py-2">
        <select
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select contractor...</option>
          {contractors.map((c) => (
            <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select package...</option>
          {packages.map((p) => (
            <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={typeOfWork}
          onChange={(e) => setTypeOfWork(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select type...</option>
          {TYPE_OF_WORK.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          value={availableCount}
          onChange={(e) => setAvailableCount(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-24"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          value={additionalExpected}
          onChange={(e) => setAdditionalExpected(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-24"
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={mut.isPending}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDone} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DailyLogRow({ entry, isToday }: { entry: DailyLogEntry; isToday: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [availableCount, setAvailableCount] = useState(String(entry.available_count));
  const [additionalExpected, setAdditionalExpected] = useState(
    entry.additional_expected != null ? String(entry.additional_expected) : ''
  );
  const [expectedDate, setExpectedDate] = useState(entry.expected_date ?? '');

  const updateMut = useMutation({
    mutationFn: () =>
      usersApi.updateDailyLogEntry(entry.log_id, {
        available_count: parseInt(availableCount, 10),
        additional_expected: additionalExpected ? parseInt(additionalExpected, 10) : null,
        expected_date: expectedDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-log'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to update entry'),
  });

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteDailyLogEntry(entry.log_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-log'] }),
    onError: () => toast.error('Failed to delete entry'),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2 text-sm font-medium text-gray-700">{entry.contractor_name}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{entry.package_name}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{entry.type_of_work}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            value={availableCount}
            onChange={(e) => setAvailableCount(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            value={additionalExpected}
            onChange={(e) => setAdditionalExpected(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      <td className="px-3 py-2 text-sm font-medium text-gray-700">{entry.contractor_name}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.package_name}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.type_of_work}</td>
      <td className="px-3 py-2 text-sm text-gray-800">{entry.available_count}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.additional_expected ?? '—'}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.expected_date ?? '—'}</td>
      <td className="px-3 py-2">
        {isToday && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-blue-500 hover:text-blue-700"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => { if (window.confirm('Delete this entry?')) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
              className="text-red-400 hover:text-red-600 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Contractor Master ─────────────────────────────────────────────────────────

function ContractorRow({ contractor }: { contractor: Contractor }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);
  const [contact, setContact] = useState(contractor.contact ?? '');
  const [mobilizedBy, setMobilizedBy] = useState(contractor.mobilized_by ?? '');

  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) =>
      usersApi.updateContractor(contractor.contractor_id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to update contractor'),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Name"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full font-mono"
            placeholder="+91..."
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={mobilizedBy}
            onChange={(e) => setMobilizedBy(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Mobilized by"
          />
        </td>
        <td className="px-4 py-2">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              contractor.active_flag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {contractor.active_flag ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button
              onClick={() =>
                updateMut.mutate({ name, contact: contact || null, mobilized_by: mobilizedBy || null })
              }
              disabled={updateMut.isPending || !name.trim()}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      <td className="px-4 py-2 text-sm font-medium text-gray-700">{contractor.name}</td>
      <td className="px-4 py-2 text-sm font-mono text-gray-500">{contractor.contact ?? '—'}</td>
      <td className="px-4 py-2 text-sm text-gray-500">{contractor.mobilized_by ?? '—'}</td>
      <td className="px-4 py-2">
        <button
          onClick={() => updateMut.mutate({ active_flag: !contractor.active_flag })}
          disabled={updateMut.isPending}
          className={`text-xs px-2 py-1 rounded-full ${
            contractor.active_flag
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {contractor.active_flag ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => setEditing(true)}
          className="text-blue-500 hover:text-blue-700"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function AddContractorRow({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [mobilizedBy, setMobilizedBy] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      usersApi.createContractor({ name, contact: contact || null, mobilized_by: mobilizedBy || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      onDone();
    },
    onError: () => toast.error('Failed to add contractor'),
  });

  return (
    <tr className="bg-green-50">
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Name *"
          autoFocus
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full font-mono"
          placeholder="+91..."
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={mobilizedBy}
          onChange={(e) => setMobilizedBy(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Mobilized by"
        />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!name.trim()) { toast.error('Name is required'); return; }
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDone} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [addingLog, setAddingLog] = useState(false);
  const [addingContractor, setAddingContractor] = useState(false);
  const [contractorSearch, setContractorSearch] = useState('');

  const { data: dailyLog = [], isLoading: logLoading } = useQuery({
    queryKey: ['daily-log', selectedDate],
    queryFn: () => usersApi.getDailyLog(selectedDate),
  });

  const { data: contractors = [], isLoading: contractorsLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => usersApi.getContractors('', true),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.list(),
  });

  const isToday = selectedDate === today;

  const filteredContractors = (contractors as Contractor[]).filter((c) =>
    c.name.toLowerCase().includes(contractorSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-10">
      {/* ── Daily Availability Log ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">Daily Availability Log</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setAddingLog(false); }}
              className="border rounded px-2 py-1 text-sm"
            />
            {!isToday && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                Viewing past date — read only
              </span>
            )}
          </div>
          {isToday && !addingLog && (
            <button
              onClick={() => setAddingLog(true)}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
            >
              + Add Row
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contractor</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type of Work</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available Count</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Additional Expected</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Arrival Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {addingLog && (
                <AddDailyLogRow
                  contractors={contractors as Contractor[]}
                  packages={packages as Package[]}
                  onDone={() => setAddingLog(false)}
                />
              )}
              {logLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Loading...</td>
                </tr>
              ) : (dailyLog as DailyLogEntry[]).length === 0 && !addingLog ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">
                    No entries for this date.
                  </td>
                </tr>
              ) : (
                (dailyLog as DailyLogEntry[]).map((entry) => (
                  <DailyLogRow key={entry.log_id} entry={entry} isToday={isToday} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Contractor Master ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Contractor Master
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({(contractors as Contractor[]).length})
              </span>
            </h2>
            <input
              type="text"
              value={contractorSearch}
              onChange={(e) => setContractorSearch(e.target.value)}
              placeholder="Search by name..."
              className="border rounded px-3 py-1.5 text-sm w-64"
            />
          </div>
          {!addingContractor && (
            <button
              onClick={() => setAddingContractor(true)}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
            >
              + Add Contractor
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobilized By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {addingContractor && (
                <AddContractorRow onDone={() => setAddingContractor(false)} />
              )}
              {contractorsLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</td>
                </tr>
              ) : filteredContractors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No contractors found.</td>
                </tr>
              ) : (
                filteredContractors.map((c) => (
                  <ContractorRow key={c.contractor_id} contractor={c} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Start the dev server and verify the UI**

```bash
cd frontend && npm run dev
```

Navigate to the Contractors page and check:
1. Daily log section loads with two columns — a date picker defaulting to today, and an Add Row button
2. Clicking Add Row opens green inline row with contractor/package/type dropdowns and count inputs
3. Saving a new entry adds it to the table
4. Attempting to save a duplicate contractor+package+type for today shows the 409 toast
5. Editing a row turns it blue; saving updates the value in place
6. Delete button asks confirmation, then removes the row
7. Switching the date picker to a past date shows entries read-only (no edit/delete, no Add Row, amber "read only" badge)
8. Contractor Master loads all contractors flat (no chevrons, no expansion)
9. Status toggle works; edit inline works; Add Contractor works

- [ ] **Step 5: Check TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ContractorsPage.tsx
git commit -m "feat: restructure ContractorsPage — daily log and contractor master sections"
```

---

### Task 6: Update Labour Mobilization Report

**Files:**
- Find and modify: Labour Mobilization backend route
- Find and modify: Labour Mobilization frontend page

- [ ] **Step 1: Locate the files**

```bash
grep -rl "labour\|mobilization\|LabourMob" backend/src --include="*.js"
grep -rl "LabourMobilization\|labour-mobilization\|labourMobilization" frontend/src --include="*.tsx"
```

Read the identified backend route and frontend page in full.

- [ ] **Step 2: Find the SQL that references contractor_assignments**

In the backend route file, search for `contractor_assignments`. The query currently joins against that table and uses `labour_count` and `expected_date`. Replace it with a query against `contractor_daily_log`.

**Old pattern:**
```sql
FROM contractor_assignments ca
JOIN contractors c ON c.contractor_id = ca.contractor_id
JOIN packages p ON p.package_id = ca.package_id
-- uses ca.labour_count, ca.expected_date
```

**New pattern — add a `date` parameter to the route (default today):**
```javascript
const date = req.query.date || new Date().toISOString().slice(0, 10);
```

```sql
FROM contractor_daily_log cdl
JOIN contractors c ON c.contractor_id = cdl.contractor_id
JOIN packages p ON p.package_id = cdl.package_id
WHERE cdl.date = $1
-- uses cdl.available_count (replaces labour_count), cdl.expected_date (unchanged)
```

Pass `date` as the first query parameter (`$1`). Shift any other existing parameters accordingly.

- [ ] **Step 3: Update the frontend report page**

If the frontend fetches the report data from a dedicated API endpoint, update the call to pass the selected date as a query parameter. If it calls `usersApi.getDailyLog(date)` directly, no backend report route is needed.

Add a date picker to the report UI header if one is not already present:

```tsx
const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
// Pass reportDate to the API call and to the useQuery key
```

- [ ] **Step 4: Test the report**

Navigate to the Labour Mobilization report in the UI:
1. Report renders without errors
2. "By Mobilized By" section shows `expected_date` values from `contractor_daily_log`
3. Changing the date picker updates the report data

- [ ] **Step 5: Commit**

```bash
git add <backend-route-file> <frontend-report-page>
git commit -m "feat: update Labour Mobilization report to use contractor_daily_log"
```

---

### Task 7: Migration 033 — Drop contractor_assignments

Run this only after Tasks 2–6 are complete and verified.

**Files:**
- Create: `backend/src/db/migrations/033_drop_contractor_assignments.sql`

- [ ] **Step 1: Verify no code references contractor_assignments**

```bash
grep -r "contractor_assignments" backend/src --include="*.js"
grep -r "contractor_assignments" backend/src --include="*.sql" --exclude="033*"
```

Expected: zero results. If any appear, fix them before proceeding.

- [ ] **Step 2: Create the migration**

```sql
-- 033_drop_contractor_assignments.sql
DROP TABLE IF EXISTS contractor_assignments;
```

- [ ] **Step 3: Run the migration**

```bash
npm run migrate   # or the project's migration command
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/033_drop_contractor_assignments.sql
git commit -m "feat: drop contractor_assignments table (replaced by contractor_daily_log)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full smoke test**

Start both servers:

```bash
# terminal 1 — backend
cd backend && npm run dev
# terminal 2 — frontend
cd frontend && npm run dev
```

Verify end-to-end:
1. Contractors page — Daily Log section: add, edit, delete, date switching, 409 duplicate error
2. Contractors page — Contractor Master: add, edit, status toggle
3. Labour Mobilization report loads and shows correct data
4. Reservation dropdown still shows contractors (uses GET /users/contractors, unchanged)
5. No console errors in the browser

- [ ] **Step 2: TypeScript clean**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Review commit log**

```bash
git log --oneline -8
```

Expected output (7 commits):
```
feat: drop contractor_assignments table (replaced by contractor_daily_log)
feat: update Labour Mobilization report to use contractor_daily_log
feat: restructure ContractorsPage — daily log and contractor master sections
feat: add daily-log API functions, remove assignment API functions
refactor: remove contractor assignment routes, simplify GET /contractors
feat: add contractor daily-log routes (GET, POST, PATCH, DELETE)
feat: create contractor_daily_log table and migrate data from contractor_assignments
```
