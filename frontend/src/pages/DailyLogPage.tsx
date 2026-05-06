import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { usersApi, packagesApi } from '../api';

const TYPE_OF_WORK = [
  'Bridges', 'SWD', 'Precast Manholes', 'Precast SWD', 'Camp Works', 'Kerb',
  'Bridge/Labour Sheds', 'Bridge/Pier Cap Staging Purpose', 'Girder Casting Yard',
  'Casting Yard', 'Power EHV',
];

interface DailyLogEntry {
  log_id: string;
  contractor_id: string;
  contractor_name: string;
  package_id: string;
  package_name: string;
  type_of_work: string;
  date: string;
  available_count: number;
  additional_expected: number | null;
  expected_date: string | null;
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
}

function AddDailyLogRow({
  contractors,
  packages,
  onDone,
}: {
  contractors: Contractor[];
  packages: Package[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [contractorId, setContractorId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [typeOfWork, setTypeOfWork] = useState('');
  const [availableCount, setAvailableCount] = useState('');
  const [additionalExpected, setAdditionalExpected] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      usersApi.createDailyLogEntry({
        contractor_id: contractorId,
        package_id: packageId,
        type_of_work: typeOfWork,
        available_count: parseInt(availableCount, 10),
        additional_expected: additionalExpected ? parseInt(additionalExpected, 10) : null,
        expected_date: expectedDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-log'] });
      onDone();
    },
    onError: (e: any) => {
      if (e.response?.status === 409) {
        toast.error('Entry already exists for this combination today — edit the existing row instead.');
      } else {
        toast.error('Failed to add entry');
      }
    },
  });

  const handleSave = () => {
    if (!contractorId || !packageId || !typeOfWork) {
      toast.error('Contractor, package, and type of work are required');
      return;
    }
    const count = parseInt(availableCount, 10);
    if (isNaN(count) || count < 0) {
      toast.error('Available count must be a non-negative number');
      return;
    }
    mut.mutate();
  };

  return (
    <tr className="bg-green-50">
      <td className="px-3 py-2">
        <select
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select contractor...</option>
          {contractors.map((c) => (
            <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select package...</option>
          {packages.map((p) => (
            <option key={p.package_id} value={p.package_id}>{p.package_name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={typeOfWork}
          onChange={(e) => setTypeOfWork(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        >
          <option value="">Select type...</option>
          {TYPE_OF_WORK.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          value={availableCount}
          onChange={(e) => setAvailableCount(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-24"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          value={additionalExpected}
          onChange={(e) => setAdditionalExpected(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-24"
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
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

function DailyLogRow({ entry, isToday }: { entry: DailyLogEntry; isToday: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [availableCount, setAvailableCount] = useState(String(entry.available_count));
  const [additionalExpected, setAdditionalExpected] = useState(
    entry.additional_expected != null ? String(entry.additional_expected) : ''
  );
  const [expectedDate, setExpectedDate] = useState(entry.expected_date ?? '');

  const updateMut = useMutation({
    mutationFn: () =>
      usersApi.updateDailyLogEntry(entry.log_id, {
        available_count: parseInt(availableCount, 10),
        additional_expected: additionalExpected ? parseInt(additionalExpected, 10) : null,
        expected_date: expectedDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-log'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to update entry'),
  });

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteDailyLogEntry(entry.log_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-log'] }),
    onError: () => toast.error('Failed to delete entry'),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2 text-sm font-medium text-gray-700">{entry.contractor_name}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{entry.package_name}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{entry.type_of_work}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            value={availableCount}
            onChange={(e) => setAvailableCount(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            value={additionalExpected}
            onChange={(e) => setAdditionalExpected(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => {
              setAvailableCount(String(entry.available_count));
              setAdditionalExpected(entry.additional_expected != null ? String(entry.additional_expected) : '');
              setExpectedDate(entry.expected_date ?? '');
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
      <td className="px-3 py-2 text-sm font-medium text-gray-700">{entry.contractor_name}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.package_name}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.type_of_work}</td>
      <td className="px-3 py-2 text-sm text-gray-800">{entry.available_count}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.additional_expected ?? '—'}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{entry.expected_date ?? '—'}</td>
      <td className="px-3 py-2">
        {isToday && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-blue-500 hover:text-blue-700"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => { if (window.confirm('Delete this entry?')) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
              className="text-red-400 hover:text-red-600 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function DailyLogPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [addingLog, setAddingLog] = useState(false);

  const { data: dailyLog = [], isLoading: logLoading } = useQuery({
    queryKey: ['daily-log', selectedDate],
    queryFn: () => usersApi.getDailyLog(selectedDate),
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => usersApi.getContractors('', true),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.list(),
  });

  const isToday = selectedDate === today;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Daily Availability Log</h2>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setAddingLog(false); }}
            className="border rounded px-2 py-1 text-sm"
          />
          {!isToday && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              Viewing past date — read only
            </span>
          )}
        </div>
        {isToday && !addingLog && (
          <button
            onClick={() => setAddingLog(true)}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Add Row
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contractor</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type of Work</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available Count</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Additional Expected</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Arrival Date</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {addingLog && (
              <AddDailyLogRow
                contractors={contractors as Contractor[]}
                packages={packages as Package[]}
                onDone={() => setAddingLog(false)}
              />
            )}
            {logLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Loading...</td>
              </tr>
            ) : (dailyLog as DailyLogEntry[]).length === 0 && !addingLog ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No entries for this date.
                </td>
              </tr>
            ) : (
              (dailyLog as DailyLogEntry[]).map((entry) => (
                <DailyLogRow key={entry.log_id} entry={entry} isToday={isToday} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
