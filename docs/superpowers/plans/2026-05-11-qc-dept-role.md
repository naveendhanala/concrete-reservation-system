# QC-dept Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `QC-dept` role that can only access the Delivery Logs tab, landing there directly after login with no other navigation visible.

**Architecture:** `QC-dept` slots into the existing RBAC system — PostgreSQL ENUM → JWT → frontend route guard + nav filter → backend middleware. A `HomeRedirect` component already handles role-based root redirects (used by `LabourMob`); `QC-dept` follows the same pattern.

**Tech Stack:** PostgreSQL (ENUM migration), Node.js/Express (`requireRole` middleware), React + TypeScript (`AuthContext`, `AppLayout`, `App`)

---

### Task 1: Database Migration — Add QC-dept to user_role ENUM

**Files:**
- Create: `backend/src/db/migrations/034_qc_dept_role.sql`

- [ ] **Step 1: Create the migration file**

```sql
ALTER TYPE user_role ADD VALUE 'QC-dept';
```

Save to `backend/src/db/migrations/034_qc_dept_role.sql`.

- [ ] **Step 2: Run the migration against the database**

Run this in the backend directory or via your DB client:
```bash
psql $DATABASE_URL -f src/db/migrations/034_qc_dept_role.sql
```

Expected: `ALTER TYPE` with no errors.

> Note: PostgreSQL ENUM additions are transactional but cannot be rolled back once committed. Verify the DB URL before running.

- [ ] **Step 3: Verify the ENUM was updated**

```sql
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'user_role'
ORDER BY enumsortorder;
```

Expected output includes `QC-dept` as the last entry.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/034_qc_dept_role.sql
git commit -m "feat: add QC-dept to user_role enum"
```

---

### Task 2: Backend — Allow QC-dept to Access Delivery Logs API

**Files:**
- Modify: `backend/src/routes/delivery-logs.routes.js:8`

- [ ] **Step 1: Update requireRole to include QC-dept**

In `backend/src/routes/delivery-logs.routes.js`, change line 8 from:
```javascript
router.get('/', requireRole('PMHead', 'PMManager'), listDeliveryLogs);
```
to:
```javascript
router.get('/', requireRole('PMHead', 'PMManager', 'QC-dept'), listDeliveryLogs);
```

- [ ] **Step 2: Verify no other delivery-logs routes need updating**

Check the full file — there should be only the one `router.get` line. The file should look like:
```javascript
// backend/src/routes/delivery-logs.routes.js
const express = require('express');
const { requireRole } = require('../middleware/auth');
const { listDeliveryLogs } = require('../controllers/delivery-logs.controller');

const router = express.Router();

router.get('/', requireRole('PMHead', 'PMManager', 'QC-dept'), listDeliveryLogs);

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/delivery-logs.routes.js
git commit -m "feat: grant QC-dept access to delivery logs API"
```

---

### Task 3: Frontend Types — Add QC-dept to Role Union

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx:9`

- [ ] **Step 1: Add QC-dept to the role union type**

In `frontend/src/context/AuthContext.tsx`, change line 9 from:
```typescript
  role: 'PM' | 'ClusterHead' | 'VP' | 'PMHead' | 'PMManager' | 'Admin' | 'Engineer' | 'LabourMob';
```
to:
```typescript
  role: 'PM' | 'ClusterHead' | 'VP' | 'PMHead' | 'PMManager' | 'Admin' | 'Engineer' | 'LabourMob' | 'QC-dept';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/AuthContext.tsx
git commit -m "feat: add QC-dept to User role type"
```

---

### Task 4: Frontend Navigation — Show Delivery Logs Tab for QC-dept

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx:15` (nav item)
- Modify: `frontend/src/components/layout/AppLayout.tsx:112-120` (badge color)

- [ ] **Step 1: Add QC-dept to the Delivery Logs nav item roles**

In `frontend/src/components/layout/AppLayout.tsx`, change line 15 from:
```typescript
  { to: '/delivery-logs', icon: Truck, label: 'Delivery Logs', roles: ['PMHead', 'PMManager'] },
