# Same-Day Trends Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Same-Day Trends" tab to the Reports page showing date-wise bar charts (count + volume m³) of same-day reservation requests, filterable by package and date range.

**Architecture:** New backend endpoint returns daily same-day request stats + summary KPIs. Frontend refactors ReportsPage into 3 tabs (Overview, Downloads, Same-Day Trends) and renders two Recharts BarCharts in the new tab.

**Tech Stack:** Express.js (backend), React + TypeScript + Recharts + TanStack Query (frontend), PostgreSQL (data), Tailwind CSS (styling).

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/src/routes/report.routes.js` | Modify | Add `GET /same-day-trends` route |
| `frontend/package.json` | Modify | Add `recharts` dependency |
| `frontend/src/api/index.ts` | Modify | Add `reportsApi.sameDayTrends()` |
| `frontend/src/pages/ReportsPage.tsx` | Modify | Refactor into 3 tabs; add SameDayTrendsTab inline component |

No new files are needed — the tab component is small enough to live inline in ReportsPage.tsx (consistent with how the page currently organises all its content).

---

## Task 1: Install recharts

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install the package**

Run from the `frontend/` directory:
```bash
npm install recharts
```

- [ ] **Step 2: Verify**

Check `frontend/package.json` — `"recharts"` should now appear under `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add recharts for same-day trends charts"
```

---

## Task 2: Backend — Add `/api/reports/same-day-trends` endpoint

**Files:**
- Modify: `backend/src/routes/report.routes.js`

Context: This file already defines the `POUR_DATE` constant at the top:
```js
const POUR_DATE = `DATE((r.requested_start AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')`;
```
Use that same constant in the new route for consistency.

- [ ] **Step 1: Add the route**

Open `backend/src/routes/report.routes.js`. Add this block **before** the `module.exports = router;` line at the bottom of the file:

```js
// Same-day trends — count and volume of SameDay-flagged reservations per day
router.get('/same-day-trends', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);

  const [{ rows }, { rows: summaryRows }] = await Promise.all([
    // Daily breakdown
    query(
      `SELECT
         ${POUR_DATE}                        AS date,
         COUNT(*)                            AS count,
         COALESCE(SUM(r.quantity_m3), 0)    AS volume_m3
       FROM reservations r
       WHERE r.priority_flag = 'SameDay'
         AND r.status != 'Draft'
         AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY ${POUR_DATE}
       ORDER BY ${POUR_DATE}`,
      [from || null, to || null, packageId]
    ),
    // Summary KPIs (all reservations in range for % calculation)
    query(
      `SELECT
         COUNT(*) FILTER (WHERE r.priority_flag = 'SameDay' AND r.status != 'Draft')          AS total_same_day,
         COALESCE(
           SUM(r.quantity_m3) FILTER (WHERE r.priority_flag = 'SameDay' AND r.status != 'Draft'),
           0
         )                                                                                      AS total_volume_m3,
         COUNT(*) FILTER (WHERE r.status != 'Draft')                                           AS total_all
       FROM reservations r
       WHERE ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)`,
      [from || null, to || null, packageId]
    ),
  ]);

  const s = summaryRows[0];
  const totalAll = parseInt(s.total_all) || 0;
  const totalSameDay = parseInt(s.total_same_day) || 0;

  res.json({
    rows,
    summary: {
      total_same_day: totalSameDay,
      total_volume_m3: parseFloat(s.total_volume_m3 || 0).toFixed(2),
      total_all: totalAll,
      same_day_pct: totalAll > 0 ? Math.round((totalSameDay / totalAll) * 100) : 0,
    },
  });
}));
```

- [ ] **Step 2: Manually verify the endpoint**

Start the backend (`npm run dev` in `backend/`) and hit the endpoint with curl or a browser:
```
GET http://localhost:4000/api/reports/same-day-trends?from=2026-05-01&to=2026-05-20
```

Expected response shape:
```json
{
  "rows": [
    { "date": "2026-05-03", "count": "2", "volume_m3": "22.00" }
  ],
  "summary": {
    "total_same_day": 2,
    "total_volume_m3": "22.00",
    "total_all": 45,
    "same_day_pct": 4
  }
}
```
If there are no same-day reservations in the DB yet, `rows` will be `[]` and `summary.total_same_day` will be `0` — that is correct.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/report.routes.js
git commit -m "feat: add GET /reports/same-day-trends endpoint"
```

