// src/api/auth.api.ts
import client from './client';
export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await client.post('/auth/login', { email, password });
    return data;
  },
  getMe: async () => {
    const { data } = await client.get('/auth/me');
    return data;
  },
  logout: () => client.post('/auth/logout'),
};
