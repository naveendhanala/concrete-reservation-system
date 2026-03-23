// src/pages/ReportsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/index';

export default function ReportsPage() {
  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const { data: slaData = [], isLoading } = useQuery({
    queryKey: ['report-sla', range],
    queryFn: () => reportsApi.sla(range),
  });

  const { data: packageData = [] } = useQuery({
    queryKey: ['report-packages', range],
    queryFn: () => reportsApi.packages(range),
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
