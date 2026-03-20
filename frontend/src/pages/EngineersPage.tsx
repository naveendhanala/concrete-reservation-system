// src/pages/EngineersPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/index';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';

interface Engineer {
  engineer_id: string;
  name: string;
  contact: string;
  package_id: string;
}

interface Package {
  package_id: string;
  package_name: string;
}

function EngineerRow({
  engineer,
  onSaved,
}: {
  engineer: Engineer;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(engineer.name);
  const [contact, setContact] = useState(engineer.contact);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => usersApi.updateEngineer(engineer.engineer_id, { name, contact }),
    onSuccess: () => {
      toast.success('Engineer updated');
      setEditing(false);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['engineers', engineer.package_id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteEngineer(engineer.engineer_id),
    onSuccess: () => {
      toast.success('Engineer removed');
      queryClient.invalidateQueries({ queryKey: ['engineers', engineer.package_id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-4 py-2">
          <input
            className="input py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </td>
        <td className="px-4 py-2">
          <input
            className="input py-1 text-sm"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+91XXXXXXXXXX"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!name || !contact || updateMutation.isPending}
              className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setEditing(false); setName(engineer.name); setContact(engineer.contact); }}
              className="p-1.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900">{engineer.name}</td>
      <td className="px-4 py-3 text-sm text-gray-500 font-mono">{engineer.contact}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove ${engineer.name}?`)) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddEngineerRow({
  packageId,
  onDone,
}: {
  packageId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => usersApi.createEngineer({ name, contact, package_id: packageId }),
    onSuccess: () => {
      toast.success('Engineer added');
      setName('');
      setContact('');
      queryClient.invalidateQueries({ queryKey: ['engineers', packageId] });
      onDone();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add'),
  });

  return (
    <tr className="bg-green-50">
      <td className="px-4 py-2">
        <input
          className="input py-1 text-sm"
          placeholder="Engineer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="input py-1 text-sm"
          placeholder="+91XXXXXXXXXX"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name || !contact || createMutation.isPending}
            className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDone} className="p-1.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PackageEngineersTable({ pkg }: { pkg: Package }) {
  const [adding, setAdding] = useState(false);

  const { data: engineers = [], isLoading } = useQuery({
    queryKey: ['engineers', pkg.package_id],
    queryFn: () => usersApi.getEngineers(pkg.package_id),
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">{pkg.package_name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{engineers.length} engineer{engineers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Add Engineer
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">WhatsApp / Phone</th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {engineers.map((eng: Engineer) => (
              <EngineerRow key={eng.engineer_id} engineer={eng} onSaved={() => {}} />
            ))}
            {adding && (
              <AddEngineerRow packageId={pkg.package_id} onDone={() => setAdding(false)} />
            )}
            {engineers.length === 0 && !adding && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">
                  No engineers yet. Add one to enable WhatsApp booking for this package.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function EngineersPage() {
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['my-packages'],
    queryFn: usersApi.getMyPackages,
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Engineers</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage the engineers authorized to raise and start reservations via WhatsApp.
        </p>
      </div>

      {packages.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">No packages assigned to your account.</div>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg: Package) => (
            <PackageEngineersTable key={pkg.package_id} pkg={pkg} />
          ))}
        </div>
      )}
    </div>
  );
}