---

## Task 3: Frontend — Add API function

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: Add `sameDayTrends` to `reportsApi`**

Open `frontend/src/api/index.ts`. Find the `reportsApi` object (currently ends with `labourMobilization`). Add one entry:

```ts
// Inside reportsApi object, after labourMobilization:
  sameDayTrends: (params: Record<string, any>) =>
    client.get('/reports/same-day-trends', { params }).then((r) => r.data),
```

The full `reportsApi` block will look like:
```ts
export const reportsApi = {
  sla: (params: Record<string, any>) =>
    client.get('/reports/sla', { params }).then((r) => r.data),
  utilization: (params: Record<string, any>) =>
    client.get('/reports/utilization', { params }).then((r) => r.data),
  audit: (params: Record<string, any>) =>
    client.get('/reports/audit', { params }).then((r) => r.data),
  packages: (params: Record<string, any>) =>
    client.get('/reports/packages', { params }).then((r) => r.data),
  daily: (date: string) =>
    client.get('/reports/daily', { params: { date } }).then((r) => r.data),
  deliveries: (params: Record<string, any>) =>
    client.get('/reports/deliveries', { params }).then((r) => r.data),
  labourMobilization: (date?: string) =>
    client.get('/reports/labour-mobilization', { params: date ? { date } : {} }).then((r) => r.data),
  sameDayTrends: (params: Record<string, any>) =>
    client.get('/reports/same-day-trends', { params }).then((r) => r.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: add sameDayTrends API function"
```

---

## Task 4: Frontend — Refactor ReportsPage into tabs

**Files:**
- Modify: `frontend/src/pages/ReportsPage.tsx`

Context: The current page is a flat list of sections with no tab structure. We need to wrap existing content into two tabs (Overview, Downloads) and add a third (Same-Day Trends). The tab state is local — no URL changes needed.

- [ ] **Step 1: Add tab state and tab switcher UI**

Open `frontend/src/pages/ReportsPage.tsx`. At the top of the `ReportsPage` component function, add a `tab` state variable after the existing state declarations:

```tsx
const [tab, setTab] = useState<'overview' | 'downloads' | 'sameday'>('overview');
```

Replace the existing `<h1>` heading at the top of the return with this block (heading + tab bar):

```tsx
<div>
  <h1 className="text-xl font-bold text-gray-900 mb-4">Reports & Analytics</h1>

  {/* Tab bar */}
  <div className="flex gap-1 border-b border-gray-200 mb-6">
    {(
      [
        { key: 'overview', label: 'Overview' },
        { key: 'downloads', label: 'Downloads' },
        { key: 'sameday', label: 'Same-Day Trends' },
      ] as const
    ).map(({ key, label }) => (
      <button
        key={key}
        onClick={() => setTab(key)}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          tab === key
            ? 'border-primary-600 text-primary-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
```

- [ ] **Step 2: Wrap existing content into Overview and Downloads tabs**

After the tab bar, the rest of the JSX currently renders all sections unconditionally. Wrap them as follows:

```tsx
  {/* ── DOWNLOADS TAB ──────────────────────────────────────── */}
  {tab === 'downloads' && (
    <div className="space-y-6">
      {canDownloadDaily && (
        <div className="card p-4 flex flex-wrap items-end gap-3">
          {/* Daily Pour Report card — keep existing JSX exactly */}
          ...
        </div>
      )}
      {canDownloadDaily && (
        <div className="card p-4 flex flex-wrap items-end gap-3">
          {/* Delivery Log Report card — keep existing JSX exactly */}
          ...
        </div>
      )}
    </div>
  )}

  {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
  {tab === 'overview' && (
    <div>
      {/* Date filters */}
      {/* Summary KPIs */}
      {/* SLA Table */}
      {/* Package-wise Summary */}
      {/* ...all existing JSX for these sections, unchanged... */}
    </div>
  )}

  {/* ── SAME-DAY TRENDS TAB ────────────────────────────────── */}
  {tab === 'sameday' && (
    <SameDayTrendsTab />
  )}
</div>
```

The full replacement of `ReportsPage` return (complete file after this step) should look like the code in Step 3 of Task 5 below — write it all at once in that task.

