-- §7.12 Smart Workload Balancing — proactive manager alert.
-- Adds the 'workload_alert' notification type. The daily WorkloadAlertService
-- cron flags significantly overloaded teammates and notifies workspace
-- managers/admins with a notification of this type (deep-linking to insights).
-- Additive + idempotent — safe to re-run. ADD VALUE IF NOT EXISTS is safe and
-- the new value is not used within this migration.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'workload_alert';
