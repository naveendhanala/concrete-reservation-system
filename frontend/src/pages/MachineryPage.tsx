// src/pages/MachineryPage.tsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { machineryApi, packagesApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Plus, Pencil, Trash2, X, Check, UserCheck,
  AlertTriangle, CheckCircle2, ClipboardList, Upload, Download,
} from 'lucide-react';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Machinery {
  machinery_id: string;
  description: string;
  make_model: string | null;
  reg_no: string | null;
  last_month_availability: number | null;
  last_month_utilization: number | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  has_open_issue: boolean;
  created_at: string;
}

interface MachineryIssue {
  issue_id: string;
  machinery_id: string;
  machinery_name: string;
  machinery_type: string | null;
  package_name: string | null;
  remarks: string;
  raised_by_name: string;
  raised_by_login: string;
  created_at: string;
}

interface MachineryRequest {
  request_id: string;
  machinery_name: string;
  machinery_type: string | null;
  remarks: string | null;
  status: 'Pending' | 'Completed';
  package_name: string;
  requested_by_name?: string;   // PMHead view only
  requested_by_login?: string;
  created_at: string;
}

// ── Add / Edit Machinery modal (PMHead only) ───────────────────────────────────
function MachineryFormModal({ editItem, onClose }: { editItem: Machinery | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!editItem;
  const [description, setDescription] = useState(editItem?.description || '');
  const [makeModel, setMakeModel] = useState(editItem?.make_model || '');
  const [regNo, setRegNo] = useState(editItem?.reg_no || '');
  const [availability, setAvailability] = useState(editItem?.last_month_availability?.toString() || '');
  const [utilization, setUtilization] = useState(editItem?.last_month_utilization?.toString() || '');

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? machineryApi.update(editItem!.machinery_id, data) : machineryApi.create(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Machinery updated' : 'Machinery added');
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit Machinery' : 'Add Machinery'}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!description.trim()) { toast.error('Description of Equipment is required'); return; }
            saveMutation.mutate({
              description: description.trim(),
              make_model: makeModel.trim() || undefined,
              reg_no: regNo.trim() || undefined,
              last_month_availability: availability !== '' ? parseFloat(availability) : undefined,
              last_month_utilization:  utilization  !== '' ? parseFloat(utilization)  : undefined,
            });
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="label">Description of Equipment <span className="text-red-500">*</span></label>
            <textarea className="input min-h-[72px] resize-none" placeholder="e.g. 36m Concrete Boom Placer" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Make / Model <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. SCHWING S36X, PUTZMEISTER M36" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} />
          </div>
          <div>
            <label className="label">Reg No / M.Sr.No <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. MH12AB1234" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Last Month Avail %</label>
              <input className="input" type="number" min="0" max="100" step="0.01" placeholder="e.g. 85.5" value={availability} onChange={(e) => setAvailability(e.target.value)} />
            </div>
            <div>
              <label className="label">Last Month Util %</label>
              <input className="input" type="number" min="0" max="100" step="0.01" placeholder="e.g. 72.0" value={utilization} onChange={(e) => setUtilization(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />{saveMutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Machinery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign Package modal (PMHead only) ────────────────────────────────────────
function AssignModal({ item, packages, onClose }: { item: Machinery; packages: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedPkg, setSelectedPkg] = useState(item.assigned_to || '');

  const assignMutation = useMutation({
    mutationFn: (assigned_to: string | null) =>
      machineryApi.update(item.machinery_id, { assigned_to: assigned_to || '' }),
    onSuccess: () => {
      toast.success('Assignment updated');
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Assignment failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Assign to Package</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Assigning: <span className="font-medium text-gray-900">{item.description}</span></p>
          <div>
            <label className="label">Assign to Package</label>
            <select className="input" value={selectedPkg} onChange={(e) => setSelectedPkg(e.target.value)}>
              <option value="">— Unassigned —</option>
              {packages.map((pkg: any) => (
                <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={() => assignMutation.mutate(selectedPkg || null)} disabled={assignMutation.isPending} className="btn-primary flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />{assignMutation.isPending ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Raise Issue modal (PM only) ───────────────────────────────────────────────
function RaiseIssueModal({ item, onClose }: { item: Machinery; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const mutation = useMutation({
    mutationFn: () => machineryApi.raiseIssue(item.machinery_id, remarks),
    onSuccess: () => {
      toast.success('Issue raised successfully');
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to raise issue'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Raise Issue
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!remarks.trim()) { toast.error('Remarks are required'); return; } mutation.mutate(); }} className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Machinery: <span className="font-medium text-gray-900">{item.description}</span></p>
          <div>
            <label className="label">Remarks <span className="text-red-500">*</span></label>
            <textarea className="input min-h-[96px] resize-none" placeholder="Describe the issue..." value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />{mutation.isPending ? 'Submitting...' : 'Raise Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Resolve Issue modal (PMHead only) ─────────────────────────────────────────
function ResolveIssueModal({ issue, onClose }: { issue: MachineryIssue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const mutation = useMutation({
    mutationFn: () => machineryApi.resolveIssue(issue.issue_id, remarks),
    onSuccess: () => {
      toast.success('Issue marked as resolved');
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      queryClient.invalidateQueries({ queryKey: ['machinery-issues'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to resolve issue'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Resolve Issue
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!remarks.trim()) { toast.error('Remarks are required'); return; } mutation.mutate(); }} className="p-6 space-y-4">
          <div className="bg-red-50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium text-gray-900">{issue.machinery_name}</p>
            <p className="text-xs text-gray-500">Raised by {issue.raised_by_name} · {issue.created_at.slice(0, 10)}</p>
            <p className="text-sm text-gray-700 mt-1">{issue.remarks}</p>
          </div>
          <div>
            <label className="label">Resolution Remarks <span className="text-red-500">*</span></label>
            <textarea className="input min-h-[96px] resize-none" placeholder="Describe how the issue was resolved..." value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />{mutation.isPending ? 'Saving...' : 'Mark Resolved'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Request modal (PM only) ───────────────────────────────────────────────
function NewRequestModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [machineryName, setMachineryName] = useState('');
  const [machineryType, setMachineryType] = useState('');
  const [remarks, setRemarks] = useState('');

  const mutation = useMutation({
    mutationFn: () => machineryApi.createRequest({
      machinery_name: machineryName.trim(),
      machinery_type: machineryType.trim() || undefined,
      remarks: remarks.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Request submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['machinery-requests'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to submit request'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-600" /> New Machinery Request
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!machineryName.trim()) { toast.error('Machinery name is required'); return; } mutation.mutate(); }} className="p-6 space-y-4">
          <div>
            <label className="label">Machinery Name <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. Transit Mixer" value={machineryName} onChange={(e) => setMachineryName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Type <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. Transit Mixer, Pump, Vibrator" value={machineryType} onChange={(e) => setMachineryType(e.target.value)} />
          </div>
          <div>
            <label className="label">Remarks <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Any additional details..." value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />{mutation.isPending ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Upload Modal (PMHead only) ────────────────────────────────────────────────
const UPLOAD_COLUMNS = [
  'Description of Equipment',
  'Make/Model',
  'Reg No/M.Sr.No',
  'Assigned To (Package Name)',
  'Last Month Avail %',
  'Last Month Util %',
];

const COL_MAP: Record<string, string> = {
  'description of equipment': 'description',
  'make/model': 'make_model',
  'make / model': 'make_model',
  'reg no/m.sr.no': 'reg_no',
  'reg no / m.sr.no': 'reg_no',
  'assigned to (package name)': 'package_name',
  'assigned to': 'package_name',
  'last month avail %': 'last_month_availability',
  'last month availability (%)': 'last_month_availability',
  'last month availability': 'last_month_availability',
  'last month util %': 'last_month_utilization',
  'last month utilization (%)': 'last_month_utilization',
  'last month utilization': 'last_month_utilization',
};

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([UPLOAD_COLUMNS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Machinery');
  XLSX.writeFile(wb, 'machinery_upload_template.xlsx');
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState('');

  const uploadMutation = useMutation({
    mutationFn: (records: any[]) => machineryApi.upload(records),
    onSuccess: (res: any) => {
      if (res.errors?.length) {
        toast.error(
          `${res.created} created, ${res.updated} updated — ${res.errors.length} row(s) failed (row ${res.errors.map((e: any) => e.row).join(', ')})`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Upload complete — ${res.created} created, ${res.updated} updated`);
      }
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      onClose();
    },
    onError: (err: any) => {
      const body = err.response?.data;
      const msg = body?.error || body?.message || `Upload failed (HTTP ${err.response?.status ?? 'no response'})`;
      toast.error(msg, { duration: 8000 });
    },
  });

  const parseFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      if (rows.length < 2) { toast.error('File has no data rows'); return; }

      const headers = (rows[0] as string[]).map((h) => h.toString().trim().toLowerCase());
      const records = rows.slice(1).filter((r) => r.some((v) => v !== '')).map((row) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const key = COL_MAP[h];
          if (key) obj[key] = row[i]?.toString().trim() || '';
        });
        return obj;
      });
      setPreview(records);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary-600" /> Upload Machinery
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Template download */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Download Template</p>
              <p className="text-xs text-gray-400 mt-0.5">Use this template to fill in machinery details</p>
            </div>
            <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Template (.xlsx)
            </button>
          </div>

          {/* File input */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {fileName ? <span className="font-medium text-primary-600">{fileName}</span> : 'Click to select .xlsx or .csv file'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }}
            />
          </div>

          {/* Preview */}
          {preview && preview.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{preview.length} records ready to upload</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Description', 'Make/Model', 'Reg No', 'Package', 'Last Month Avail %', 'Last Month Util %'].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 10).map((r, i) => (
                      <tr key={i} className={!r.description ? 'bg-red-50' : ''}>
                        <td className="px-3 py-1.5 text-gray-900">{r.description || <span className="text-red-500">Missing</span>}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.make_model || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.reg_no || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.package_name || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.last_month_availability || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.last_month_utilization || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 10 && <p className="text-xs text-gray-400 mt-1">Showing 10 of {preview.length} rows</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => preview && uploadMutation.mutate(preview)}
            disabled={!preview || preview.length === 0 || uploadMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadMutation.isPending ? 'Uploading...' : `Upload ${preview?.length || 0} Records`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Machinery table ────────────────────────────────────────────────────────────
function MachineryTable({
  rows, isPMHead, isPM, search, emptyText, showRaiseIssue,
  onAssign, onEdit, onDelete, onRaiseIssue, deleteIsPending,
}: {
  rows: Machinery[]; isPMHead: boolean; isPM: boolean;
  search: string; emptyText: string; showRaiseIssue?: boolean;
  onAssign?: (m: Machinery) => void; onEdit?: (m: Machinery) => void;
  onDelete?: (m: Machinery) => void; onRaiseIssue?: (m: Machinery) => void;
  deleteIsPending: boolean;
}) {
  const filtered = rows.filter((m) =>
    m.description.toLowerCase().includes(search.toLowerCase()) ||
    (m.make_model || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.reg_no || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.assigned_to_name || '').toLowerCase().includes(search.toLowerCase())
  );
  const showActions = isPMHead || (isPM && showRaiseIssue);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Description of Equipment', 'Make / Model', 'Reg No / M.Sr.No', 'Package', 'Last Month Avail %', 'Last Month Util %', ...(showActions ? ['Actions'] : [])].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((m) => (
              <tr key={m.machinery_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{m.description}</span>
                    {m.has_open_issue && (
                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" /> Issue
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{m.make_model || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{m.reg_no || '—'}</td>
                <td className="px-4 py-3">
                  {m.assigned_to_name ? (
                    <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-xs font-medium">
                      <UserCheck className="w-3 h-3" />{m.assigned_to_name}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {m.last_month_availability != null ? `${m.last_month_availability}%` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {m.last_month_utilization != null ? `${m.last_month_utilization}%` : '—'}
                </td>
                {showActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isPMHead && (
                        <>
                          <button onClick={() => onAssign?.(m)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Assign to Package">
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onEdit?.(m)} className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onDelete?.(m)} disabled={deleteIsPending} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {isPM && showRaiseIssue && (
                        <button
                          onClick={() => onRaiseIssue?.(m)}
                          disabled={m.has_open_issue}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={m.has_open_issue ? 'Issue already open' : 'Raise Issue'}

                        >
                          <AlertTriangle className="w-3 h-3" />
                          {m.has_open_issue ? 'Issue Open' : 'Raise Issue'}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={showActions ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                  {search ? 'No machinery matches your search.' : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Issues table (PMHead tab) ──────────────────────────────────────────────────
function IssuesTable({ issues, onResolve }: { issues: MachineryIssue[]; onResolve: (i: MachineryIssue) => void }) {
  if (issues.length === 0) return <div className="card p-8 text-center text-gray-400">No open issues.</div>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Machinery', 'Package', 'Raised By', 'Remarks', 'Date', 'Action'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {issues.map((issue) => (
              <tr key={issue.issue_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{issue.machinery_name}</span>
                    <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" /> Issue
                    </span>
                  </div>
                  {issue.machinery_type && <p className="text-xs text-gray-400 mt-0.5">{issue.machinery_type}</p>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{issue.package_name || '—'}</td>
                <td className="px-4 py-3 text-gray-700 text-xs">{issue.raised_by_name}</td>
                <td className="px-4 py-3 text-gray-700 max-w-xs"><p className="line-clamp-2">{issue.remarks}</p></td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{issue.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => onResolve(issue)} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Requests table (PM + PMHead tab) ──────────────────────────────────────────
function RequestsTable({
  requests, isPMHead, onComplete,
}: {
  requests: MachineryRequest[];
  isPMHead: boolean;
  onComplete?: (r: MachineryRequest) => void;
}) {
  if (requests.length === 0) return <div className="card p-8 text-center text-gray-400">No machinery requests yet.</div>;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                'Machinery',
                ...(isPMHead ? ['Package', 'Requested By'] : []),
                'Remarks',
                'Date',
                'Status',
                ...(isPMHead ? ['Action'] : []),
              ].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((r) => (
              <tr key={r.request_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{r.machinery_name}</p>
                  {r.machinery_type && <p className="text-xs text-gray-400 mt-0.5">{r.machinery_type}</p>}
                </td>
                {isPMHead && (
                  <>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.package_name}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{r.requested_by_name}</td>
                  </>
                )}
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <p className="line-clamp-2">{r.remarks || '—'}</p>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{r.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  {r.status === 'Pending' ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-medium">
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                  )}
                </td>
                {isPMHead && (
                  <td className="px-4 py-3">
                    {r.status === 'Pending' && (
                      <button
                        onClick={() => onComplete?.(r)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'all' | 'mine' | 'available' | 'issues' | 'requests';

export default function MachineryPage() {
  const { user } = useAuth();
  const isPMHead = user?.role === 'PMHead';
  const isPM = user?.role === 'PM';
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editItem, setEditItem] = useState<Machinery | null>(null);
  const [assignItem, setAssignItem] = useState<Machinery | null>(null);
  const [raiseIssueItem, setRaiseIssueItem] = useState<Machinery | null>(null);
  const [resolveIssueItem, setResolveIssueItem] = useState<MachineryIssue | null>(null);
  const [completeRequest, setCompleteRequest] = useState<MachineryRequest | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const { data: machinery = [], isLoading } = useQuery({
    queryKey: ['machinery'],
    queryFn: machineryApi.list,
  });

  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ['machinery-issues'],
    queryFn: machineryApi.listIssues,
    enabled: isPMHead && activeTab === 'issues',
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['machinery-requests'],
    queryFn: machineryApi.listRequests,
    enabled: (isPM || isPMHead) && activeTab === 'requests',
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
    enabled: isPMHead,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => machineryApi.remove(id),
    onSuccess: () => {
      toast.success('Machinery deleted');
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const completeRequestMutation = useMutation({
    mutationFn: (requestId: string) => machineryApi.completeRequest(requestId),
    onSuccess: () => {
      toast.success('Request marked as completed');
      queryClient.invalidateQueries({ queryKey: ['machinery-requests'] });
      setCompleteRequest(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to complete request'),
  });

  const handleDelete = (item: Machinery) => {
    if (!window.confirm(`Delete "${item.description}"? This cannot be undone.`)) return;
    deleteMutation.mutate(item.machinery_id);
  };

  const activePackages = packages.filter((p: any) => p.active_flag);
  const myPackageId = user?.packageIds?.[0];
  const assignedToMe = machinery.filter((m: Machinery) => m.assigned_to === myPackageId);
  const available = machinery.filter((m: Machinery) => !m.assigned_to);
  const pendingRequests = (requests as MachineryRequest[]).filter((r) => r.status === 'Pending');

  const allTabs: { key: Tab; label: string; count: number; pmOnly?: boolean; pmheadOnly?: boolean }[] = [
    { key: 'all' as Tab,       label: 'All Machinery',      count: machinery.length },
    { key: 'mine' as Tab,      label: 'Assigned to Me',     count: assignedToMe.length,   pmOnly: true },
    { key: 'available' as Tab, label: 'Available',           count: available.length },
    { key: 'issues' as Tab,    label: 'Machinery Issues',   count: (issues as any[]).length, pmheadOnly: true },
    { key: 'requests' as Tab,  label: 'Machinery Requests', count: isPMHead ? pendingRequests.length : (requests as any[]).length },
  ];
  const tabs = allTabs.filter((t) => {
    if (t.pmOnly && !isPM) return false;
    if (t.pmheadOnly && !isPMHead) return false;
    if (t.key === 'requests' && !isPM && !isPMHead) return false;
    return true;
  });

  const switchTab = (key: Tab) => { setActiveTab(key); setSearch(''); };

  const tabRows: Record<'all' | 'mine' | 'available', Machinery[]> = {
    all: machinery,
    mine: assignedToMe,
    available,
  };

  const isMachineryTab = activeTab === 'all' || activeTab === 'mine' || activeTab === 'available';
  const isLoaderActive = isLoading ||
    (activeTab === 'issues' && issuesLoading) ||
    (activeTab === 'requests' && requestsLoading);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Machinery</h1>
          <p className="text-sm text-gray-400 mt-0.5">{machinery.length} items total</p>
        </div>
        <div className="flex items-center gap-2">
          {isPM && activeTab === 'requests' && (
            <button onClick={() => setShowRequestModal(true)} className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4" /> New Request
            </button>
          )}
          {isPMHead && activeTab !== 'requests' && activeTab !== 'issues' && (
            <>
              <button onClick={() => setShowUploadModal(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
                <Upload className="w-4 h-4" /> Upload
              </button>
              <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> Add Machinery
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map((t) => {
          const isAlert = (t.key === 'issues' || (t.key === 'requests' && isPMHead)) && t.count > 0;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key as Tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                activeTab === t.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.key === 'issues' && <AlertTriangle className="w-3.5 h-3.5" />}
              {t.key === 'requests' && <ClipboardList className="w-3.5 h-3.5" />}
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === t.key
                  ? isAlert ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-700'
                  : isAlert ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoaderActive ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : activeTab === 'issues' ? (
        <IssuesTable issues={issues as MachineryIssue[]} onResolve={setResolveIssueItem} />
      ) : activeTab === 'requests' ? (
        <RequestsTable
          requests={requests as MachineryRequest[]}
          isPMHead={isPMHead}
          onComplete={setCompleteRequest}
        />
      ) : (
        <>
          <div className="mb-4">
            <input
              className="input w-64 text-sm"
              placeholder="Search by description, make, reg no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <MachineryTable
            rows={isMachineryTab ? tabRows[activeTab as 'all' | 'mine' | 'available'] : machinery}
            isPMHead={isPMHead}
            isPM={isPM}
            search={search}
            showRaiseIssue={activeTab === 'mine'}
            emptyText={
              activeTab === 'all'  ? 'No machinery added yet.' :
              activeTab === 'mine' ? 'No machinery assigned to your package.' :
                                     'No machinery available.'
            }
            onAssign={setAssignItem}
            onEdit={setEditItem}
            onDelete={handleDelete}
            onRaiseIssue={setRaiseIssueItem}
            deleteIsPending={deleteMutation.isPending}
          />
        </>
      )}

      {/* Confirm complete request inline — no extra modal needed */}
      {completeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <h2 className="font-semibold text-gray-900">Mark Request as Completed?</h2>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-gray-900">{completeRequest.machinery_name}</p>
              {completeRequest.machinery_type && <p className="text-gray-500">{completeRequest.machinery_type}</p>}
              <p className="text-gray-500">Package: {completeRequest.package_name}</p>
              {completeRequest.requested_by_name && <p className="text-gray-500">Requested by: {completeRequest.requested_by_name}</p>}
            </div>
            <p className="text-sm text-gray-500">Confirm that the machinery has been assigned to this package.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCompleteRequest(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => completeRequestMutation.mutate(completeRequest.request_id)}
                disabled={completeRequestMutation.isPending}
                className="btn-primary flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {completeRequestMutation.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddModal && <MachineryFormModal editItem={null} onClose={() => setShowAddModal(false)} />}
      {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} />}
      {editItem && <MachineryFormModal editItem={editItem} onClose={() => setEditItem(null)} />}
      {assignItem && <AssignModal item={assignItem} packages={activePackages} onClose={() => setAssignItem(null)} />}
      {raiseIssueItem && <RaiseIssueModal item={raiseIssueItem} onClose={() => setRaiseIssueItem(null)} />}
      {resolveIssueItem && <ResolveIssueModal issue={resolveIssueItem} onClose={() => setResolveIssueItem(null)} />}
      {showRequestModal && <NewRequestModal onClose={() => setShowRequestModal(false)} />}
    </div>
  );
}
