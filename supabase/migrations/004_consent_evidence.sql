-- Migration 004: CASL consent evidence detail column
alter table consent_events add column if not exists evidence text;