```
to:
```typescript
  { to: '/delivery-logs', icon: Truck, label: 'Delivery Logs', roles: ['PMHead', 'PMManager', 'QC-dept'] },
```

- [ ] **Step 2: Add badge color for QC-dept**

In `frontend/src/components/layout/AppLayout.tsx`, change the `roleBadgeColor` object (lines 112-120) from:
```typescript
  const roleBadgeColor: Record<string, string> = {
    PM: 'bg-blue-100 text-blue-800',
    ClusterHead: 'bg-purple-100 text-purple-800',
    VP: 'bg-orange-100 text-orange-800',
    PMHead: 'bg-green-100 text-green-800',
    PMManager: 'bg-teal-100 text-teal-800',
    Admin: 'bg-red-100 text-red-800',
    LabourMob: 'bg-amber-100 text-amber-800',
  };
```
to:
```typescript
  const roleBadgeColor: Record<string, string> = {
    PM: 'bg-blue-100 text-blue-800',
    ClusterHead: 'bg-purple-100 text-purple-800',
    VP: 'bg-orange-100 text-orange-800',
    PMHead: 'bg-green-100 text-green-800',
    PMManager: 'bg-teal-100 text-teal-800',
    Admin: 'bg-red-100 text-red-800',
    LabourMob: 'bg-amber-100 text-amber-800',
    'QC-dept': 'bg-cyan-100 text-cyan-800',
  };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppLayout.tsx
git commit -m "feat: add QC-dept to delivery logs nav and badge color"
```

---

### Task 5: Frontend Routing — Redirect QC-dept to Delivery Logs

**Files:**
- Modify: `frontend/src/App.tsx:70-74` (`HomeRedirect`)
- Modify: `frontend/src/App.tsx:106-108` (Delivery Logs `RoleRoute`)

- [ ] **Step 1: Add QC-dept redirect in HomeRedirect**

In `frontend/src/App.tsx`, change the `HomeRedirect` function (lines 70-74) from:
```typescript
function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'LabourMob') return <Navigate to="/daily-log" replace />;
  return <DashboardPage />;
}
```
to:
```typescript
function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'LabourMob') return <Navigate to="/daily-log" replace />;
  if (user?.role === 'QC-dept') return <Navigate to="/delivery-logs" replace />;
  return <DashboardPage />;
}
```

- [ ] **Step 2: Add QC-dept to the Delivery Logs RoleRoute**

In `frontend/src/App.tsx`, change lines 106-108 from:
```typescript
            <Route path="delivery-logs" element={
              <RoleRoute roles={['PMHead', 'PMManager']}><DeliveryLogsPage /></RoleRoute>
            } />
```
to:
```typescript
            <Route path="delivery-logs" element={
              <RoleRoute roles={['PMHead', 'PMManager', 'QC-dept']}><DeliveryLogsPage /></RoleRoute>
            } />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: redirect QC-dept to delivery logs on login"
```

---

### Task 6: Manual Verification

- [ ] **Step 1: Start the dev servers**

Backend:
```bash
cd backend && npm run dev
```

Frontend (separate terminal):
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Create a QC-dept test user via the database**

```sql
INSERT INTO users (name, role, email, login_id, password_hash, active_flag)
VALUES ('QC Test User', 'QC-dept', 'qc@test.com', 'qctest', '<bcrypt_hash_of_password>', true);
```

Or use the Admin → Users page if the Users page supports the new role (it will, since the ENUM is updated in the DB).

- [ ] **Step 3: Log in as the QC-dept user and verify**

Checklist:
- [ ] After login, browser URL is `/delivery-logs` (not `/`)
- [ ] Sidebar shows only "Delivery Logs" — no Dashboard, Reservations, Approvals, etc.
- [ ] The role badge in the sidebar shows "QC-dept" in cyan
- [ ] Delivery Logs page loads with data
- [ ] Manually navigating to `/` redirects back to `/delivery-logs`
- [ ] Manually navigating to `/reservations` redirects back to `/delivery-logs` (via `RoleRoute` → `/` → `HomeRedirect` → `/delivery-logs`)
