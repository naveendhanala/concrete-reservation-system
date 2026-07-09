# Delete Contractor (Admin only) — Design

**Date:** 2026-07-09
**Status:** Approved

## Problem

Admins can add and edit contractors on the Contractors page, and toggle them
Active/Inactive, but there is no way to remove a contractor that was added by
mistake (typos, duplicates). These rows clutter the Contractor Master list
forever.

## Decision

Add a hard delete for contractors, restricted to the Admin role, that is
**blocked when the contractor is referenced by any reservation**. For
contractors with reservation history, the existing Inactive flag remains the
correct tool — deleting them would corrupt historical reports.

Daily-log entries (`contractor_daily_log`) cascade-delete with the contractor
per the existing schema. These are transient per-day availability records,
not reservation history, so this is acceptable and requires no schema change.

## Backend

New route in `backend/src/routes/user.routes.js`:

- `DELETE /users/contractors/:id`, guarded by `requireRole('Admin')`.
  (Create/update allow Admin + LabourMob; delete is deliberately Admin-only.)
- Count reservations referencing the contractor. If > 0, respond `409` with
  a message like: `Contractor is used in N reservation(s). Mark them Inactive
  instead.`
- Otherwise delete the row and return the deleted `contractor_id`.
  `404` if the contractor does not exist.

No database migration needed.

## Frontend

`frontend/src/api/index.ts`:

- `deleteContractor: (id) => client.delete('/users/contractors/' + id)`.

`frontend/src/pages/ContractorsPage.tsx`:

- Red trash icon next to the edit pencil in each row, rendered **only for
  Admin users** (via the existing auth/user context).
- Clicking asks for confirmation ("Delete contractor <name>? This cannot be
  undone.") before calling the API.
- On success: invalidate the `contractors` query.
- On error: show the server's error message as a toast (the 409 message tells
  the admin to use Inactive instead).

## Testing

Exercise end-to-end against the running app/API:

1. Delete a contractor with no reservations → row removed from list.
2. Attempt to delete a contractor referenced by reservations → blocked with
   the 409 message shown as a toast.
3. Non-admin user → no trash icon shown; direct API call rejected by
   `requireRole`.
