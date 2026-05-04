# Delivery Logs Page — Design Spec

**Date:** 2026-05-04
**Roles affected:** PMHead, PMManager (pmm1, pmm2, pmm3, pmm4)

---

## Overview

Add a new dedicated Delivery Logs page for the P&M team. It lists all delivery log entries as paginated rows (20 per page), with a date filter and package filter, mirroring the structure of the existing Reservations page.

All P&M roles (PMHead and all PMManagers) see deliveries across all batching plants — no plant-level scoping.

---

## Backend

### New Route File
`backend/src/routes/delivery-logs.routes.js`

### Endpoint
`GET /delivery-logs`

**Auth:** `requireRole('PMHead', 'PMManager')`

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `date` | YYYY-MM-DD | Filter by `delivered_at` date (optional) |
| `packageId` | UUID | Filter by package (optional) |
| `page` | integer | Page number, default 1 |
| `limit` | integer | Records per page, default 20 |

**Response:**
```json
{
  "data": [...],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

**Each row contains:**
- `sr_no` — row number within current page
- `delivery_id`
- `reservation_number`
- `delivered_at` (ISO timestamp)
- `package_name`
- `contractor`
- `chainage`
- `grade`
- `structure`
- `nature_of_work`
- `rfi_id`
- `quantity_m3`
- `tm_no`
- `driver_no`
- `batching_plant`
- `logged_by` (name of the user who logged the delivery)

**Query logic:**
- JOIN `reservation_deliveries` → `reservations` → `packages` → `contractors` → `users` (for logged_by)
- Filter by `DATE(delivered_at) = $date` when date param provided
- Filter by `reservations.package_id = $packageId` when packageId provided
- ORDER BY `delivered_at DESC`
- LIMIT/OFFSET for pagination

### New Controller Function
`backend/src/controllers/delivery-logs.controller.js`

Single exported function: `listDeliveryLogs(req, res)`

### Route Registration
Registered in `backend/src/server.js` alongside existing routes:
```js
app.use('/delivery-logs', deliveryLogsRouter);
```

---

## Frontend

### New Page File
`frontend/src/pages/DeliveryLogsPage.tsx`

**Structure mirrors `ReservationsPage.tsx`:**
- Local state: `date`, `packageId`, `page`, `data`, `total`, `loading`
- `useEffect` triggers fetch on filter/page change
- Filters reset page to 1 on change

### Filters Bar
- **Date picker** — single date input, filters by `delivered_at` date; label "Delivered Date"
- **Package dropdown** — populated via existing packages API (`/packages`); default "All Packages"
- **Clear Filters button** — resets both filters and page to defaults

### Table Columns (in order)

| # | Header | Field |
|---|--------|-------|
| 1 | Sr. No. | `sr_no` |
| 2 | Reservation # | `reservation_number` |
| 3 | Delivered At | `delivered_at` (formatted: DD MMM YYYY, HH:MM) |
| 4 | Package | `package_name` |
| 5 | Contractor | `contractor` |
| 6 | Chainage | `chainage` |
| 7 | Grade | `grade` |
| 8 | Structure | `structure` |
| 9 | Nature of Work | `nature_of_work` |
| 10 | RFI ID | `rfi_id` |
| 11 | Qty (m³) | `quantity_m3` (2 decimal places) |
| 12 | TM No. | `tm_no` |
| 13 | Driver No. | `driver_no` |
| 14 | Batching Plant | `batching_plant` |
| 15 | Logged By | `logged_by` |

### Pagination
Same Previous/Next controls as ReservationsPage. Shows "Page X of Y" and total record count.

### API Client
New function added to `frontend/src/api/index.ts`:
```ts
getDeliveryLogs(params: { date?: string; packageId?: string; page?: number; limit?: number })
```

### Routing
- Route: `/delivery-logs` added to `frontend/src/App.tsx`
- Protected by role check: `PMHead`, `PMManager`
- "Delivery Logs" nav link added to sidebar for these roles

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/routes/delivery-logs.routes.js` | New file |
| `backend/src/controllers/delivery-logs.controller.js` | New file |
| `backend/src/server.js` | Register new route |
| `frontend/src/pages/DeliveryLogsPage.tsx` | New file |
| `frontend/src/api/index.ts` | Add `getDeliveryLogs` function |
| `frontend/src/App.tsx` | Add `/delivery-logs` route |
| `frontend/src/components/layout/AppLayout.tsx` | Add nav item for PMHead/PMManager in `navItems` array |

---

## Out of Scope

- Editing or deleting delivery logs from this page (read-only list)
- Export/CSV functionality (handled by existing Reports page)
- Plant-level filtering for PMManagers (all see all plants)
