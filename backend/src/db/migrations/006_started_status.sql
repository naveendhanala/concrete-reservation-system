-- 006_started_status.sql
-- Add 'Started' stage between Acknowledged and Completed
ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'Started';
