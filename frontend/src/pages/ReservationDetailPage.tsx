// src/pages/ReservationDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationsApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle, XCircle, PackageCheck, Play } from 'lucide-react';
import { useState } from 'react';

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [actualQty, setActualQty] = useState('');

  const { data: reservation, isLoading } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => reservationsApi.getById(id!),
  });

  const { data: slotAllocations = [] } = useQuery({
    queryKey: ['reservation-slots', id],
    queryFn: () => reservationsApi.getSlotAllocations(id!),
    enabled: !!id,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => reservationsApi.acknowledge(id!),
    onSuccess: () => {
      toast.success('Reservation acknowledged');
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => reservationsApi.cancel(id!, cancelReason),
    onSuccess: () => {
      toast.success('Reservation cancelled');
      navigate('/reservations');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to cancel'),
  });

  const startMutation = useMutation({
    mutationFn: () => reservationsApi.start(id!),
    onSuccess: () => {
      toast.success('Reservation started — P&M Manager notified');
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start'),
  });

  const completeMutation = useMutation({
    mutationFn: () => reservationsApi.complete(id!, parseFloat(actualQty)),
    onSuccess: () => {
      toast.success('Reservation marked as completed');
      setShowComplete(false);
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to complete'),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;
  if (!reservation) return <p className="text-red-500">Reservation not found</p>;

  const isPMOps = user?.role === 'PMHead' || user?.role === 'PMManager';
  const canAcknowledge = isPMOps && reservation.status === 'Submitted';
  const canStart = user?.role === 'PM' && reservation.requester_id === user.userId && reservation.status === 'Acknowledged';
  const canComplete = isPMOps && reservation.status === 'Started';
  const canCancel = (user?.role === 'PM' && reservation.requester_id === user.userId && !['Completed', 'Cancelled', 'Rejected'].includes(reservation.status))
    || isPMOps;

  const statusColors: Record<string, string> = {
    Submitted: 'text-blue-700 bg-blue-50', Acknowledged: 'text-green-700 bg-green-50',
    Started: 'text-orange-700 bg-orange-50', PendingApproval: 'text-yellow-700 bg-yellow-50',
    Completed: 'text-emerald-700 bg-emerald-50', Rejected: 'text-red-700 bg-red-50',
    Cancelled: 'text-gray-600 bg-gray-100',
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{reservation.reservation_number}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[reservation.status] || 'bg-gray-100 text-gray-600'}`}>
              {reservation.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{reservation.package_name} · {reservation.requester_name}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {canAcknowledge && (
            <button onClick={() => acknowledgeMutation.mutate()} disabled={acknowledgeMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs">
              <CheckCircle className="w-4 h-4" /> Acknowledge
            </button>
          )}
          {canStart && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-700">
              <Play className="w-4 h-4" /> Start
            </button>
          )}
          {canComplete && (
            <button onClick={() => { setActualQty(reservation.quantity_m3?.toString() || ''); setShowComplete(true); }}
              className="btn-primary flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck className="w-4 h-4" /> Mark as Completed
            </button>
          )}
          {canCancel && (
            <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-1.5 text-xs">
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main details */}
      <div className="grid gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Concrete Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Requested Quantity" value={`${reservation.quantity_m3} m³`} />
            {reservation.actual_quantity_m3 != null && (
              <Field label="Actual Quantity" value={`${reservation.actual_quantity_m3} m³`} />
            )}
            <Field label="Grade" value={reservation.grade?.replace('_', ' ')} />
            <Field label="Pouring Type" value={reservation.pouring_type?.replace(/([A-Z])/g, ' $1').trim()} />
            <Field label="Structure" value={reservation.structure} />
            <Field label="Chainage" value={reservation.chainage} />
            <Field label="Nature of Work" value={reservation.nature_of_work} />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Scheduling</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Requested Start"
              value={(reservation.requested_start ?? '').slice(0, 16).replace('T', ' ')} />
            <Field label="Requested End"
              value={(reservation.requested_end ?? '').slice(0, 16).replace('T', ' ')} />
            {reservation.acknowledged_start && (
              <>
                <Field label="Confirmed Start"
                  value={(reservation.acknowledged_start ?? '').slice(0, 16).replace('T', ' ')} />
                <Field label="Confirmed By" value={reservation.acknowledged_by_name} />
              </>
            )}
            <Field label="Completed At"
              value={reservation.completed_at ? new Date(reservation.completed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'} />
          </div>

          {/* Slot allocations (for split reservations) */}
          {slotAllocations.length > 1 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 uppercase font-medium mb-2">Split Across Slots</p>
              <div className="space-y-1">
                {slotAllocations.map((s: any) => (
                  <div key={s.id} className="flex justify-between text-sm bg-blue-50 px-3 py-1.5 rounded">
                    <span>{(s.start_time ?? '').slice(11, 16)} – {(s.end_time ?? '').slice(11, 16)}</span>
                    <span className="font-medium">{s.allocated_m3} m³</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Team</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site Engineer" value={reservation.site_engineer_name} />
            <Field label="Engineer Contact" value={reservation.site_engineer_contact} />
            <Field label="Contractor" value={reservation.contractor_name} />
            <Field label="Priority" value={reservation.priority_flag} />
          </div>
        </div>

        {reservation.rejection_reason && (
          <div className="card p-5 border-red-200 bg-red-50">
            <p className="text-sm font-medium text-red-700">Rejection Reason</p>
            <p className="text-sm text-red-600 mt-1">{reservation.rejection_reason}</p>
          </div>
        )}
      </div>

      {/* Complete modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Mark as Completed</h3>
            <p className="text-sm text-gray-500 mb-4">
              Requested quantity: <span className="font-medium text-gray-700">{reservation.quantity_m3} m³</span>
            </p>
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Actual Quantity Serviced (m³)</label>
            <input
              type="number" min="0.1" step="0.01"
              className="input mt-1"
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              placeholder="Enter actual quantity..."
            />
            <div className="flex gap-3 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setShowComplete(false)}>Cancel</button>
              <button
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={!actualQty || parseFloat(actualQty) <= 0 || completeMutation.isPending}
                onClick={() => completeMutation.mutate()}>
                {completeMutation.isPending ? 'Saving...' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-3">Cancel Reservation</h3>
            <p className="text-sm text-gray-500 mb-4">Please provide a reason for cancellation.</p>
            <textarea className="input" rows={3} placeholder="Reason for cancellation..."
              value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            <div className="flex gap-3 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setShowCancel(false)}>Back</button>
              <button className="btn-danger flex-1" disabled={!cancelReason || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}>
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
