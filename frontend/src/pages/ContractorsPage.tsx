// src/pages/ContractorsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, packagesApi } from '../api/index';
import toast from 'react-hot-toast';
import { Plus, Pencil, X, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

const TYPE_OF_WORK = [
  'Bridges', 'SWD', 'Precast Manholes', 'Precast SWD', 'Camp Works', 'Kerb',
  'Bridge/Labour Sheds', 'Bridge/Pier Cap Staging Purpose', 'Girder Casting Yard',
  'Casting Yard', 'Power EHV',
];

interface Assignment {
  assignment_id: string;
  contractor_id: string;
  package_id: string;
  package_name: string;
  type_of_work: string;
  labour_count: number;
  additional_expected: number | null;
  expected_date: string | null;
  active_flag: boolean;
}

interface Package {
  package_id: string;
  package_name: string;
}

interface Contractor {
  contractor_id: string;
  name: string;
  contact: string | null;
  mobilized_by: string | null;
  active_flag: boolean;
  assignments?: Assignment[];
}

function AssignmentsEditor({
  contractor,
  packages,
}: {
  contractor: Contractor;
  packages: Package[];
}) {
  const queryClient = useQueryClient();
  const assignments = contractor.assignments || [];
  const [draft, setDraft] = useState<{
    package_id: string;
    type_of_work: string;
    labour_count: string;
    additional_expected: string;
    expected_date: string;
  } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contractors'] });

  const createMutation = useMutation({
    mutationFn: (data: {
      package_id: string;
      type_of_work: string;
      labour_count: number;
      additional_expected: number | null;
      expected_date: string | null;
    }) =>
      usersApi.createContractorAssignment(contractor.contractor_id, data),
    onSuccess: () => {
      toast.success('Assignment added');
      setDraft(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ assignmentId, data }: { assignmentId: string; data: Record<string, any> }) =>
      usersApi.updateContractorAssignment(contractor.contractor_id, assignmentId, data),
    onSuccess: () => {
      toast.success('Assignment updated');
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      usersApi.deleteContractorAssignment(contractor.contractor_id, assignmentId),
    onSuccess: () => {
      toast.success('Assignment removed');
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const saveDraft = () => {
    if (!draft) return;
    const count = parseInt(draft.labour_count, 10);
    if (!draft.package_id || !draft.type_of_work || !Number.isInteger(count) || count < 0) {
      toast.error('Fill Package, Type of Work and a valid Available Count');
      return;
    }
    let addl: number | null = null;
    if (draft.additional_expected !== '') {
      const parsed = parseInt(draft.additional_expected, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        toast.error('Additional Expected must be a non-negative integer');
        return;
      }
      addl = parsed;
    }
    createMutation.mutate({
      package_id: draft.package_id,
      type_of_work: draft.type_of_work,
      labour_count: count,
      additional_expected: addl,
      expected_date: draft.expected_date || null,
    });
  };

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Package / Type of Work / Available Count / Additional Expected / Date
        </h4>
        {!draft && (
          <button
            onClick={() => setDraft({
              package_id: '',
              type_of_work: '',
              labour_count: '',
              additional_expected: '',
              expected_date: '',
            })}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-3 h-3" /> Add Row
          </button>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left py-1 px-2">Package</th>
            <th className="text-left py-1 px-2">Type of Work</th>
            <th className="text-left py-1 px-2 w-32">Available Count</th>
            <th className="text-left py-1 px-2 w-36">Additional Expected</th>
            <th className="text-left py-1 px-2 w-40">Date</th>
            <th className="text-left py-1 px-2 w-20">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {assignments.map((a) => (
            <AssignmentRow
              key={a.assignment_id}
              assignment={a}
              packages={packages}
              onSave={(data) => updateMutation.mutate({ assignmentId: a.assignment_id, data })}
              onDelete={() => {
                if (confirm('Remove this assignment?')) deleteMutation.mutate(a.assignment_id);
              }}
            />
          ))}
          {draft && (
            <tr className="bg-green-50">
              <td className="py-1 px-2">
                <select
                  className="input py-1 text-sm"
                  value={draft.package_id}
                  onChange={(e) => setDraft({ ...draft, package_id: e.target.value })}
                >
                  <option value="">Select package</option>
                  {packages.map((p) => (
                    <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
                  ))}
                </select>
              </td>
              <td className="py-1 px-2">
                <select
                  className="input py-1 text-sm"
                  value={draft.type_of_work}
                  onChange={(e) => setDraft({ ...draft, type_of_work: e.target.value })}
                >
                  <option value="">Select type</option>
                  {TYPE_OF_WORK.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td className="py-1 px-2">
                <input
                  type="number"
                  min={0}
                  className="input py-1 text-sm"
                  placeholder="0"
                  value={draft.labour_count}
                  onChange={(e) => setDraft({ ...draft, labour_count: e.target.value })}
                />
              </td>
              <td className="py-1 px-2">
                <input
                  type="number"
                  min={0}
                  className="input py-1 text-sm"
                  placeholder="0"
                  value={draft.additional_expected}
                  onChange={(e) => setDraft({ ...draft, additional_expected: e.target.value })}
                />
              </td>
              <td className="py-1 px-2">
                <input
                  type="date"
                  className="input py-1 text-sm"
                  value={draft.expected_date}
                  onChange={(e) => setDraft({ ...draft, expected_date: e.target.value })}
                />
              </td>
              <td className="py-1 px-2">
                <div className="flex gap-1">
                  <button
                    onClick={saveDraft}
                    disabled={createMutation.isPending}
                    className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    className="p-1.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          )}
          {assignments.length === 0 && !draft && (
            <tr>
              <td colSpan={6} className="py-3 px-2 text-center text-xs text-gray-400">
                No assignments yet. Click "Add Row" to add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentRow({
  assignment,
  packages,
  onSave,
  onDelete,
}: {
  assignment: Assignment;
  packages: Package[];
  onSave: (data: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [packageId, setPackageId] = useState(assignment.package_id);
  const [typeOfWork, setTypeOfWork] = useState(assignment.type_of_work);
  const [labourCount, setLabourCount] = useState(String(assignment.labour_count));
  const [additionalExpected, setAdditionalExpected] = useState(
    assignment.additional_expected == null ? '' : String(assignment.additional_expected)
  );
  const [expectedDate, setExpectedDate] = useState(
    assignment.expected_date ? assignment.expected_date.slice(0, 10) : ''
  );

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="py-1 px-2">
          <select className="input py-1 text-sm" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            {packages.map((p) => (
              <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
            ))}
          </select>
        </td>
        <td className="py-1 px-2">
          <select className="input py-1 text-sm" value={typeOfWork} onChange={(e) => setTypeOfWork(e.target.value)}>
            {TYPE_OF_WORK.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
        <td className="py-1 px-2">
          <input
            type="number"
            min={0}
            className="input py-1 text-sm"
            value={labourCount}
            onChange={(e) => setLabourCount(e.target.value)}
          />
        </td>
        <td className="py-1 px-2">
          <input
            type="number"
            min={0}
            className="input py-1 text-sm"
            value={additionalExpected}
            onChange={(e) => setAdditionalExpected(e.target.value)}
          />
        </td>
        <td className="py-1 px-2">
          <input
            type="date"
            className="input py-1 text-sm"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </td>
        <td className="py-1 px-2">
          <div className="flex gap-1">
            <button
              onClick={() => {
                const count = parseInt(labourCount, 10);
                if (!Number.isInteger(count) || count < 0) {
                  toast.error('Enter a valid available count');
                  return;
                }
                let addl: number | null = null;
                if (additionalExpected !== '') {
                  const parsed = parseInt(additionalExpected, 10);
                  if (!Number.isInteger(parsed) || parsed < 0) {
                    toast.error('Additional Expected must be a non-negative integer');
                    return;
                  }
                  addl = parsed;
                }
                onSave({
                  package_id: packageId,
                  type_of_work: typeOfWork,
                  labour_count: count,
                  additional_expected: addl,
                  expected_date: expectedDate || null,
                });
                setEditing(false);
              }}
              className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPackageId(assignment.package_id);
                setTypeOfWork(assignment.type_of_work);
                setLabourCount(String(assignment.labour_count));
                setAdditionalExpected(assignment.additional_expected == null ? '' : String(assignment.additional_expected));
                setExpectedDate(assignment.expected_date ? assignment.expected_date.slice(0, 10) : '');
              }}
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
    <tr className="hover:bg-gray-100">
      <td className="py-2 px-2 text-sm text-gray-800">{assignment.package_name}</td>
      <td className="py-2 px-2 text-sm text-gray-800">{assignment.type_of_work}</td>
      <td className="py-2 px-2 text-sm text-gray-800 font-mono">{assignment.labour_count}</td>
      <td className="py-2 px-2 text-sm text-gray-800 font-mono">
        {assignment.additional_expected ?? '—'}
      </td>
      <td className="py-2 px-2 text-sm text-gray-800">
        {assignment.expected_date ? assignment.expected_date.slice(0, 10) : '—'}
      </td>
      <td className="py-2 px-2">
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ContractorRow({
  contractor,
  packages,
  expanded,
  onToggle,
}: {
  contractor: Contractor;
  packages: Package[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);
  const [contact, setContact] = useState(contractor.contact || '');
  const [mobilizedBy, setMobilizedBy] = useState(contractor.mobilized_by || '');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      usersApi.updateContractor(contractor.contractor_id, data),
    onSuccess: () => {
      toast.success('Contractor updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const cancel = () => {
    setEditing(false);
    setName(contractor.name);
    setContact(contractor.contact || '');
    setMobilizedBy(contractor.mobilized_by || '');
  };

  const assignmentCount = contractor.assignments?.length || 0;
  const totalLabour = contractor.assignments?.reduce((sum, a) => sum + a.labour_count, 0) || 0;

  if (editing) {
    return (
      <>
        <tr className="bg-blue-50">
          <td className="px-4 py-2 w-8" />
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
          <td className="px-4 py-2">
            <input
              className="input py-1 text-sm"
              placeholder="Mobilized by (optional)"
              value={mobilizedBy}
              onChange={(e) => setMobilizedBy(e.target.value)}
            />
          </td>
          <td className="px-4 py-2 text-sm text-gray-400">—</td>
          <td className="px-4 py-2 text-sm text-gray-400">—</td>
          <td className="px-4 py-2">
            <div className="flex gap-2">
              <button
                onClick={() => updateMutation.mutate({ name, contact: contact || null, mobilized_by: mobilizedBy || null })}
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
      </>
    );
  }

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${!contractor.active_flag ? 'opacity-60' : ''}`}>
        <td className="px-2 py-3 w-8">
          <button
            onClick={onToggle}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{contractor.name}</td>
        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{contractor.contact || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{contractor.mobilized_by || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {assignmentCount === 0 ? (
            <span className="text-gray-400">—</span>
          ) : (
            <span>{assignmentCount} row{assignmentCount === 1 ? '' : 's'} · {totalLabour} labour</span>
          )}
        </td>
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
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <AssignmentsEditor contractor={contractor} packages={packages} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddContractorRow({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [mobilizedBy, setMobilizedBy] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      usersApi.createContractor({
        name,
        contact: contact || null,
        mobilized_by: mobilizedBy || null,
      }),
    onSuccess: () => {
      toast.success('Contractor added');
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
      onDone();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add'),
  });

  return (
    <tr className="bg-green-50">
      <td className="px-4 py-2 w-8" />
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
      <td className="px-4 py-2">
        <input
          className="input py-1 text-sm"
          placeholder="Mobilized by (optional)"
          value={mobilizedBy}
          onChange={(e) => setMobilizedBy(e.target.value)}
        />
      </td>
      <td className="px-4 py-2 text-sm text-gray-400">—</td>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => usersApi.getContractors('', true, 'assignments'),
  });

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
  });

  const filtered = contractors.filter((c: Contractor) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                  <th className="w-8" />
                  {['Name', 'Contact', 'Mobilized By', 'Assignments', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adding && <AddContractorRow onDone={() => setAdding(false)} />}
                {filtered.map((c: Contractor) => (
                  <ContractorRow
                    key={c.contractor_id}
                    contractor={c}
                    packages={packages}
                    expanded={expanded.has(c.contractor_id)}
                    onToggle={() => toggle(c.contractor_id)}
                  />
                ))}
                {filtered.length === 0 && !adding && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
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
