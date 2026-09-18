import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Check, X, Trash2, Search } from 'lucide-react';
import { usersApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { topMatches, type MatchStrength } from '../utils/fuzzyMatch';

interface Contractor {
  contractor_id: string;
  name: string;
  contact: string | null;
  mobilized_by: string | null;
  active_flag: boolean;
}

function ContractorRow({ contractor }: { contractor: Contractor }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);

  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) =>
      usersApi.updateContractor(contractor.contractor_id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to update contractor'),
  });

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteContractor(contractor.contractor_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contractors'] }),
    onError: (err: any) =>
      toast.error(err.response?.data?.error || 'Failed to delete contractor'),
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
              onClick={() => updateMut.mutate({ name })}
              disabled={updateMut.isPending || !name.trim()}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => {
              setName(contractor.name);
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
      <td className="px-4 py-2">
        <button
          onClick={() => updateMut.mutate({ active_flag: !contractor.active_flag })}
          disabled={updateMut.isPending}
          title={contractor.active_flag ? 'Click to deactivate' : 'Click to activate'}
          className="flex items-center gap-2 disabled:opacity-50"
        >
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              contractor.active_flag ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                contractor.active_flag ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </span>
          <span
            className={`text-xs font-medium ${
              contractor.active_flag ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            {contractor.active_flag ? 'Active' : 'Inactive'}
          </span>
        </button>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-blue-500 hover:text-blue-700"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                if (window.confirm(`Delete contractor "${contractor.name}"? This cannot be undone.`)) {
                  deleteMut.mutate();
                }
              }}
              disabled={deleteMut.isPending}
              className="text-red-500 hover:text-red-700 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

const STRENGTH_STYLES: Record<MatchStrength, string> = {
  Strong: 'bg-red-100 text-red-700',
  Possible: 'bg-amber-100 text-amber-700',
  Weak: 'bg-gray-100 text-gray-500',
};

// Mandatory search → review → add flow: admins must check for a close
// name match before the actual "add contractor" form becomes available.
function AddContractorRow({ contractors, onDone }: { contractors: Contractor[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'search' | 'confirm'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [name, setName] = useState('');

  const matches = useMemo(
    () => (searchTerm.trim().length >= 2 ? topMatches(searchTerm, contractors, (c) => c.name) : []),
    [searchTerm, contractors]
  );

  const mut = useMutation({
    mutationFn: () => usersApi.createContractor({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      onDone();
    },
    onError: () => toast.error('Failed to add contractor'),
  });

  if (step === 'search') {
    const canContinue = searchTerm.trim().length >= 2;
    return (
      <>
        <tr className="bg-blue-50">
          <td className="px-4 py-2" colSpan={2}>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border rounded pl-8 pr-2 py-1 text-sm w-full"
                placeholder="Search existing contractors before adding..."
                autoFocus
              />
            </div>
          </td>
          <td className="px-4 py-2">
            <button onClick={onDone} className="text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </td>
        </tr>
        <tr className="bg-blue-50/60">
          <td colSpan={3} className="px-4 pb-3 pt-0">
            {searchTerm.trim().length < 2 ? (
              <p className="text-xs text-gray-500">
                Type at least 2 characters to check for existing contractors with a similar name.
              </p>
            ) : matches.length === 0 ? (
              <p className="text-xs text-gray-500">No contractors found.</p>
            ) : (
              <ul className="text-sm border border-gray-200 rounded bg-white divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {matches.map(({ item, strength }) => (
                  <li key={item.contractor_id}>
                    <button
                      type="button"
                      onClick={() => {
                        toast('That contractor already exists — edit it instead of adding a duplicate.', { icon: 'ℹ️' });
                        onDone();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
                    >
                      <span className="text-gray-700">{item.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STRENGTH_STYLES[strength]}`}>
                        {strength} match
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => { setName(searchTerm.trim()); setStep('confirm'); }}
                disabled={!canContinue}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                None of these match — continue to add "{searchTerm.trim()}"
              </button>
            </div>
          </td>
        </tr>
      </>
    );
  }

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
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setStep('search')}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Back
          </button>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {addingContractor && (
              <AddContractorRow
                contractors={contractors as Contractor[]}
                onDone={() => setAddingContractor(false)}
              />
            )}
            {contractorsLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</td>
              </tr>
            ) : filteredContractors.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">No contractors found.</td>
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
