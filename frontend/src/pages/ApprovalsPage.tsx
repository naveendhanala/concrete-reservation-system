// src/pages/ApprovalsPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '../api/index';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', 'Pending'],
    queryFn: () => approvalsApi.list({ status: 'Pending' }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, r }: any) => approvalsApi.action(id, action, r),
    onSuccess: (_, vars) => {
      toast.success(`Reservation ${vars.action === 'Approved' ? 'approved' : 'rejected'}`);
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Action failed'),
  });

  const handleAction = (id: string, action: 'Approved' | 'Rejected') => {
    actionMutation.mutate({ id, action, r: remarks[id] });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="text-sm text-gray-500">{approvals.length} awaiting action</p>
      </div>

      {isLoading && <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />}

      {!isLoading && approvals.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-300" />
          <p className="font-medium">All clear! No pending approvals.</p>
        </div>
      )}

      <div className="space-y-4">
        {approvals.map((a: any) => (
          <div key={a.approval_id} className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{a.reservation_number}</span>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    {a.approval_type}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{a.requester_name} · {a.package_name}</p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>SLA due: {new Date(a.sla_due_at).toLocaleString('en-IN')}</p>
                {new Date(a.sla_due_at) < new Date() && (
                  <p className="text-red-500 font-medium flex items-center gap-1 justify-end">
                    <AlertTriangle className="w-3 h-3" /> Overdue
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500">Quantity</p>
                <p className="font-medium">{a.quantity_m3} m³</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500">Requested Slot</p>
                <p className="font-medium">{new Date(a.requested_start).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500">Same-Day Requests</p>
                <p className="font-medium text-orange-600">{a.same_day_request_count} total by PM</p>
              </div>
            </div>

            <textarea className="input mb-3 text-sm" rows={2} placeholder="Remarks (optional)..."
              value={remarks[a.approval_id] || ''}
              onChange={(e) => setRemarks((r) => ({ ...r, [a.approval_id]: e.target.value }))} />

            <div className="flex gap-2">
              <button onClick={() => handleAction(a.approval_id, 'Rejected')}
                disabled={actionMutation.isPending}
                className="btn-danger flex items-center gap-1.5 text-xs">
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button onClick={() => handleAction(a.approval_id, 'Approved')}
                disabled={actionMutation.isPending}
                className="btn-primary flex items-center gap-1.5 text-xs">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
