-- Migration 006: Add PR merge tracking columns
ALTER TABLE pull_requests 
  ADD COLUMN merged BOOLEAN DEFAULT false,
  ADD COLUMN merged_at TIMESTAMPTZ;
