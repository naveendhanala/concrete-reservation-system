import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Check, X } from 'lucide-react';
import { usersApi } from '../api';

interface Contractor {
  contractor_id: string;
  name: string;
  contact: string | null;
  mobilized_by: string | null;
  active_flag: boolean;
}

function ContractorRow({ contractor }: { contractor: Contractor }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);
  const [contact, setContact] = useState(contractor.contact ?? '');
  const [mobilizedBy, setMobilizedBy] = useState(contractor.mobilized_by ?? '');

  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) =>
      usersApi.updateContractor(contractor.contractor_id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to update contractor'),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Name"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full font-mono"
            placeholder="+91..."
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={mobilizedBy}
            onChange={(e) => setMobilizedBy(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Mobilized by"
          />
        </td>
        <td className="px-4 py-2">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              contractor.active_flag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {contractor.active_flag ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button
              onClick={() =>
                updateMut.mutate({ name, contact: contact || null, mobilized_by: mobilizedBy || null })
              }
              disabled={updateMut.isPending || !name.trim()}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => {
              setName(contractor.name);
              setContact(contractor.contact ?? '');
              setMobilizedBy(contractor.mobilized_by ?? '');
              setEditing(false);
            }} className="text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      <td className="px-4 py-2 text-sm font-medium text-gray-700">{contractor.name}</td>
      <td className="px-4 py-2 text-sm font-mono text-gray-500">{contractor.contact ?? '—'}</td>
      <td className="px-4 py-2 text-sm text-gray-500">{contractor.mobilized_by ?? '—'}</td>
      <td className="px-4 py-2">
        <button
          onClick={() => updateMut.mutate({ active_flag: !contractor.active_flag })}
          disabled={updateMut.isPending}
          className={`text-xs px-2 py-1 rounded-full ${
            contractor.active_flag
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {contractor.active_flag ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => setEditing(true)}
          className="text-blue-500 hover:text-blue-700"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function AddContractorRow({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [mobilizedBy, setMobilizedBy] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      usersApi.createContractor({ name, contact: contact || null, mobilized_by: mobilizedBy || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      onDone();
    },
    onError: () => toast.error('Failed to add contractor'),
  });

  return (
    <tr className="bg-green-50">
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Name *"
          autoFocus
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full font-mono"
          placeholder="+91..."
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={mobilizedBy}
          onChange={(e) => setMobilizedBy(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Mobilized by"
        />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!name.trim()) { toast.error('Name is required'); return; }
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDone} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ContractorsPage() {
  const [addingContractor, setAddingContractor] = useState(false);
  const [contractorSearch, setContractorSearch] = useState('');

  const { data: contractors = [], isLoading: contractorsLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => usersApi.getContractors('', true),
  });

  const filteredContractors = (contractors as Contractor[]).filter((c) =>
    c.name.toLowerCase().includes(contractorSearch.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Contractor Master
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({(contractors as Contractor[]).length})
            </span>
          </h2>
          <input
            type="text"
            value={contractorSearch}
            onChange={(e) => setContractorSearch(e.target.value)}
            placeholder="Search by name..."
            className="border rounded px-3 py-1.5 text-sm w-64"
          />
        </div>
        {!addingContractor && (
          <button
            onClick={() => setAddingContractor(true)}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Add Contractor
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobilized By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {addingContractor && (
              <AddContractorRow onDone={() => setAddingContractor(false)} />
            )}
            {contractorsLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</td>
              </tr>
            ) : filteredContractors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No contractors found.</td>
              </tr>
            ) : (
              filteredContractors.map((c) => (
                <ContractorRow key={c.contractor_id} contractor={c} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
