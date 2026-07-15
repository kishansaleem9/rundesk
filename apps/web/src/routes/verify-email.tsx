import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { LogoWordmark, Button } from '@rundesk/ui'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const run = async () => {
      const token = new URLSearchParams(window.location.search).get('token') ?? ''
      if (!token) {
        setStatus('error')
        setMessage(t('verifyEmail.missingToken'))
        return
      }
      try {
        await api('/auth/verify-email', { method: 'POST', body: { token }, skipAuth: true })
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setMessage(
          err instanceof ApiError
            ? err.message
            : t('verifyEmail.failedFallback'),
        )
      }
    }
    void run()
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="bg-aurora pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md text-center">
        <LogoWordmark gradient />
        {status === 'verifying' && (
          <>
            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
            <h1 className="font-display text-2xl font-semibold">{t('verifyEmail.verifying')}</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h1 className="font-display text-2xl font-semibold">{t('verifyEmail.successTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('verifyEmail.successBody')}
            </p>
            <Button variant="gradient" asChild>
              <Link to="/login">{t('verifyEmail.continueToSignIn')}</Link>
            </Button>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <h1 className="font-display text-2xl font-semibold">{t('verifyEmail.failedTitle')}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="glass" asChild>
              <Link to="/login">{t('verifyEmail.backToSignIn')}</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
