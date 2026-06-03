// src/pages/SettingsPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { usersApi } from '../api';

const CONFIG_LABELS: Record<string, string> = {
  cutoff_hours: 'Cutoff Hours (before slot start)',
  same_day_freebie_limit: 'Same-Day Freebie Passes per Package (per day)',
};


export default function SettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [testUserId, setTestUserId] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => client.get('/config').then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      client.patch(`/config/${key}`, { value }),
    onSuccess: () => {
      toast.success('Setting updated');
      qc.invalidateQueries({ queryKey: ['config'] });
      setEditing({});
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const visibleConfigs = configs.filter((cfg: any) => cfg.key in CONFIG_LABELS);

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list().then((r: any) => r.users ?? r),
  });

  const testPushMutation = useMutation({
    mutationFn: () => client.post('/push/test', testUserId ? { userId: testUserId } : {}),
    onSuccess: () => toast.success('Test notification sent — check the selected device'),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send test notification'),
  });

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold text-gray-900">System Configuration</h1>

      {/* Editable config values */}
      <div className="card divide-y divide-gray-100">
        {isLoading && <div className="p-8 text-center text-gray-400">Loading...</div>}
        {visibleConfigs.map((cfg: any) => (
          <div key={cfg.key} className="p-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{CONFIG_LABELS[cfg.key]}</p>
              {cfg.description && <p className="text-xs text-gray-400 mt-0.5">{cfg.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {editing[cfg.key] !== undefined ? (
                <>
                  <input
                    className="input w-32 text-sm"
                    value={editing[cfg.key]}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                  />
                  <button
                    className="btn-primary text-xs"
                    onClick={() => updateMutation.mutate({ key: cfg.key, value: editing[cfg.key] })}
                  >
                    Save
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[cfg.key]; return n; })}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-mono bg-gray-100 px-2.5 py-1 rounded text-gray-700">
                    {cfg.value}
                  </span>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => setEditing((prev) => ({ ...prev, [cfg.key]: cfg.value }))}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Push notification test */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Push Notifications</h2>
        <div className="card p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Send Test Notification</p>
            <p className="text-xs text-gray-400 mt-0.5">Select a user and send a test push to verify their device</p>
          </div>
          <select
            className="input w-full text-sm"
            value={testUserId}
            onChange={(e) => setTestUserId(e.target.value)}
          >
            <option value="">— Select user —</option>
            {(usersData ?? []).map((u: any) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
          <button
            className="btn-primary text-sm"
            onClick={() => testPushMutation.mutate()}
            disabled={testPushMutation.isPending || !testUserId}
          >
            {testPushMutation.isPending ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>

    </div>
  );
}
