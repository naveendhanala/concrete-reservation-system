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
