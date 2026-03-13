# Concrete Reservation System

A capacity-aware concrete reservation system for managing concrete delivery across 13 project packages.

## Project Structure

```
concrete-reservation/
├── backend/               # Node.js + Express API
│   ├── src/
│   │   ├── config/        # DB, env, app config
│   │   ├── controllers/   # Route handlers
│   │   ├── middleware/    # Auth, validation, error handling
│   │   ├── models/        # DB query models (pg)
│   │   ├── routes/        # Express routers
│   │   ├── services/      # Business logic (capacity engine, notifications)
│   │   ├── utils/         # Helpers
│   │   ├── jobs/          # Scheduled jobs (SLA alerts, escalations)
│   │   └── db/
│   │       ├── migrations/ # SQL migration files
│   │       └── seeds/      # Seed data
│   └── tests/
├── frontend/              # React + Vite
│   └── src/
│       ├── api/           # Axios API clients
│       ├── components/    # Reusable UI components
│       ├── pages/         # Route-level page components
│       ├── hooks/         # Custom React hooks
│       ├── context/       # Auth, notification context
│       ├── utils/         # Helpers
│       └── types/         # TypeScript interfaces
└── docker-compose.yml     # Local dev stack
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### 1. Clone & Install

```bash
git clone <repo>
cd concrete-reservation

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your DB credentials and JWT secret

# Frontend
cp frontend/.env.example frontend/.env
```

### 3. Setup Database

```bash
cd backend
npm run db:migrate    # Run all migrations
npm run db:seed       # Seed admin user + master data
```

### 4. Run Dev Servers

```bash
# Terminal 1 - Backend (port 4000)
cd backend && npm run dev

# Terminal 2 - Frontend (port 5173)
cd frontend && npm run dev
```

### 5. Docker (Alternative)

```bash
docker-compose up
```

## Default Login Credentials (after seed)

| Role          | Email                    | Password     |
|---------------|--------------------------|--------------|
| Admin         | admin@concrete.com       | Admin@123    |
| P&M Head      | pm_head@concrete.com     | PMHead@123   |
| VP            | vp@concrete.com          | VP@123       |
| Cluster Head  | ch1@concrete.com         | CH@123       |
| Project Mgr   | pm1@concrete.com         | PM@123       |

## API Documentation

Backend runs at `http://localhost:4000`

Key endpoint groups:
- `POST /api/auth/login` — Authentication
- `GET/POST /api/reservations` — Reservation CRUD
- `GET /api/slots/available` — Capacity-aware slot availability
- `POST /api/reservations/:id/acknowledge` — P&M acknowledgment
- `POST /api/approvals/:id/action` — VP/Cluster Head approvals
- `GET /api/dashboards/:role` — Role-based dashboard data
- `GET /api/reports/*` — Analytics & exports

## Tech Stack

- **Frontend:** React 18, Vite, TailwindCSS, React Query, React Router v6
- **Backend:** Node.js 20, Express 4, PostgreSQL 15, node-postgres (pg)
- **Auth:** JWT (access + refresh tokens)
- **Notifications:** Nodemailer (email) + SSE (in-app)
- **Jobs:** node-cron (SLA escalation, slot generation)
