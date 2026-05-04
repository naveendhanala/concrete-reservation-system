# Delivery Logs Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, paginated Delivery Logs page for PMHead and PMManager roles, with date and package filters, showing all delivery entries across all batching plants.

**Architecture:** New backend controller + route (`GET /api/delivery-logs`) with a single-date and packageId filter plus LIMIT/OFFSET pagination. New frontend page `DeliveryLogsPage.tsx` mirrors the Reservations page pattern using React Query, with a nav link added to `AppLayout.tsx`.

**Tech Stack:** Node.js/Express (backend), PostgreSQL via `query()` helper, React + TypeScript + React Query + Tailwind (frontend), lucide-react icons.

---

## File Map

| File | Action |
|------|--------|
| `backend/src/controllers/delivery-logs.controller.js` | Create — `listDeliveryLogs` function |
| `backend/src/routes/delivery-logs.routes.js` | Create — GET /delivery-logs route |
| `backend/src/app.js` | Modify — register new route at `/api/delivery-logs` |
| `frontend/src/api/index.ts` | Modify — add `deliveryLogsApi` export |
| `frontend/src/pages/DeliveryLogsPage.tsx` | Create — list page with filters and table |
| `frontend/src/App.tsx` | Modify — add `/delivery-logs` route |
| `frontend/src/components/layout/AppLayout.tsx` | Modify — add nav item for PMHead/PMManager |

---

## Task 1: Backend Controller

**Files:**
- Create: `backend/src/controllers/delivery-logs.controller.js`

- [ ] **Step 1: Create the controller file**

```js
// backend/src/controllers/delivery-logs.controller.js
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

const listDeliveryLogs = asyncHandler(async (req, res) => {
  const { date, packageId, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const dateParam    = date      || null;
  const packageParam = packageId || null;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM reservation_deliveries d
     JOIN reservations r ON d.reservation_id = r.reservation_id
     WHERE ($1::date IS NULL
            OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') = $1)
       AND ($2::uuid IS NULL OR r.package_id = $2)`,
    [dateParam, packageParam]
  );
  const total = countRows[0].total;

  const { rows } = await query(
    `SELECT
       sub.sr_no,
       sub.delivery_id,
       sub.reservation_number,
       sub.delivered_at,
       sub.package_name,
       sub.contractor,
       sub.chainage,
       sub.grade,
       sub.structure,
       sub.nature_of_work,
       sub.rfi_id,
       sub.quantity_m3,
       sub.tm_no,
       sub.driver_no,
       sub.batching_plant,
       sub.logged_by
     FROM (
       SELECT
         ROW_NUMBER() OVER (ORDER BY d.delivered_at DESC)::int AS sr_no,
         d.delivery_id,
         r.reservation_number,
         (d.delivered_at AT TIME ZONE 'Asia/Kolkata') AS delivered_at,
         p.package_name,
         COALESCE(c.name, '')       AS contractor,
         r.chainage,
         r.grade,
         r.structure,
         r.nature_of_work,
         COALESCE(r.rfi_id, '')    AS rfi_id,
         d.quantity_m3,
         d.tm_no,
         d.driver_no,
         d.batching_plant,
         u.name                    AS logged_by
       FROM reservation_deliveries d
       JOIN reservations r     ON d.reservation_id = r.reservation_id
       JOIN packages p         ON r.package_id     = p.package_id
       LEFT JOIN contractors c ON r.contractor_id  = c.contractor_id
       JOIN users u            ON d.delivered_by   = u.user_id
       WHERE ($1::date IS NULL
              OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') = $1)
         AND ($2::uuid IS NULL OR r.package_id = $2)
     ) sub
     ORDER BY sub.sr_no
     LIMIT $3 OFFSET $4`,
    [dateParam, packageParam, parseInt(limit), offset]
  );

  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = { listDeliveryLogs };
