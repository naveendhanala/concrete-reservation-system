// src/pages/UsersPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, packagesApi } from '../api/index';
import toast from 'react-hot-toast';
import { Plus, Pencil, X, Check, Eye, EyeOff } from 'lucide-react';

const ROLES = ['VP', 'ClusterHead', 'PM', 'Engineer', 'PMHead', 'PMManager', 'Admin', 'LabourMob'] as const;
type Role = typeof ROLES[number];

const roleColors: Record<string, string> = {
  VP: 'bg-orange-100 text-orange-800',
  ClusterHead: 'bg-purple-100 text-purple-800',
  PM: 'bg-blue-100 text-blue-800',
  Engineer: 'bg-sky-100 text-sky-800',
  PMHead: 'bg-green-100 text-green-800',
  PMManager: 'bg-teal-100 text-teal-800',
  Admin: 'bg-red-100 text-red-800',
  LabourMob: 'bg-amber-100 text-amber-800',
};

// Roles that can be assigned packages
const PACKAGE_ROLES: Role[] = ['PM', 'ClusterHead', 'Engineer'];
// Roles that can be assigned batching plants
const PLANT_ROLES: Role[] = ['PMManager', 'PMHead'];

interface UserFormState {
  name: string;
  login_id: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
  packageIds: string[];
  plantIds: string[];
}

const emptyForm = (): UserFormState => ({
  name: '', login_id: '', email: '', phone: '',
  role: 'PM', password: '', packageIds: [], plantIds: [],
});

function UserFormModal({
  editUser,
  onClose,
}: {
  editUser: any | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editUser;

  const [form, setForm] = useState<UserFormState>(() => {
    if (editUser) {
      return {
        name: editUser.name || '',
        login_id: editUser.login_id || '',
        email: editUser.email || '',
        phone: editUser.phone || '',
        role: editUser.role || 'PM',
        password: '',
        packageIds: editUser.package_ids?.filter(Boolean) || [],
        plantIds: editUser.plant_ids?.filter(Boolean) || [],
      };
    }
    return emptyForm();
  });
  const [showPw, setShowPw] = useState(false);

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: packagesApi.list,
  });
  const { data: plants = [] } = useQuery({
    queryKey: ['plants'],
    queryFn: usersApi.getPlants,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      isEdit ? usersApi.update(editUser.user_id, data) : usersApi.create(data),
    onSuccess: () => {
      toast.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {
      name: form.name,
      login_id: form.login_id,
      email: form.email || undefined,
      phone: form.phone || undefined,
      role: form.role,
      packageIds: PACKAGE_ROLES.includes(form.role) ? form.packageIds : [],
      plantIds: PLANT_ROLES.includes(form.role) ? form.plantIds : [],
    };
    if (form.password) payload.password = form.password;
    if (!isEdit && !form.password) {
      toast.error('Password is required for new users');
      return;
    }
    saveMutation.mutate(payload);
  };

  const toggleArr = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>

          {/* Login ID */}
          <div>
            <label className="label">Login ID <span className="text-red-500">*</span></label>
            <input
              className="input font-mono"
              placeholder="e.g. pm_john"
              value={form.login_id}
              onChange={(e) => setForm({ ...form, login_id: e.target.value.toLowerCase().replace(/\s/g, '_') })}
              required
            />
            <p className="text-xs text-gray-400 mt-1">Used to log in. Lowercase, no spaces.</p>
          </div>

          {/* Password */}
          <div>
            <label className="label">
              Password {!isEdit && <span className="text-red-500">*</span>}
              {isEdit && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input pr-10"
                placeholder={isEdit ? 'Enter new password to change' : '••••••••'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!isEdit}
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="label">Role <span className="text-red-500">*</span></label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role, packageIds: [], plantIds: [] })}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Packages — for PM / ClusterHead */}
          {PACKAGE_ROLES.includes(form.role) && (
            <div>
              <label className="label">Package(s) Assigned</label>
              <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
                {packages.map((pkg: any) => (
                  <label key={pkg.package_id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.packageIds.includes(pkg.package_id)}
                      onChange={() => setForm({ ...form, packageIds: toggleArr(form.packageIds, pkg.package_id) })}
                      className="rounded text-primary-600"
                    />
                    {pkg.package_name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Batching Plants — for PMManager / PMHead */}
          {PLANT_ROLES.includes(form.role) && (
            <div>
              <label className="label">Batching Plant(s) Assigned</label>
              <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                {plants.map((plant: any) => (
                  <label key={plant.plant_id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.plantIds.includes(plant.plant_id)}
                      onChange={() => setForm({ ...form, plantIds: toggleArr(form.plantIds, plant.plant_id) })}
                      className="rounded text-primary-600"
                    />
                    {plant.plant_name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email (optional)</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input className="input" placeholder="+91XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              {saveMutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [modalUser, setModalUser] = useState<any | null | 'new'>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [visiblePw, setVisiblePw] = useState<Record<string, boolean>>({});

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  // Fetch full user details (with IDs) when editing
  const { data: fullEditUser } = useQuery({
    queryKey: ['users', modalUser?.user_id],
    queryFn: () => usersApi.getById(modalUser.user_id),
    enabled: !!modalUser && modalUser !== 'new' && typeof modalUser === 'object',
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.update(id, { active_flag: active }),
    onSuccess: (_, { active }) => {
      toast.success(active ? 'User activated' : 'User marked inactive');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const users = roleFilter ? allUsers.filter((u: any) => u.role === roleFilter) : allUsers;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => setModalUser('new')}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          className="input w-48 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Login ID', 'Password', 'Role', 'Packages / Plants', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u: any) => (
                  <tr key={u.user_id} className={`hover:bg-gray-50 ${!u.active_flag ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-xs">{u.login_id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-700">
                          {visiblePw[u.user_id] ? (u.plain_password || '—') : (u.plain_password ? '••••••••' : '—')}
                        </span>
                        {u.plain_password && (
                          <button
                            onClick={() => setVisiblePw((p) => ({ ...p, [u.user_id]: !p[u.user_id] }))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {visiblePw[u.user_id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                      {u.batching_plants?.filter(Boolean).length
                        ? u.batching_plants.filter(Boolean).join(', ')
                        : u.packages?.filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: u.user_id, active: !u.active_flag })}
                        disabled={toggleActiveMutation.isPending}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer border transition-colors ${
                          u.active_flag
                            ? 'bg-green-100 text-green-800 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                        }`}
                        title={u.active_flag ? 'Click to mark inactive' : 'Click to activate'}
                      >
                        {u.active_flag ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModalUser(u)}
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="Edit user"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalUser !== null && (
        modalUser === 'new'
          ? <UserFormModal editUser={null} onClose={() => setModalUser(null)} />
          : fullEditUser
            ? <UserFormModal editUser={fullEditUser} onClose={() => setModalUser(null)} />
            : null
      )}
    </div>
  );
}
