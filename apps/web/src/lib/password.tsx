import { Check, X } from 'lucide-react'

// Mirrors the server's strong-password policy (`passwordStrengthProblem` in
// apps/api/src/modules/security/workspace-security-settings.service.ts).
// Keep these rules — order, wording and tests — in sync with the server so the
// requirements are surfaced inline instead of failing only on submit.
export const PASSWORD_RULES: Array<{ label: string; hint: string; test: (v: string) => boolean }> = [
  { label: 'At least 10 characters', hint: 'at least 10 characters', test: (v) => v.length >= 10 },
  { label: 'A lowercase letter', hint: 'a lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'An uppercase letter', hint: 'an uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', hint: 'a number', test: (v) => /[0-9]/.test(v) },
  { label: 'A symbol', hint: 'a symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

/** True when the password satisfies every rule. */
export function isPasswordStrong(value: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(value))
}

/** A server-matching error message, or null when the password is strong. */
export function passwordPolicyError(value: string): string | null {
  if (!value) return 'Password is required.'
  const missing = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.hint)
  return missing.length ? `Password must contain ${missing.join(', ')}.` : null
}

/** Live, per-rule password requirements shown under a password field. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-1 gap-y-1 pt-0.5 sm:grid-cols-2 sm:gap-x-3">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <li
            key={rule.hint}
            className={
              'flex items-center gap-1.5 text-xs transition-colors ' +
              (ok ? 'text-emerald-500' : 'text-muted-foreground')
            }
          >
            {ok ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <X className="h-3 w-3 shrink-0 opacity-40" />
            )}
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