- [ ] **Step 3: Verify the tab switcher works**

Run the frontend (`npm run dev` in `frontend/`). Open the Reports page. You should see three tab buttons at the top. Clicking "Overview" and "Downloads" should show the correct existing content. "Same-Day Trends" renders nothing yet (added in Task 5).

---

## Task 5: Frontend — Build SameDayTrendsTab component and complete ReportsPage rewrite

**Files:**
- Modify: `frontend/src/pages/ReportsPage.tsx`

This task rewrites `ReportsPage.tsx` completely, integrating the tab refactor from Task 4 and the new SameDayTrendsTab component.

- [ ] **Step 1: Write the complete new ReportsPage.tsx**

Replace the entire contents of `frontend/src/pages/ReportsPage.tsx` with:

```tsx
// src/pages/ReportsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, packagesApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

async function downloadDailyReport(date: string) {
  if (!date) { toast.error('Please select a date'); return; }
  const toastId = toast.loading('Generating report…');
  try {
    const XLSX = await import('xlsx');
    const rows: any[] = await reportsApi.daily(date);
    if (rows.length === 0) {
      toast.dismiss(toastId);
      toast.error('No reservations found for this date');
      return;
    }
    const sheetData = [
      ['Sr.No', 'Date', 'Contractor', 'Chainage', 'Package', 'Grade',
       'Actual Qty (m³)', 'Structure', 'Nature of Work', 'RFI ID', 'TM No.', 'Batching Plant'],
      ...rows.map((r) => [
        Number(r.sr_no), r.date, r.contractor, r.chainage, r.package_name, r.grade,
        r.actual_quantity_m3 != null ? Number(r.actual_quantity_m3) : '',
        r.structure, r.nature_of_work, r.rfi_id, r.tm_nos, r.batching_plants,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 24 },
      { wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report');
    XLSX.writeFile(wb, `Daily_Pour_Report_${date}.xlsx`);
    toast.dismiss(toastId);
    toast.success(`Report downloaded — ${rows.length} reservation(s)`);
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(err.response?.data?.error || 'Failed to generate report');
  }
}

async function downloadDeliveryReport(from: string, to: string) {
  if (!from || !to) { toast.error('Please select a date range'); return; }
  const toastId = toast.loading('Generating report…');
  try {
    const XLSX = await import('xlsx');
    const rows: any[] = await reportsApi.deliveries({ from, to });
    if (rows.length === 0) {
      toast.dismiss(toastId);
      toast.error('No delivery logs found for this range');
      return;
    }
    const sheetData = [
      ['Sr.No', 'Delivered At', 'Reservation No.', 'Contractor', 'Chainage', 'Package', 'Grade',
       'Structure', 'Nature of Work', 'RFI ID', 'Qty (m³)', 'TM No.', 'Driver No.', 'Batching Plant', 'Logged By'],
      ...rows.map((r) => [
        Number(r.sr_no),
        r.delivered_at ? new Date(r.delivered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        r.reservation_number, r.contractor, r.chainage, r.package_name, r.grade,
        r.structure, r.nature_of_work, r.rfi_id,
        r.quantity_m3 != null ? Number(r.quantity_m3) : '',
        r.tm_no, r.driver_no, r.batching_plant, r.logged_by,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 24 },
      { wch: 10 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Logs');
    XLSX.writeFile(wb, `Delivery_Log_Report_${from}_to_${to}.xlsx`);
    toast.dismiss(toastId);
    toast.success(`Report downloaded — ${rows.length} delivery log(s)`);
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(err.response?.data?.error || 'Failed to generate report');
  }
}

// ── Same-Day Trends tab ────────────────────────────────────────────────────────

function SameDayTrendsTab() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [range, setRange] = useState({ from: firstOfMonth, to: today });
  const [packageId, setPackageId] = useState<string>('');

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
  });

  const params: Record<string, any> = { from: range.from, to: range.to };
  if (packageId) params.package_id = packageId;

  const { data, isLoading } = useQuery({
    queryKey: ['report-same-day-trends', params],
    queryFn: () => reportsApi.sameDayTrends(params),
  });

  const rows: { date: string; count: string; volume_m3: string }[] = data?.rows ?? [];
  const summary = data?.summary ?? {
    total_same_day: 0,
    total_volume_m3: '0.00',
    total_all: 0,
    same_day_pct: 0,
  };

  // Recharts needs numeric values
  const chartData = rows.map((r) => ({
    date: r.date,
    count: parseInt(r.count),
    volume_m3: parseFloat(r.volume_m3),
  }));

  const rotateTicks = chartData.length > 14;

  const emptyState = (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400">
      No same-day requests in this period
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Package</label>
          <select
            className="input"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            <option value="">All Packages</option>
            {packages.map((p: any) => (
              <option key={p.package_id} value={p.package_id}>
                {p.package_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Same-Day Requests', value: summary.total_same_day },
          { label: 'Total Volume (m³)', value: summary.total_volume_m3 },
          { label: 'Same-Day %', value: `${summary.same_day_pct}%` },
        ].map((k) => (
          <div key={k.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : (
        <>
          {/* Chart 1 — Daily count */}
          <div className="card p-4 mb-6">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              Same-Day Requests — Daily Count
            </p>
            {chartData.length === 0 ? emptyState : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: rotateTicks ? 48 : 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={rotateTicks ? -45 : 0}
                    textAnchor={rotateTicks ? 'end' : 'middle'}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, 'Requests']} />
                  <Bar dataKey="count" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2 — Daily volume */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              Same-Day Requests — Daily Volume (m³)
            </p>
            {chartData.length === 0 ? emptyState : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: rotateTicks ? 48 : 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={rotateTicks ? -45 : 0}
                    textAnchor={rotateTicks ? 'end' : 'middle'}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} m³`, 'Volume']} />
                  <Bar dataKey="volume_m3" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useAuth();
  const isPM = user?.role === 'PM';
  const isPMHead = user?.role === 'PMHead';
  const isAdmin = user?.role === 'Admin';
  const isPMManager = user?.role === 'PMManager';
  const isClusterHead = user?.role === 'ClusterHead';
  const isVP = user?.role === 'VP';
  const canDownloadDaily = isPMHead || isPMManager || isPM || isAdmin || isClusterHead || isVP;

  const [tab, setTab] = useState<'overview' | 'downloads' | 'sameday'>('overview');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dlRange, setDlRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const packageId = isPM ? user?.packageIds[0] : undefined;
  const apiParams = { ...range, ...(packageId ? { package_id: packageId } : {}) };

  const { data: slaData = [], isLoading } = useQuery({
    queryKey: ['report-sla', apiParams],
    queryFn: () => reportsApi.sla(apiParams),
  });

  const { data: packageData = [] } = useQuery({
    queryKey: ['report-packages', apiParams],
    queryFn: () => reportsApi.packages(apiParams),
  });

  const totals = slaData.reduce((acc: any, row: any) => ({
    total: acc.total + parseInt(row.total),
    completed: acc.completed + parseInt(row.completed),
    cancelled: acc.cancelled + parseInt(row.cancelled),
    on_time: acc.on_time + parseInt(row.on_time || 0),
  }), { total: 0, completed: 0, cancelled: 0, on_time: 0 });

  const onTimeRate = totals.completed > 0
    ? Math.round((totals.on_time / totals.completed) * 100) : 0;

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'downloads', label: 'Downloads' },
    { key: 'sameday', label: 'Same-Day Trends' },
  ] as const;

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Reports & Analytics</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Downloads tab ────────────────────────────────── */}
      {tab === 'downloads' && (
        <div className="space-y-6">
          {canDownloadDaily && (
            <div className="card p-4 flex flex-wrap items-end gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Daily Pour Report</p>
                <p className="text-xs text-gray-400">Download all reservations for a selected date as Excel</p>
              </div>
              <div className="ml-auto flex items-end gap-3">
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    className="input"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => downloadDailyReport(dailyDate)}
                  className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> Download Excel
                </button>
              </div>
            </div>
          )}
          {canDownloadDaily && (
            <div className="card p-4 flex flex-wrap items-end gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Delivery Log Report</p>
                <p className="text-xs text-gray-400">Download all delivery trips logged in a date range as Excel</p>
              </div>
              <div className="ml-auto flex items-end gap-3">
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input" value={dlRange.from}
                    onChange={(e) => setDlRange((r) => ({ ...r, from: e.target.value }))} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input" value={dlRange.to}
                    onChange={(e) => setDlRange((r) => ({ ...r, to: e.target.value }))} />
                </div>
                <button
                  onClick={() => downloadDeliveryReport(dlRange.from, dlRange.to)}
                  className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> Download Excel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Overview tab ─────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          {/* Date filters */}
          <div className="card p-4 mb-6 grid grid-cols-2 sm:flex gap-3 sm:flex-wrap items-end">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
            {isPM && (
              <div>
                <label className="label">Package</label>
                <div className="input bg-gray-50 text-gray-700 cursor-not-allowed select-none">
                  {user?.packageNames[0] ?? '—'}
                </div>
              </div>
            )}
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Reservations', value: totals.total },
              { label: 'Completed', value: totals.completed },
              { label: 'On-Time Rate', value: `${onTimeRate}%` },
            ].map((k) => (
              <div key={k.label} className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          {/* SLA Table */}
          <div className="card overflow-hidden overflow-x-auto mb-6">
            <div className="p-4 border-b border-gray-100 font-semibold text-sm">Daily SLA Performance</div>
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Date', 'Total', 'Completed', 'On-Time', 'Requested (m³)', 'Actual (m³)'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slaData.map((row: any) => (
                    <tr key={row.date} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">{row.date}</td>
                      <td className="px-4 py-2.5 font-medium">{row.total}</td>
                      <td className="px-4 py-2.5 text-green-600">{row.completed}</td>
                      <td className="px-4 py-2.5">{row.on_time || 0}</td>
                      <td className="px-4 py-2.5">{parseFloat(row.total_requested_m3 || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5">{parseFloat(row.total_actual_m3 || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {slaData.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data for selected range</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Package-wise Summary */}
          <div className="card overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-100 font-semibold text-sm">Package-wise Quantity Summary</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Package', 'Total', 'Completed', 'Requested (m³)', 'Actual (m³)'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packageData.map((row: any) => (
                  <tr key={row.package_name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{row.package_name}</td>
                    <td className="px-4 py-2.5">{row.total}</td>
                    <td className="px-4 py-2.5 text-green-600">{row.completed}</td>
                    <td className="px-4 py-2.5">{parseFloat(row.total_requested_m3 || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5">{parseFloat(row.total_actual_m3 || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {packageData.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No data for selected range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Same-Day Trends tab ───────────────────────────── */}
      {tab === 'sameday' && <SameDayTrendsTab />}
    </div>
  );
}
```

**Important:** The `dlRange` state is a new variable (separate from `range`) that controls the delivery log download date range. This avoids the current bug where the two download cards and the SLA date filter all shared the same `range` state.

- [ ] **Step 2: Verify TypeScript compiles**

Run from `frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors. If you see "Cannot find module 'recharts'" ensure Task 1 (npm install) was completed first.

- [ ] **Step 3: Verify in the browser**

Start the dev server (`npm run dev` in `frontend/`). Log in as any user. Go to Reports.

Check all three tabs:
1. **Overview** — SLA table and package-wise table load, date filters work
2. **Downloads** — download cards render; changing dates in one card does not affect the other (they now use separate `dlRange` vs `dailyDate` state)
3. **Same-Day Trends** — filters render; KPI strip shows three cards; if there is same-day data, two bar charts appear; if not, the empty state message shows

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ReportsPage.tsx frontend/src/api/index.ts
git commit -m "feat: add Same-Day Trends tab to Reports page with recharts bar charts"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ Tab visible to all roles (no role guard added)
  - ✅ Date range filter defaulting to current month
  - ✅ Package dropdown (single-select, default = All)
  - ✅ KPI strip: total count, total m³, same-day %
  - ✅ Chart 1: daily count bar chart
  - ✅ Chart 2: daily volume m³ bar chart
  - ✅ X-axis tick rotation for wide ranges (>14 days)
  - ✅ Empty state message when no data
  - ✅ Same-day defined as `priority_flag = 'SameDay'`, excludes `Draft` only

- **No placeholders:** All steps include complete code.

- **Type consistency:**
  - `sameDayTrends(params: Record<string, any>)` matches usage in `SameDayTrendsTab`
  - `data?.rows` and `data?.summary` match the backend response shape
  - `chartData` maps `count` (parseInt) and `volume_m3` (parseFloat) — matches `dataKey` in Bar components