```

- [ ] **Step 2: Verify the file exists**

```bash
ls backend/src/controllers/delivery-logs.controller.js
```

Expected: file listed with no error.

---

## Task 2: Backend Route + Register in app.js

**Files:**
- Create: `backend/src/routes/delivery-logs.routes.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Create the route file**

```js
// backend/src/routes/delivery-logs.routes.js
const express = require('express');
const { requireRole } = require('../middleware/auth');
const { listDeliveryLogs } = require('../controllers/delivery-logs.controller');

const router = express.Router();

router.get('/', requireRole('PMHead', 'PMManager'), listDeliveryLogs);

module.exports = router;
```

- [ ] **Step 2: Register the route in `backend/src/app.js`**

Open `backend/src/app.js`. After line 21 (`const machineryRoutes = require('./routes/machinery.routes');`), add:

```js
const deliveryLogsRoutes = require('./routes/delivery-logs.routes');
```

Then after line 127 (`app.use('/api/machinery', authenticate, machineryRoutes);`), add:

```js
app.use('/api/delivery-logs', authenticate, deliveryLogsRoutes);
```

- [ ] **Step 3: Smoke-test the endpoint**

With the server running (nodemon restarts automatically), run:

```bash
# Replace <TOKEN> with a valid PMHead or PMManager JWT
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:4000/api/delivery-logs?limit=5"
```

Expected: JSON response `{ data: [...], total: N, page: 1, limit: 5 }` with no error.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/delivery-logs.controller.js backend/src/routes/delivery-logs.routes.js backend/src/app.js
git commit -m "feat: add GET /api/delivery-logs endpoint for PMHead and PMManager"
```

---

## Task 3: Frontend API Client

**Files:**
- Modify: `frontend/src/api/index.ts` — append new export at end of file

- [ ] **Step 1: Add `deliveryLogsApi` to `frontend/src/api/index.ts`**

Append to the end of the file (after the last `};`):

```ts
// src/api/delivery-logs.api.ts
export const deliveryLogsApi = {
  list: (params?: { date?: string; packageId?: string; page?: number; limit?: number }) =>
    client.get('/delivery-logs', { params }).then((r) => r.data),
};
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: add deliveryLogsApi client"
```

---

## Task 4: DeliveryLogsPage Component

**Files:**
- Create: `frontend/src/pages/DeliveryLogsPage.tsx`

- [ ] **Step 1: Create the page file**

```tsx
// src/pages/DeliveryLogsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { deliveryLogsApi, packagesApi } from '../api/index';

