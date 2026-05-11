# QC-dept Role Design

**Date:** 2026-05-11

## Overview

Add a new `QC-dept` role to the Concrete Reservation System. Users with this role can access only the "Delivery Logs" tab and are redirected there immediately after login — no other navigation is visible.

## Requirements

- New role named `QC-dept`
- Access to Delivery Logs tab only (read-only — page has no write actions)
- After login, user lands directly on `/delivery-logs`
- Attempting to visit any other route redirects back to `/delivery-logs`
- No access to Dashboard, Reservations, Approvals, Calendar, Reports, Users, Daily Log, Contractors, Labour Mobilization Report, Machinery, or Settings

## Architecture

The `QC-dept` role slots into the existing RBAC system without structural changes. It is stored in the DB enum, carried in the JWT, and enforced on both frontend route guards and backend middleware — identical to every other role.

## Changes Required

### 1. Database Migration

New migration file: `backend/src/db/migrations/0XX_qc_dept_role.sql`

```sql
ALTER TYPE user_role ADD VALUE 'QC-dept';
```

### 2. Backend — Delivery Logs Route

**File:** `backend/src/routes/delivery-logs.routes.js`

Add `'QC-dept'` to the `requireRole()` call:

```javascript
router.get('/', requireRole('PMHead', 'PMManager', 'QC-dept'), listDeliveryLogs);
```

### 3. Frontend — TypeScript Types

**File:** `frontend/src/context/AuthContext.tsx`

Add `'QC-dept'` to the `User.role` union:

```typescript
role: 'PM' | 'ClusterHead' | 'VP' | 'PMHead' | 'PMManager' | 'Admin' | 'Engineer' | 'LabourMob' | 'QC-dept';
```

### 4. Frontend — Navigation

**File:** `frontend/src/components/layout/AppLayout.tsx`

- Add `'QC-dept'` to the Delivery Logs nav item's `roles[]` array only
- Add a badge color entry for `QC-dept` (cyan: `'bg-cyan-100 text-cyan-800'`)

### 5. Frontend — Route Guards

**File:** `frontend/src/App.tsx`

Two changes:

a) Add `'QC-dept'` to the Delivery Logs `RoleRoute`:
```tsx
<RoleRoute roles={['PMHead', 'PMManager', 'QC-dept']}>
  <DeliveryLogsPage />
</RoleRoute>
```

b) In the root `/` route, redirect `QC-dept` before the Dashboard renders:
```tsx
// Inside the root route element, before rendering Dashboard:
if (user?.role === 'QC-dept') return <Navigate to="/delivery-logs" replace />;
```

## Data Flow

1. User logs in with `QC-dept` role → JWT issued with role
2. Frontend reads role from auth context → root route redirects to `/delivery-logs`
3. Sidebar renders only the Delivery Logs nav item (filtered by role)
4. Navigating to any other route → `RoleRoute` redirects to `/` → root redirects to `/delivery-logs`
5. Backend `requireRole('PMHead', 'PMManager', 'QC-dept')` allows the delivery logs API call

## Out of Scope

- No new UI components
- No changes to the Delivery Logs page itself
- No write permissions needed (page is read-only)
- No package-level filtering specific to QC-dept (inherits existing date/package filters)
