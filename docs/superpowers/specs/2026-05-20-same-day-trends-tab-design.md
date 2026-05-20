# Same-Day Trends Tab — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Audience:** VP, Admin (tab visible to all roles for standardisation)

---

## Problem

PMs are raising too many same-day requests. VP and Admin need date-wise visibility into the volume and frequency of same-day reservations per package so they can identify patterns and take corrective action.

---

## Scope

A new tab ("Same-Day Trends") added to the existing `ReportsPage`. Visible to all roles. No new nav entry or route needed.

---

## Data Definition

A **same-day request** is any reservation where `priority_flag = 'SameDay'`.

Pour-date logic (consistent with existing reports):  
`DATE((requested_start AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')`

---

## Backend

### New endpoint

`GET /api/reports/same-day-trends`

**Auth:** All authenticated roles (no `requireRole` restriction beyond auth middleware).

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | first day of current month | Start of date range (inclusive) |
| `to` | `YYYY-MM-DD` | today | End of date range (inclusive) |
| `package_id` | UUID | null (all packages) | Filter to a single package |

**Response:** Array of objects, one row per date that has at least one same-day request in the range:
```json
[
  { "date": "2026-05-01", "count": 4, "volume_m3": "48.00" },
  { "date": "2026-05-03", "count": 2, "volume_m3": "22.50" }
]
```

**SQL logic:**
- Filter `reservations WHERE priority_flag = 'SameDay'`
- Exclude only `'Draft'` status — cancelled/rejected same-day requests still count toward the visibility metric (they reflect PM behaviour even if the request was later pulled)
- Group by pour date
- Apply `from`/`to` date range on the pour date
- Apply `package_id` filter when provided
- Also return a summary row (total count, total m³, total all reservations) for KPI calculation — returned as a separate `/same-day-trends/summary` sub-endpoint or as a `meta` field alongside the array

**Summary data needed for KPIs:**
- `total_same_day` — count of same-day reservations in range/package
- `total_volume_m3` — sum of `quantity_m3` for same-day reservations
- `total_all` — count of ALL reservations in same range/package (for % calculation)

Return both `rows` (array) and `summary` (object) in a single response:
```json
{
  "rows": [...],
  "summary": {
    "total_same_day": 18,
    "total_volume_m3": "216.00",
    "total_all": 120,
    "same_day_pct": 15
  }
}
```

---

## Frontend

### Tab structure

Add tab navigation to `ReportsPage` with three tabs:
1. **Overview** — existing SLA + package-wise content (current default view)
2. **Downloads** — existing daily pour report + delivery log download cards
3. **Same-Day Trends** — new tab

The tab switcher renders at the top of the page above all existing content. Active tab is tracked in local state (defaults to "Overview" so existing behaviour is unchanged).

### Same-Day Trends tab layout

```
[ Filters: From | To | Package dropdown ]

[ KPI: Total same-day | Total m³ | Same-day % ]

[ Chart 1: Bar chart — Count of same-day requests per day ]

[ Chart 2: Bar chart — Volume (m³) of same-day requests per day ]
```

### Filters

- **From / To date inputs** — default: first day of current month → today (IST)
- **Package dropdown** — single-select, options: "All Packages" + one entry per package fetched from existing `GET /api/packages` endpoint. Default: "All Packages".

### KPI strip

Three stat cards:
- **Same-Day Requests** — `summary.total_same_day`
- **Total Volume (m³)** — `summary.total_volume_m3`
- **Same-Day %** — `summary.same_day_pct`%  (same-day as % of all reservations in period)

### Charts

**Library:** `recharts` (to be installed as a new dependency).

**Chart 1 — Daily Count:**
- `BarChart` from recharts
- X-axis: date string (`YYYY-MM-DD`)
- Y-axis: count (integer)
- Bar fill: orange (`#f97316`) to visually distinguish from normal report charts
- Tooltip: date + count
- Empty state: "No same-day requests in this period" message

**Chart 2 — Daily Volume (m³):**
- `BarChart` from recharts
- X-axis: date string
- Y-axis: volume in m³ (decimal, 2dp)
- Bar fill: amber (`#f59e0b`)
- Tooltip: date + m³
- Empty state: same message as Chart 1

Both charts: `ResponsiveContainer` width=100%, height=260px. X-axis tick labels rotated -45° when date range > 14 days.

### API integration

New query key: `['report-same-day-trends', params]` using `@tanstack/react-query`.  
Fetch function added to `frontend/src/api/index.ts` under `reportsApi`.

---

## Files to create / modify

| File | Change |
|---|---|
| `backend/src/routes/report.routes.js` | Add `GET /same-day-trends` route |
| `frontend/src/pages/ReportsPage.tsx` | Add tab nav + Same-Day Trends tab component |
| `frontend/src/api/index.ts` | Add `reportsApi.sameDayTrends()` fetch |
| `frontend/package.json` | Add `recharts` dependency |

---

## Out of scope

- Exporting same-day trends to Excel (can be added later)
- Alerting / notifications when same-day count exceeds a threshold
- PM-level scoping (this tab is for leadership visibility; PMs already can't see it in a meaningful scoped way)

---

## Open questions (resolved)

| Question | Decision |
|---|---|
| New page or tab? | Tab inside existing ReportsPage |
| Role restriction? | Visible to all roles (standardised) |
| Chart type? | Two separate bar charts (count + volume) |
| Package filter? | Single-select dropdown; unselected = all |
| Default date range? | Current month |
| Charting library? | Recharts (new dependency) |
