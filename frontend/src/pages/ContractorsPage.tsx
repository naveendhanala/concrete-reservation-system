import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Check, X, Search } from 'lucide-react';
import { usersApi } from '../api';
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

export default function ContractorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(false);

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => usersApi.getContractors('', true),
  });
  const all = contractors as Contractor[];

  const term = search.trim();
  const isSearching = term.length > 0;

  const filtered = useMemo(
    () => (isSearching ? all.filter((c) => c.name.toLowerCase().includes(term.toLowerCase())) : all),
    [all, term, isSearching]
  );

  // No direct match: surface close (fuzzy) names so near-duplicates are noticed before adding.
  const similar = useMemo(
    () => (term.length >= 2 && filtered.length === 0 ? topMatches(term, all, (c) => c.name) : []),
    [term, filtered.length, all]
  );

  const addMut = useMutation({
    mutationFn: () => usersApi.createContractor({ name: term }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] });
      toast.success(`Added "${term}"`);
      setSearch('');
    },
    onError: () => toast.error('Failed to add contractor'),
  });

  const listVisible = isSearching || showList;
  const noMatch = !isLoading && isSearching && filtered.length === 0;

  return (
    <div className="p-6">
      <div className="max-w-xl mx-auto mt-8 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Contractor Master
          <span className="ml-2 text-sm font-normal text-gray-400">({all.length})</span>
        </h2>
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contractors..."
            className="border rounded-lg pl-10 pr-3 py-2.5 text-sm w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
        </div>
        {!isSearching && (
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
          >
            {showList ? 'Hide contractors list' : 'Show contractors list'}
          </button>
        )}

        {noMatch && (
          <div className="mt-4 text-sm text-gray-600">
            <p>No contractor found matching "{term}".</p>
            {similar.length > 0 && (
              <div className="mt-3 text-left">
                <p className="text-xs text-gray-500 mb-1">Similar existing names:</p>
                <ul className="border border-gray-200 rounded bg-white divide-y divide-gray-100">
                  {similar.map(({ item, strength }) => (
                    <li key={item.contractor_id}>
                      <button
                        type="button"
                        onClick={() => setSearch(item.name)}
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
              </div>
            )}
            <button
              type="button"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || term.length < 2}
              className="mt-3 text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add "{term}" as new contractor
            </button>
          </div>
        )}
      </div>

      {listVisible && !noMatch && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">No contractors found.</td>
                </tr>
              ) : (
                filtered.map((c) => <ContractorRow key={c.contractor_id} contractor={c} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
