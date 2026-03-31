// src/api/auth.api.ts
import client from './client';
export const authApi = {
  login: async (login_id: string, password: string) => {
    const { data } = await client.post('/auth/login', { login_id, password });
    return data;
  },
  getMe: async () => {
    const { data } = await client.get('/auth/me');
    return data;
  },
  logout: () => client.post('/auth/logout'),
};
