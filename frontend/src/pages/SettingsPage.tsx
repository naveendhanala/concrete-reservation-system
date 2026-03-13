// src/pages/SettingsPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import toast from 'react-hot-toast';
import { useState } from 'react';

const CONFIG_LABELS: Record<string, string> = {
  cutoff_hours: 'Cutoff Hours (before slot start)',
};

const SHIFTS = [
  { name: 'Shift 1', start: '07:00', end: '10:00', capacity_m3: 200 },
  { name: 'Shift 2', start: '10:00', end: '14:00', capacity_m3: 400 },
  { name: 'Shift 3', start: '14:00', end: '18:00', capacity_m3: 600 },
  { name: 'Shift 4', start: '18:00', end: '22:00', capacity_m3: 500 },
  { name: 'Shift 5', start: '22:00', end: '00:00', capacity_m3: 300 },
];

const totalCapacity = SHIFTS.reduce((sum, s) => sum + s.capacity_m3, 0);

export default function SettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});

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

      {/* Fixed shift schedule */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Plant Shift Schedule
          <span className="ml-2 text-xs font-normal text-gray-400">
            ({SHIFTS.length} shifts · {totalCapacity} m³ total capacity/day)
          </span>
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Shift</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Capacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {SHIFTS.map((shift) => (
                <tr key={shift.name} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{shift.name}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-600">{shift.start} – {shift.end}</td>
                  <td className="px-4 py-2.5 text-gray-600">{shift.capacity_m3} m³</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                <td colSpan={2} className="px-4 py-2.5 text-xs font-medium text-gray-500">Total</td>
                <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">{totalCapacity} m³</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
