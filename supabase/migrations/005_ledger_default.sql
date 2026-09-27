-- Migration 005: default amount_cents to 0 (reward events carry no spend)
alter table ledger_events alter column amount_cents set default 0;
