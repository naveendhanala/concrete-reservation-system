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
       'Requested Qty (m³)', 'Actual Qty (m³)', 'Structure', 'Nature of Work', 'RFI ID', 'TM No.', 'Batching Plant'],
      ...rows.map((r) => [
        Number(r.sr_no), r.date, r.contractor, r.chainage, r.package_name, r.grade,
        r.quantity_m3 != null ? Number(r.quantity_m3) : '',
        r.actual_quantity_m3 != null ? Number(r.actual_quantity_m3) : '',
        r.structure, r.nature_of_work, r.rfi_id, r.tm_nos, r.batching_plants,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 24 },
      { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

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

  const { data: requestsData = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['report-same-day-requests', params],
    queryFn: () => reportsApi.sameDayRequests(params),
    enabled: isAdmin,
  });

  const rows: { date: string; count: string; volume_m3: string }[] = data?.rows ?? [];
  const byPackage: { package_name: string; same_day_count: number; same_day_volume_m3: string; same_day_pct: number }[] = data?.by_package ?? [];
  const summary = data?.summary ?? {
    total_same_day: 0,
    total_volume_m3: '0.00',
    total_all: 0,
    same_day_pct: 0,
  };

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
                  <Tooltip formatter={(v) => [Number(v ?? 0), 'Requests']} />
                  <Bar dataKey="count" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2 — Daily volume */}
          <div className="card p-4 mb-6">
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
                  <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(2)} m³`, 'Volume']} />
                  <Bar dataKey="volume_m3" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Package-wise summary table */}
          <div className="card overflow-hidden overflow-x-auto mb-6">
            <div className="p-4 border-b border-gray-100 font-semibold text-sm">
              Package-wise Same-Day Summary
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Package', 'Same-Day Requests', 'Requested Qty (m³)', 'Same-Day %'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byPackage.map((row) => (
                  <tr key={row.package_name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{row.package_name}</td>
                    <td className="px-4 py-2.5">{row.same_day_count}</td>
                    <td className="px-4 py-2.5">{row.same_day_volume_m3}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.same_day_pct >= 30 ? 'bg-red-100 text-red-700' :
                        row.same_day_pct >= 15 ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {row.same_day_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
                {byPackage.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      No same-day requests in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Individual requests with reasons — Admin only */}
          {isAdmin && (
            <div className="card overflow-hidden overflow-x-auto">
              <div className="p-4 border-b border-gray-100">
                <p className="font-semibold text-sm">Same-Day Requests — Detail & Reasons</p>
                <p className="text-xs text-gray-400 mt-0.5">Why each PM raised the request on the same day instead of planning in advance</p>
              </div>
              {requestsLoading ? (
                <div className="p-8 text-center text-gray-400">Loading…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {['Date', 'Res. No.', 'Package', 'Raised By', 'Structure', 'Qty (m³)', 'Status', 'Reason for Same-Day Request'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(requestsData as any[]).map((row: any) => (
                      <tr key={row.reservation_number} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">{row.reservation_number}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.package_name}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.raised_by}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.structure}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{parseFloat(row.quantity_m3).toFixed(2)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            row.status === 'Completed' || row.status === 'Auto-completed' ? 'bg-green-100 text-green-700' :
                            row.status === 'Cancelled' || row.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-xs text-gray-700">
                          {row.same_day_reason || <span className="text-gray-300 italic">—</span>}
                        </td>
                      </tr>
                    ))}
                    {(requestsData as any[]).length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No same-day requests in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
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
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const [range, setRange] = useState({ from: yesterday, to: yesterday });

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
