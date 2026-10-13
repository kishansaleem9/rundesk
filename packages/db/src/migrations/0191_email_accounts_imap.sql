-- A MAILBOX LINKED OVER IMAP AND SMTP, AS CLICKUP'S "SIGN IN WITH IMAP" (`found-12-oct/task-email-imap-unbuilt`).
--
--   · `provider` takes `imap` beside `gmail` and `outlook`.
--   · Its servers as its linker typed them, and whether they require SSL.
--   · `password_sealed`: its password, sealed with AES-256-GCM under TOKEN_ENCRYPTION_KEY
--     (`common/security/secret-box.ts`) — never kept in the clear.
ALTER TABLE "email_accounts" DROP CONSTRAINT IF EXISTS "email_accounts_provider_check";
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_provider_check" CHECK ("provider" IN ('gmail', 'outlook', 'imap'));
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "imap_host" text;
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "imap_port" integer;
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "smtp_host" text;
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "smtp_port" integer;
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "use_ssl" boolean;
ALTER TABLE "email_accounts" ADD COLUMN IF NOT EXISTS "password_sealed" text;
ALTER TABLE "email_accounts" DROP CONSTRAINT IF EXISTS "email_accounts_imap_check";
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_imap_check" CHECK (
	"provider" <> 'imap' OR (
		"imap_host" IS NOT NULL AND "imap_port" BETWEEN 1 AND 65535
		AND "smtp_host" IS NOT NULL AND "smtp_port" BETWEEN 1 AND 65535
		AND "use_ssl" IS NOT NULL AND "password_sealed" IS NOT NULL
	)
);
