// src/pages/UsersPage.tsx
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/index';

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const roleColors: Record<string, string> = {
    PM: 'bg-blue-100 text-blue-800', ClusterHead: 'bg-purple-100 text-purple-800',
    VP: 'bg-orange-100 text-orange-800', PMHead: 'bg-green-100 text-green-800',
    Admin: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">User Management</h1>
        <button className="btn-primary text-xs">+ Add User</button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Role', 'Email', 'Packages', 'Same-Day Count', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u: any) => (
                <tr key={u.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.packages?.filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">{u.same_day_request_count || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.active_flag ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active_flag ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