export default function DeliveryLogsPage() {
  const [filters, setFilters] = useState({
    date: '',
    packageId: '',
    page: 1,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-logs', filters],
    queryFn: () => deliveryLogsApi.list({ ...filters, limit: 20 }),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  const hasFilters = filters.date || filters.packageId;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Delivery Logs</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:flex gap-3 lg:flex-wrap">
        <input
          type="date"
          className="input"
          value={filters.date}
          onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))}
          placeholder="Delivered Date"
        />
        <select
          className="input"
          value={filters.packageId}
          onChange={(e) => setFilters((f) => ({ ...f, packageId: e.target.value, page: 1 }))}
        >
          <option value="">All Packages</option>
          {packages.map((p: any) => (
            <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="btn-secondary text-xs"
            onClick={() => setFilters({ date: '', packageId: '', page: 1 })}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No delivery logs found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  'Sr. No.', 'Reservation #', 'Delivered At', 'Package',
                  'Contractor', 'Chainage', 'Grade', 'Structure',
                  'Nature of Work', 'RFI ID', 'Qty (m³)',
                  'TM No.', 'Driver No.', 'Batching Plant', 'Logged By',
                ].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((d: any) => (
                <tr key={d.delivery_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{d.sr_no}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.reservation_number}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(d.delivered_at).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.package_name}</td>
                  <td className="px-4 py-3 text-gray-600">{d.contractor || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.chainage || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.grade?.replace('_', ' ') || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.structure || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.nature_of_work || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.rfi_id || '—'}</td>
                  <td className="px-4 py-3 font-medium">{Number(d.quantity_m3).toFixed(2)} m³</td>
                  <td className="px-4 py-3 text-gray-600">{d.tm_no}</td>
                  <td className="px-4 py-3 text-gray-600">{d.driver_no}</td>
                  <td className="px-4 py-3 text-gray-600">{d.batching_plant}</td>
                  <td className="px-4 py-3 text-gray-600">{d.logged_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Showing {((filters.page - 1) * 20) + 1}–{Math.min(filters.page * 20, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={filters.page === 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={filters.page * 20 >= total}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DeliveryLogsPage.tsx
git commit -m "feat: add DeliveryLogsPage with filters and pagination"
```

---

## Task 5: Route Registration + Nav Link

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Add import and route in `frontend/src/App.tsx`**

After line 22 (`import MachineryPage from './pages/MachineryPage';`), add:

```tsx
import DeliveryLogsPage from './pages/DeliveryLogsPage';
```

After line 96 (`<Route path="machinery" element={<MachineryPage />} />`), add:

```tsx
            <Route path="delivery-logs" element={
              <RoleRoute roles={['PMHead', 'PMManager']}><DeliveryLogsPage /></RoleRoute>
            } />
```

- [ ] **Step 2: Add nav item in `frontend/src/components/layout/AppLayout.tsx`**

Change the import on line 5 from:
```tsx
import {
  LayoutDashboard, ClipboardList, CheckSquare, Calendar,
  BarChart2, Users, Settings, LogOut, Bell, HardHat, Menu, X, Building2, Wrench
} from 'lucide-react';
```
to:
```tsx
import {
  LayoutDashboard, ClipboardList, CheckSquare, Calendar,
  BarChart2, Users, Settings, LogOut, Bell, HardHat, Menu, X, Building2, Wrench, Truck
} from 'lucide-react';
```

Then in the `navItems` array, after the Reservations entry (line 14), add:

```tsx
  { to: '/delivery-logs', icon: Truck, label: 'Delivery Logs', roles: ['PMHead', 'PMManager'] },
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors output.

- [ ] **Step 4: Manual smoke test**

1. Start the dev server if not running: `cd frontend && npm run dev`
2. Log in as PMHead or PMManager
3. Verify "Delivery Logs" link appears in the sidebar
4. Navigate to `/delivery-logs` — table loads with data, sr_no starts at 1
5. Apply a date filter — table refreshes, only that date's deliveries shown
6. Apply a package filter — table refreshes filtered
7. Clear filters — all deliveries return
8. If total > 20, verify Previous/Next pagination controls work correctly
9. Log in as a PM or Admin — verify `/delivery-logs` redirects to `/` (access denied)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/AppLayout.tsx
git commit -m "feat: add Delivery Logs nav link and route for PMHead and PMManager"
```

---

## Self-Review Checklist

- [x] Spec: PMHead + PMManager only → `requireRole('PMHead', 'PMManager')` in route + `RoleRoute` in frontend
- [x] Spec: All plants visible to all roles → no plant filter in SQL
- [x] Spec: 20 per page → `limit: 20` default in both controller and frontend call
- [x] Spec: Date filter → `DATE(...) = $1` equality filter in SQL
- [x] Spec: Package filter → `r.package_id = $2` in SQL
- [x] Spec: All 15 columns → sr_no, reservation_number, delivered_at, package_name, contractor, chainage, grade, structure, nature_of_work, rfi_id, quantity_m3, tm_no, driver_no, batching_plant, logged_by — all present in SELECT and table
- [x] Spec: Clear filters button → shown when `hasFilters` is truthy
- [x] No placeholders or TBDs
- [x] Types consistent: `deliveryLogsApi.list()` return shape matches `data?.data`, `data?.total` usage in page
- [x] Route registered at `/api/delivery-logs` with `authenticate` middleware before role check
