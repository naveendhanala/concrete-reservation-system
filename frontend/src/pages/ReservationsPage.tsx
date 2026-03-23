// src/pages/ReservationsPage.tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reservationsApi, packagesApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Submitted: 'badge-submitted', Acknowledged: 'badge-acknowledged',
    Started: 'bg-orange-100 text-orange-700',
    PendingApproval: 'badge-pending', Rejected: 'badge-rejected',
    Cancelled: 'badge-cancelled', Completed: 'badge-completed',
    Draft: 'bg-gray-100 text-gray-600',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export default function ReservationsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    date: searchParams.get('date') || '',
    packageId: '',
    page: 1,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', filters],
    queryFn: () => reservationsApi.list({ ...filters, limit: 20 }),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
  });

  const reservations = data?.data || [];
  const total = data?.total || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reservations</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        {user?.role === 'PM' && (
          <Link to="/reservations/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Reservation
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:flex gap-3 lg:flex-wrap">
        <select className="input" value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Status</option>
          {['Submitted', 'PendingApproval', 'Acknowledged', 'Started', 'Completed', 'Cancelled', 'Rejected'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input" value={filters.packageId}
          onChange={(e) => setFilters((f) => ({ ...f, packageId: e.target.value, page: 1 }))}>
          <option value="">All Packages</option>
          {packages.map((p: any) => (
            <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
          ))}
        </select>
        <input type="date" className="input"
          value={filters.date}
          onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))} />
        {(filters.status || filters.date || filters.packageId) && (
          <button className="btn-secondary text-xs" onClick={() => setFilters({ status: '', date: '', packageId: '', page: 1 })}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : reservations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No reservations found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Reservation #', 'Package', 'Date/Time', 'Requested Qty', 'Actual Qty', 'Grade', 'Status', 'Completed At'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reservations.map((r: any) => (
                <tr key={r.reservation_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/reservations/${r.reservation_id}`} className="font-medium text-primary-600 hover:underline">
                      {r.reservation_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.package_name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(r.requested_start ?? '').slice(0, 10).split('-').reverse().join('/')} {(r.requested_start ?? '').slice(11, 16)}
                    {r.requested_end && (
                      <span className="text-gray-400"> – {(r.requested_end ?? '').slice(11, 16)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.quantity_m3} m³</td>
                  <td className="px-4 py-3 font-medium">{r.actual_quantity_m3 != null ? `${r.actual_quantity_m3} m³` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.grade?.replace('_', ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.completed_at
                      ? new Date(r.completed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Showing {((filters.page - 1) * 20) + 1}–{Math.min(filters.page * 20, total)} of {total}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={filters.page === 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
            <button className="btn-secondary" disabled={filters.page * 20 >= total}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
