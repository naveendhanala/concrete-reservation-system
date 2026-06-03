export default function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Submitted: 'badge-submitted',
    Acknowledged: 'badge-acknowledged',
    Started: 'bg-orange-100 text-orange-700',
    PendingApproval: 'badge-pending',
    Rejected: 'badge-rejected',
    Cancelled: 'badge-cancelled',
    Completed: 'badge-completed',
    'Auto-completed': 'bg-teal-100 text-teal-700',
    Draft: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}
