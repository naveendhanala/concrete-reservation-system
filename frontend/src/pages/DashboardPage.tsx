// src/pages/DashboardPage.tsx
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/index';
import { ClipboardList, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Submitted: 'badge-submitted',
    Acknowledged: 'badge-acknowledged',
    PendingApproval: 'badge-pending',
    Rejected: 'badge-rejected',
    Cancelled: 'badge-cancelled',
    Completed: 'badge-completed',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── PM Dashboard ──────────────────────────────────────────────────────────────
function PMDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-pm'], queryFn: dashboardApi.pm });
  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;
  const s = data?.summary || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={s.total || 0} icon={ClipboardList} color="bg-blue-50 text-blue-600" />
        <StatCard label="Acknowledged" value={s.acknowledged || 0} icon={CheckCircle} color="bg-green-50 text-green-600" />
        <StatCard label="Pending" value={s.submitted || 0} icon={Clock} color="bg-yellow-50 text-yellow-600" />
        <StatCard label="Same-Day Requests" value={data?.sameDayCount || 0} icon={AlertTriangle} color="bg-orange-50 text-orange-600" />
      </div>

      {data?.pendingApprovals?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" /> Awaiting VP Approval
          </h3>
          {data.pendingApprovals.map((a: any) => (
            <div key={a.approval_id} className="text-sm text-gray-600 py-1 border-b last:border-0">
              {a.reservation_number} — same-day request pending approval
            </div>
          ))}
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Recent Reservations</h3>
          <Link to="/reservations" className="text-primary-600 text-sm hover:underline">View all</Link>
        </div>
        {data?.recentActivity?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No reservations yet. Create your first one!</p>
        )}
        <div className="space-y-2">
          {data?.recentActivity?.map((r: any) => (
            <Link key={r.reservation_id} to={`/reservations/${r.reservation_id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-900">{r.reservation_number}</p>
                <p className="text-xs text-gray-500">{r.quantity_m3} m³ · {r.grade} · {r.package_name}</p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── VP Dashboard ──────────────────────────────────────────────────────────────
function VPDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-vp'], queryFn: dashboardApi.vp });
  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;
  const sla = data?.sla || {};

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Last 30 days</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="On-Time Rate" value={`${sla.onTimeRate || 0}%`} icon={TrendingUp} color="bg-green-50 text-green-600" />
          <StatCard label="Actual Qty (m³)" value={sla.totalActualM3 || 0} icon={CheckCircle} color="bg-blue-50 text-blue-600" />
          <StatCard label="Avg Ack Time" value={`${sla.avgAckHours || 0}h`} icon={Clock} color="bg-purple-50 text-purple-600" />
          <StatCard label="Pending Approvals" value={data?.pendingApprovals?.length || 0} icon={AlertTriangle} color="bg-orange-50 text-orange-600" />
        </div>
      </div>

      {data?.pendingApprovals?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Pending Approvals</h3>
            <Link to="/approvals" className="text-primary-600 text-sm hover:underline">Manage</Link>
          </div>
          {data.pendingApprovals.map((a: any) => (
            <div key={a.approval_id} className="py-2 border-b last:border-0 flex justify-between items-start">
              <div>
                <p className="text-sm font-medium">{a.reservation_number}</p>
                <p className="text-xs text-gray-500">{a.requester_name} · {a.package_name} · {a.quantity_m3} m³</p>
                <p className="text-xs text-orange-500">Same-day requests by this PM: {a.same_day_request_count}</p>
              </div>
              <span className="text-xs text-gray-400">{new Date(a.requested_start).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── P&M Head Dashboard ────────────────────────────────────────────────────────
function PMHeadDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-pmhead'], queryFn: dashboardApi.pmhead });
  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Link to="/reservations?status=Submitted" className="block">
          <div className="card p-5 flex items-center gap-4 h-full">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-yellow-50 text-yellow-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.pendingAcknowledgments?.length || 0}</p>
              <p className="text-sm text-gray-500">Pending Acknowledgment</p>
            </div>
          </div>
        </Link>
        <Link to={`/reservations?date=${new Date().toISOString().split('T')[0]}`} className="block">
          <div className="card p-5 flex items-center gap-4 h-full">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{(data?.todayCompleted || 0) + (data?.todayPending || 0)}</p>
              <p className="text-sm text-gray-500">Today's Reservations</p>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-emerald-600 font-medium">{data?.todayCompleted || 0} completed</span>
                {' · '}
                <span className="text-yellow-600 font-medium">{data?.todayPending || 0} pending</span>
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">Today's Slot Utilization</h3>
          <Link to="/calendar" className="text-primary-600 text-sm hover:underline">Full Calendar</Link>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data?.todaySlots?.map((slot: any) => {
            const util = Math.round((parseFloat(slot.booked_m3) / parseFloat(slot.capacity_m3)) * 100);
            return (
              <div key={slot.slot_id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16 flex-shrink-0">
                  {(slot.start_time ?? '').slice(11, 16)}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${util > 80 ? 'bg-red-500' : util > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(util, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right">{slot.booked_m3}/{slot.capacity_m3} m³</span>
              </div>
            );
          })}
        </div>
      </div>

      {data?.pendingAcknowledgments?.length > 0 && (
        <div className="card p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Needs Acknowledgment</h3>
            <Link to="/reservations?status=Submitted" className="text-primary-600 text-sm hover:underline">View all</Link>
          </div>
          {data.pendingAcknowledgments.slice(0, 5).map((r: any) => (
            <Link key={r.reservation_id} to={`/reservations/${r.reservation_id}`}
              className="flex justify-between items-start py-2 border-b last:border-0 hover:bg-gray-50 px-1 rounded">
              <div>
                <p className="text-sm font-medium">{r.reservation_number}</p>
                <p className="text-xs text-gray-500">{r.requester_name} · {r.package_name} · {r.quantity_m3} m³ {r.grade}</p>
              </div>
              <span className="text-xs text-gray-400">{new Date(r.requested_start).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── P&M Manager Dashboard ─────────────────────────────────────────────────────
function PMManagerDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-pmmanager'], queryFn: dashboardApi.pmmanager });
  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Link to="/reservations?status=Submitted" className="block">
          <div className="card p-5 flex items-center gap-4 h-full">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-yellow-50 text-yellow-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.pendingAcknowledgments?.length || 0}</p>
              <p className="text-sm text-gray-500">Pending Acknowledgment</p>
              <p className="text-xs text-gray-400 mt-0.5">Your plant's packages</p>
            </div>
          </div>
        </Link>
        <Link to={`/reservations?date=${new Date().toISOString().split('T')[0]}`} className="block">
          <div className="card p-5 flex items-center gap-4 h-full">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{(data?.todayCompleted || 0) + (data?.todayPending || 0)}</p>
              <p className="text-sm text-gray-500">Today's Reservations</p>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-emerald-600 font-medium">{data?.todayCompleted || 0} completed</span>
                {' · '}
                <span className="text-yellow-600 font-medium">{data?.todayPending || 0} pending</span>
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">Today's Slot Utilization</h3>
          <Link to="/calendar" className="text-primary-600 text-sm hover:underline">Full Calendar</Link>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data?.todaySlots?.map((slot: any) => {
            const util = Math.round((parseFloat(slot.booked_m3) / parseFloat(slot.capacity_m3)) * 100);
            return (
              <div key={slot.slot_id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16 flex-shrink-0">
                  {(slot.start_time ?? '').slice(11, 16)}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${util > 80 ? 'bg-red-500' : util > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(util, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right">{slot.booked_m3}/{slot.capacity_m3} m³</span>
              </div>
            );
          })}
        </div>
      </div>

      {data?.pendingAcknowledgments?.length > 0 && (
        <div className="card p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Needs Acknowledgment</h3>
            <Link to="/reservations?status=Submitted" className="text-primary-600 text-sm hover:underline">View all</Link>
          </div>
          {data.pendingAcknowledgments.slice(0, 5).map((r: any) => (
            <Link key={r.reservation_id} to={`/reservations/${r.reservation_id}`}
              className="flex justify-between items-start py-2 border-b last:border-0 hover:bg-gray-50 px-1 rounded">
              <div>
                <p className="text-sm font-medium">{r.reservation_number}</p>
                <p className="text-xs text-gray-500">{r.requester_name} · {r.package_name} · {r.quantity_m3} m³ {r.grade}</p>
              </div>
              <span className="text-xs text-gray-400">{new Date(r.requested_start).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Router ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const title: Record<string, string> = {
    PM: 'My Dashboard', PMHead: 'P&M Operations', PMManager: 'Plant Operations',
    VP: 'Portfolio Overview', ClusterHead: 'Cluster Overview', Admin: 'System Overview',
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{title[user?.role || 'PM']}</h1>
        <p className="text-sm text-gray-500">Welcome back, {user?.name}</p>
      </div>
      {user?.role === 'PM' && <PMDashboard />}
      {user?.role === 'VP' && <VPDashboard />}
      {user?.role === 'PMHead' && <PMHeadDashboard />}
      {user?.role === 'PMManager' && <PMManagerDashboard />}
      {(user?.role === 'ClusterHead' || user?.role === 'Admin') && <VPDashboard />}
    </div>
  );
}
