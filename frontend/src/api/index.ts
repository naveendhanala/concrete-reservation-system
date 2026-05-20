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

  start: (id: string) =>
    client.patch(`/reservations/${id}/start`).then((r) => r.data),

  complete: (id: string) =>
    client.patch(`/reservations/${id}/complete`).then((r) => r.data),

  addDelivery: (id: string, quantity_m3: number, tm_no: string, driver_no: string, batching_plant: string) =>
    client.post(`/reservations/${id}/deliveries`, { quantity_m3, tm_no, driver_no, batching_plant }).then((r) => r.data),

  editDelivery: (id: string, deliveryId: string, quantity_m3: number, tm_no: string, driver_no: string, batching_plant: string) =>
    client.patch(`/reservations/${id}/deliveries/${deliveryId}`, { quantity_m3, tm_no, driver_no, batching_plant }).then((r) => r.data),
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

  getById: (id: string) =>
    client.get(`/users/${id}`).then((r) => r.data),

  getMyPackages: () =>
    client.get('/users/my-packages').then((r) => r.data),

  getPlants: () =>
    client.get('/users/meta/plants').then((r) => r.data),

  getEngineers: (packageId: string) =>
    client.get('/users/engineers', { params: { packageId } }).then((r) => r.data),

  createEngineer: (data: Record<string, any>) =>
    client.post('/users/engineers', data).then((r) => r.data),

  updateEngineer: (id: string, data: Record<string, any>) =>
    client.patch(`/users/engineers/${id}`, data).then((r) => r.data),

  deleteEngineer: (id: string) =>
    client.delete(`/users/engineers/${id}`).then((r) => r.data),

  getContractors: (search?: string, all?: boolean) =>
    client.get('/users/contractors', { params: { search, all } }).then((r) => r.data),

  createContractor: (data: Record<string, any>) =>
    client.post('/users/contractors', data).then((r) => r.data),

  updateContractor: (id: string, data: Record<string, any>) =>
    client.patch(`/users/contractors/${id}`, data).then((r) => r.data),

  getDailyLog: (date?: string) =>
    client.get('/users/contractors/daily-log', { params: { date } }).then((r) => r.data),

  createDailyLogEntry: (data: {
    contractor_id: string;
    package_id: string;
    type_of_work: string;
    available_count: number;
    additional_expected?: number | null;
    expected_date?: string | null;
  }) => client.post('/users/contractors/daily-log', data).then((r) => r.data),

  updateDailyLogEntry: (
    logId: string,
    data: {
      available_count?: number;
      additional_expected?: number | null;
      expected_date?: string | null;
    }
  ) => client.patch(`/users/contractors/daily-log/${logId}`, data).then((r) => r.data),

  deleteDailyLogEntry: (logId: string) =>
    client.delete(`/users/contractors/daily-log/${logId}`).then((r) => r.data),

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
  getFreebieStatus: () => client.get('/packages/freebie-status').then((r) => r.data),
};

// src/api/machinery.api.ts
export const machineryApi = {
  list: () => client.get('/machinery').then((r) => r.data),

  create: (data: { description: string; make_model?: string; reg_no?: string; last_month_availability?: number | string; last_month_utilization?: number | string }) =>
    client.post('/machinery', data).then((r) => r.data),

  update: (id: string, data: { description?: string; make_model?: string; reg_no?: string; last_month_availability?: number | string; last_month_utilization?: number | string; assigned_to?: string }) =>
    client.patch(`/machinery/${id}`, data).then((r) => r.data),

  upload: (records: any[]) =>
    client.post('/machinery/upload', { records }).then((r) => r.data),

  remove: (id: string) =>
    client.delete(`/machinery/${id}`).then((r) => r.data),

  raiseIssue: (id: string, remarks: string) =>
    client.post(`/machinery/${id}/issues`, { remarks }).then((r) => r.data),

  listIssues: () =>
    client.get('/machinery/issues').then((r) => r.data),

  resolveIssue: (issueId: string, resolution_remarks: string) =>
    client.patch(`/machinery/issues/${issueId}/resolve`, { resolution_remarks }).then((r) => r.data),

  listRequests: () =>
    client.get('/machinery/requests').then((r) => r.data),

  createRequest: (data: { machinery_name: string; machinery_type?: string; remarks?: string }) =>
    client.post('/machinery/requests', data).then((r) => r.data),

  completeRequest: (requestId: string) =>
    client.patch(`/machinery/requests/${requestId}/complete`).then((r) => r.data),
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
  daily: (date: string) =>
    client.get('/reports/daily', { params: { date } }).then((r) => r.data),
  deliveries: (params: Record<string, any>) =>
    client.get('/reports/deliveries', { params }).then((r) => r.data),
  labourMobilization: (date?: string) =>
    client.get('/reports/labour-mobilization', { params: date ? { date } : {} }).then((r) => r.data),
  sameDayTrends: (params: Record<string, any>) =>
    client.get('/reports/same-day-trends', { params }).then((r) => r.data),
};

// src/api/delivery-logs.api.ts
export const deliveryLogsApi = {
  list: (params?: { date?: string; packageId?: string; page?: number; limit?: number }) =>
    client.get('/delivery-logs', { params }).then((r) => r.data),
};
