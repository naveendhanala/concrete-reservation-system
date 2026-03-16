// src/api/reservations.api.ts
import client from './client';

export const reservationsApi = {
  list: (params?: Record<string, any>) =>
    client.get('/reservations', { params }).then((r) => r.data),

  getById: (id: string) =>
    client.get(`/reservations/${id}`).then((r) => r.data),

  create: (data: Record<string, any>) =>
    client.post('/reservations', data).then((r) => r.data),

  modify: (id: string, data: Record<string, any>) =>
    client.patch(`/reservations/${id}`, data).then((r) => r.data),

  cancel: (id: string, reason: string) =>
    client.delete(`/reservations/${id}`, { data: { reason } }).then((r) => r.data),

  acknowledge: (id: string) =>
    client.patch(`/reservations/${id}/acknowledge`).then((r) => r.data),

  proposeAlternative: (id: string, data: Record<string, any>) =>
    client.patch(`/reservations/${id}/propose-alternative`, data).then((r) => r.data),

  getSlotAllocations: (id: string) =>
    client.get(`/reservations/${id}/slots`).then((r) => r.data),

  complete: (id: string, actual_quantity_m3: number) =>
    client.patch(`/reservations/${id}/complete`, { actual_quantity_m3 }).then((r) => r.data),
};

// src/api/slots.api.ts
export const slotsApi = {
  // Returns [{date, label, slots:[]}] for today + tomorrow
  getBookableDates: (batchingPlant?: string) =>
    client.get('/slots/bookable-dates', { params: batchingPlant ? { batchingPlant } : {} }).then((r) => r.data),

  getAvailable: (date: string, minQuantity?: number) =>
    client.get('/slots/available', { params: { date, minQuantity } }).then((r) => r.data),

  getCalendar: (from: string, to: string) =>
    client.get('/slots/calendar', { params: { from, to } }).then((r) => r.data),

  generateSlots: (fromDate: string, toDate: string) =>
    client.post('/slots/generate', { fromDate, toDate }).then((r) => r.data),
};

// src/api/approvals.api.ts
export const approvalsApi = {
  list: (params?: Record<string, any>) =>
    client.get('/approvals', { params }).then((r) => r.data),

  action: (id: string, action: 'Approved' | 'Rejected', remarks?: string) =>
    client.patch(`/approvals/${id}/action`, { action, remarks }).then((r) => r.data),
};

// src/api/dashboard.api.ts
export const dashboardApi = {
  pm: () => client.get('/dashboards/pm').then((r) => r.data),
  pmhead: () => client.get('/dashboards/pmhead').then((r) => r.data),
  pmmanager: () => client.get('/dashboards/pmmanager').then((r) => r.data),
  vp: () => client.get('/dashboards/vp').then((r) => r.data),
  clusterhead: () => client.get('/dashboards/clusterhead').then((r) => r.data),
};

// src/api/users.api.ts
export const usersApi = {
  list: (params?: Record<string, any>) =>
    client.get('/users', { params }).then((r) => r.data),

  getEngineers: (packageId: string) =>
    client.get('/users/engineers', { params: { packageId } }).then((r) => r.data),

  getContractors: (search?: string) =>
    client.get('/users/contractors', { params: { search } }).then((r) => r.data),

  create: (data: Record<string, any>) =>
    client.post('/users', data).then((r) => r.data),

  update: (id: string, data: Record<string, any>) =>
    client.patch(`/users/${id}`, data).then((r) => r.data),
};

// src/api/notifications.api.ts
export const notificationsApi = {
  list: () => client.get('/notifications').then((r) => r.data),
  markRead: (id: string) => client.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => client.patch('/notifications/read-all').then((r) => r.data),
};

// src/api/packages.api.ts
export const packagesApi = {
  list: () => client.get('/packages').then((r) => r.data),
};

// src/api/reports.api.ts
export const reportsApi = {
  sla: (params: Record<string, any>) =>
    client.get('/reports/sla', { params }).then((r) => r.data),
  utilization: (params: Record<string, any>) =>
    client.get('/reports/utilization', { params }).then((r) => r.data),
  audit: (params: Record<string, any>) =>
    client.get('/reports/audit', { params }).then((r) => r.data),
  packages: (params: Record<string, any>) =>
    client.get('/reports/packages', { params }).then((r) => r.data),
};