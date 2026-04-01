// src/pages/ContractorsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/index';
import toast from 'react-hot-toast';
import { Plus, Pencil, X, Check } from 'lucide-react';

interface Contractor {
  contractor_id: string;
  name: string;
  contact: string | null;
  active_flag: boolean;
}

function ContractorRow({ contractor }: { contractor: Contractor }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);
  const [contact, setContact] = useState(contractor.contact || '');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      usersApi.updateContractor(contractor.contractor_id, data),
    onSuccess: () => {
      toast.success('Contractor updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['all-contractors'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const cancel = () => {
    setEditing(false);
    setName(contractor.name);
    setContact(contractor.contact || '');
  };

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
            placeholder="+91XXXXXXXXXX"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </td>
        <td className="px-4 py-2 text-sm text-gray-400">—</td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => updateMutation.mutate({ name, contact: contact || null })}
              disabled={!name || updateMutation.isPending}
              className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={cancel} className="p-1.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!contractor.active_flag ? 'opacity-60' : ''}`}>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{contractor.name}</td>
      <td className="px-4 py-3 text-sm text-gray-500 font-mono">{contractor.contact || '—'}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => updateMutation.mutate({ active_flag: !contractor.active_flag })}
          disabled={updateMutation.isPending}
          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer border transition-colors ${
            contractor.active_flag
              ? 'bg-green-100 text-green-800 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
          }`}
          title={contractor.active_flag ? 'Click to deactivate' : 'Click to activate'}
        >
          {contractor.active_flag ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

function AddContractorRow({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => usersApi.createContractor({ name, contact: contact || null }),
    onSuccess: () => {
      toast.success('Contractor added');
      queryClient.invalidateQueries({ queryKey: ['all-contractors'] });
      onDone();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add'),
  });

  return (
    <tr className="bg-green-50">
      <td className="px-4 py-2">
        <input
          className="input py-1 text-sm"
          placeholder="Contractor name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="input py-1 text-sm"
          placeholder="+91XXXXXXXXXX (optional)"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </td>
      <td className="px-4 py-2 text-sm text-gray-400">—</td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
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

export default function ContractorsPage() {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['all-contractors'],
    queryFn: () => usersApi.getContractors(''),
  });

  const filtered = contractors.filter((c: Contractor) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contractors</h1>
          <p className="text-sm text-gray-400 mt-0.5">{contractors.length} total</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Contractor
        </button>
      </div>

      <div className="mb-4">
        <input
          className="input w-64 text-sm"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Contact', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adding && <AddContractorRow onDone={() => setAdding(false)} />}
                {filtered.map((c: Contractor) => (
                  <ContractorRow key={c.contractor_id} contractor={c} />
                ))}
                {filtered.length === 0 && !adding && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      {search ? 'No contractors match your search.' : 'No contractors yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
