// src/pages/ReportsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';

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
        Number(r.sr_no),
        r.date,
        r.contractor,
        r.chainage,
        r.package_name,
        r.grade,
        r.actual_quantity_m3 != null ? Number(r.actual_quantity_m3) : '',
        r.structure,
        r.nature_of_work,
        r.rfi_id,
        r.tm_nos,
        r.batching_plants,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Column widths
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

export default function ReportsPage() {
  const { user } = useAuth();
  const isPM = user?.role === 'PM';
  const isPMHead = user?.role === 'PMHead';

  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);

  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  // PM: always filter by their own package (sent to backend); other roles: unscoped
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

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Reports & Analytics</h1>

      {/* Daily Pour Report — PMHead only */}
      {isPMHead && (
        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
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
          { label: 'Cancelled', value: totals.cancelled },
          { label: 'On-Time Rate', value: `${onTimeRate}%` },
        ].map((k) => (
          <div key={k.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* SLA Table */}
      <div className="card overflow-hidden overflow-x-auto">
        <div className="p-4 border-b border-gray-100 font-semibold text-sm">Daily SLA Performance</div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Date', 'Total', 'Completed', 'Cancelled', 'On-Time', 'Requested (m³)', 'Actual (m³)'].map((h) => (
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
                  <td className="px-4 py-2.5 text-red-500">{row.cancelled}</td>
                  <td className="px-4 py-2.5">{row.on_time || 0}</td>
                  <td className="px-4 py-2.5">{parseFloat(row.total_requested_m3 || 0).toFixed(1)}</td>
                  <td className="px-4 py-2.5">{parseFloat(row.total_actual_m3 || 0).toFixed(1)}</td>
                </tr>
              ))}
              {slaData.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No data for selected range</td></tr>
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
              {['Package', 'Total', 'Completed', 'Cancelled', 'Requested (m³)', 'Actual (m³)'].map((h) => (
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
                <td className="px-4 py-2.5 text-red-500">{row.cancelled}</td>
                <td className="px-4 py-2.5">{parseFloat(row.total_requested_m3 || 0).toFixed(1)}</td>
                <td className="px-4 py-2.5">{parseFloat(row.total_actual_m3 || 0).toFixed(1)}</td>
              </tr>
            ))}
            {packageData.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data for selected range</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
