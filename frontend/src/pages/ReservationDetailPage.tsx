// src/pages/ReservationDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationsApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle, XCircle, PackageCheck, Play, Truck, Pencil } from 'lucide-react';
import { useState } from 'react';

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

const highlightColors: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
};

function TimelineRow({ label, value, highlight = 'gray' }: { label: string; value: string; highlight?: string }) {
  return (
    <div className={`flex justify-between items-center px-3 py-2 rounded-lg border text-sm ${highlightColors[highlight] || highlightColors.gray}`}>
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs">{value || '—'}</span>
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
  const [showDelivery, setShowDelivery] = useState(false);
  const [deliveryQty, setDeliveryQty] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [showModify, setShowModify] = useState(false);
  const [modifyQty, setModifyQty] = useState('');
  const [modifyReason, setModifyReason] = useState('');

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

  const deliveryMutation = useMutation({
    mutationFn: () => reservationsApi.addDelivery(id!, parseFloat(deliveryQty), deliveryNotes || undefined),
    onSuccess: () => {
      toast.success('Delivery logged');
      setShowDelivery(false);
      setDeliveryQty('');
      setDeliveryNotes('');
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to log delivery'),
  });

  const modifyMutation = useMutation({
    mutationFn: () => reservationsApi.modify(id!, { quantity_m3: parseFloat(modifyQty), reason: modifyReason }),
    onSuccess: () => {
      toast.success('Reservation updated — re-submitted for acknowledgement');
      setShowModify(false);
      setModifyQty('');
      setModifyReason('');
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to modify'),
  });

  const completeMutation = useMutation({
    mutationFn: () => reservationsApi.complete(id!),
    onSuccess: () => {
      toast.success('Reservation marked as completed');
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to complete'),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;
  if (!reservation) return <p className="text-red-500">Reservation not found</p>;

  const isPMOps = user?.role === 'PMHead' || user?.role === 'PMManager';
  const canAcknowledge = isPMOps && reservation.status === 'Submitted';
  const canModify = user?.role === 'PM' && reservation.requester_id === user.userId && !['Started', 'Completed', 'Cancelled', 'Rejected'].includes(reservation.status);
  const canStart = user?.role === 'PM' && reservation.requester_id === user.userId && reservation.status === 'Acknowledged';
  const canAddDelivery = isPMOps && reservation.status === 'Started';
  const canComplete = user?.role === 'PM' && reservation.requester_id === user.userId && reservation.status === 'Started';
  const canCancel = !['Completed', 'Cancelled', 'Rejected'].includes(reservation.status) && (
    (user?.role === 'PM' && reservation.requester_id === user.userId) || isPMOps
  );

  const statusColors: Record<string, string> = {
    Submitted: 'text-blue-700 bg-blue-50', Acknowledged: 'text-green-700 bg-green-50',
    Started: 'text-orange-700 bg-orange-50', PendingApproval: 'text-yellow-700 bg-yellow-50',
    Completed: 'text-emerald-700 bg-emerald-50', Rejected: 'text-red-700 bg-red-50',
    Cancelled: 'text-gray-600 bg-gray-100',
  };

  const deliveries: any[] = reservation.deliveries || [];
  const totalDelivered = deliveries.reduce((sum: number, d: any) => sum + parseFloat(d.quantity_m3), 0);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{reservation.reservation_number}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[reservation.status] || 'bg-gray-100 text-gray-600'}`}>
                {reservation.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">{reservation.package_name} · {reservation.requester_name}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {canAcknowledge && (
            <button onClick={() => acknowledgeMutation.mutate()} disabled={acknowledgeMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs">
              <CheckCircle className="w-4 h-4" /> Acknowledge
            </button>
          )}
          {canModify && (
            <button onClick={() => { setModifyQty(reservation.quantity_m3?.toString() || ''); setShowModify(true); }}
              className="btn-secondary flex items-center gap-1.5 text-xs">
              <Pencil className="w-4 h-4" /> Modify
            </button>
          )}
          {canStart && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-700">
              <Play className="w-4 h-4" /> Start
            </button>
          )}
          {canAddDelivery && (
            <button onClick={() => setShowDelivery(true)}
              className="btn-primary flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700">
              <Truck className="w-4 h-4" /> Add Delivery
            </button>
          )}
          {canComplete && (
            <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck className="w-4 h-4" /> {completeMutation.isPending ? 'Completing...' : 'Mark as Completed'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Batching Plant" value={reservation.batching_plant} />
            <Field label="RFI ID" value={reservation.rfi_id} />
            <Field label="Requested Quantity" value={`${reservation.quantity_m3} m³`} />
            {reservation.actual_quantity_m3 != null && (
              <Field label="Total Delivered" value={`${reservation.actual_quantity_m3} m³`} />
            )}
            <Field label="Grade" value={reservation.grade?.replace('_', ' ')} />
            <Field label="Pouring Type" value={reservation.pouring_type?.replace(/([A-Z])/g, ' $1').trim()} />
            <Field label="Structure" value={reservation.structure} />
            <Field label="Chainage" value={reservation.chainage} />
            <Field label="Nature of Work" value={reservation.nature_of_work} />
          </div>
        </div>

        {/* Delivery trips */}
        {deliveries.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Delivery Trips</h3>
              <span className="text-sm font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                {totalDelivered.toFixed(2)} m³ delivered
              </span>
            </div>
            <div className="space-y-2">
              {deliveries.map((d: any, i: number) => (
                <div key={d.delivery_id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Trip {i + 1}</span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-500">{d.delivered_by_name}</span>
                    {d.notes && <span className="text-gray-400 ml-2 text-xs">— {d.notes}</span>}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-blue-700">{d.quantity_m3} m³</span>
                    <p className="text-xs text-gray-400 font-mono">{(d.delivered_at ?? '').slice(0, 16)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
              <span className="text-gray-500">Requested</span>
              <span className="font-medium">{reservation.quantity_m3} m³</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Remaining</span>
              <span className={`font-semibold ${(reservation.quantity_m3 - totalDelivered) <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                {Math.max(0, reservation.quantity_m3 - totalDelivered).toFixed(2)} m³
              </span>
            </div>
          </div>
        )}

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Scheduling</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Requested Start"
              value={(reservation.requested_start ?? '').slice(0, 16).replace('T', ' ')} />
            <Field label="Requested End"
              value={(reservation.requested_end ?? '').slice(0, 16).replace('T', ' ')} />
          </div>

          {/* Timeline of status timestamps */}
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Timeline</p>
            <TimelineRow label="Request Raised" value={(reservation.created_at ?? '').slice(0, 16)} />
            {reservation.vp_approved_at && (
              <TimelineRow label={`VP Approved (by ${reservation.vp_approved_by_name || 'VP'})`} value={(reservation.vp_approved_at ?? '').slice(0, 16)} highlight="blue" />
            )}
            {reservation.acknowledged_at && (
              <TimelineRow label={`Acknowledged (by ${reservation.acknowledged_by_name || 'P&M'})`} value={(reservation.acknowledged_at ?? '').slice(0, 16)} highlight="green" />
            )}
            {reservation.started_at && (
              <TimelineRow label="Started by PM" value={(reservation.started_at ?? '').slice(0, 16)} highlight="orange" />
            )}
            {reservation.completed_at && (
              <TimelineRow label="Completed" value={(reservation.completed_at ?? '').slice(0, 16)} highlight="emerald" />
            )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Add Delivery modal */}
      {showDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Log Delivery Trip</h3>
            <p className="text-sm text-gray-500 mb-4">
              Requested: <span className="font-medium text-gray-700">{reservation.quantity_m3} m³</span>
              {totalDelivered > 0 && (
                <> · Delivered so far: <span className="font-medium text-blue-700">{totalDelivered.toFixed(2)} m³</span></>
              )}
            </p>
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Quantity Delivered (m³)</label>
            <input
              type="number" min="0.1" step="0.01"
              className="input mt-1 mb-3"
              value={deliveryQty}
              onChange={(e) => setDeliveryQty(e.target.value)}
              placeholder="e.g. 5"
              autoFocus
            />
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Notes (optional)</label>
            <input
              type="text"
              className="input mt-1"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="e.g. First truck"
            />
            <div className="flex gap-3 mt-4">
              <button className="btn-secondary flex-1" onClick={() => { setShowDelivery(false); setDeliveryQty(''); setDeliveryNotes(''); }}>Cancel</button>
              <button
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={!deliveryQty || parseFloat(deliveryQty) <= 0 || deliveryMutation.isPending}
                onClick={() => deliveryMutation.mutate()}>
                {deliveryMutation.isPending ? 'Saving...' : 'Log Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify modal */}
      {showModify && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Modify Reservation</h3>
            <p className="text-sm text-gray-500 mb-4">Changing quantity will re-submit for P&M acknowledgement.</p>
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">New Quantity (m³)</label>
            <input
              type="number" min="0.1" max="50" step="0.01"
              className="input mt-1 mb-3"
              value={modifyQty}
              onChange={(e) => setModifyQty(e.target.value)}
            />
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Reason for change</label>
            <textarea
              className="input mt-1" rows={2}
              placeholder="Why are you modifying this request?"
              value={modifyReason}
              onChange={(e) => setModifyReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setShowModify(false)}>Cancel</button>
              <button
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
                disabled={!modifyQty || parseFloat(modifyQty) <= 0 || !modifyReason || modifyMutation.isPending}
                onClick={() => modifyMutation.mutate()}>
                {modifyMutation.isPending ? 'Saving...' : 'Save Changes'}
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
