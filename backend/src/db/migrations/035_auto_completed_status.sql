-- 035_auto_completed_status.sql
-- Add 'Auto-completed' reservation status for system-driven completion
ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'Auto-completed';
