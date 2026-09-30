// Custom-domain SPA bootstrap. When Rundesk is served from a workspace's
// verified custom domain (i.e. NOT the primary app host), we look the workspace
// up via the public endpoint and apply its branding before the user signs in.
//
// GET /api/v1/public/workspace-by-domain?host=<host>
//   → { id, name, slug, logoUrl, primaryColor, accentColor, customDomain } | 404
//
// The lookup is best-effort and non-blocking: on the primary host, on a 404, or
// on any transport error we simply behave as the normal app (status: 'none').
import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from './api'
import { brandingRetryDelayMs } from './branding-retry'
import { applyBrandColor, applyAccentColor } from './branding'

export type CustomDomainWorkspace = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string | null
  accentColor: string | null
  customDomain: string | null
}

type CustomDomainState = {
  status: 'idle' | 'checking' | 'resolved' | 'none'
  workspace: CustomDomainWorkspace | null
  set: (partial: Partial<Pick<CustomDomainState, 'status' | 'workspace'>>) => void
}

export const useCustomDomainStore = create<CustomDomainState>((set) => ({
  status: 'idle',
  workspace: null,
  set: (partial) => set(partial),
}))

// The canonical Rundesk host. Anything else is treated as a candidate custom
// domain. Configurable via VITE_PRIMARY_HOST so self-hosters can point it at
// their own canonical host; defaults to the SaaS host.
const PRIMARY_HOST = (import.meta.env.VITE_PRIMARY_HOST as string | undefined)?.trim() || 'app.rundesk.com'

/**
 * True for localhost/loopback and the configured primary host — hosts that are
 * never a custom domain and so must skip the lookup entirely.
 */
export function isPrimaryHost(host: string): boolean {
  if (!host) return true
  const hostname = host.split(':')[0].toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return true
  }
  const primary = PRIMARY_HOST.toLowerCase()
  return host.toLowerCase() === primary || hostname === primary.split(':')[0]
}

// Run-once guard (also protects against React StrictMode's double effect invoke).
let bootstrapped = false

/** Detect a custom domain, fetch its workspace, and apply branding. Idempotent. */
export async function bootstrapCustomDomain(): Promise<void> {
  if (bootstrapped || typeof window === 'undefined') return
  bootstrapped = true

  const host = window.location.host
  if (isPrimaryHost(host)) {
    useCustomDomainStore.getState().set({ status: 'none' })
    return
  }

  useCustomDomainStore.getState().set({ status: 'checking' })
  await lookupBranding(host, 0)
}

async function lookupBranding(host: string, attempt: number): Promise<void> {
  try {
    const ws = await api<CustomDomainWorkspace | null>(
      `/public/workspace-by-domain?host=${encodeURIComponent(host)}`,
      { skipAuth: true },
    )
    if (ws && ws.id) {
      // Same CSS-var mechanism as the workspace settings branding preview.
      applyBrandColor(ws.primaryColor ?? null)
      applyAccentColor(ws.accentColor ?? null)
      useCustomDomainStore.getState().set({ status: 'resolved', workspace: ws })
    } else {
      useCustomDomainStore.getState().set({ status: 'none' })
    }
  } catch (err) {
    // 404 (host isn't a verified custom domain) or any error → normal app,
    // meanwhile; a refusal for too many requests is asked again once.
    useCustomDomainStore.getState().set({ status: 'none' })
    const delay = brandingRetryDelayMs(err, attempt)
    if (delay !== null) setTimeout(() => void lookupBranding(host, attempt + 1), delay)
  }
}

/** Fire the custom-domain lookup once on app mount. Non-blocking. */
export function useCustomDomainBootstrap(): void {
  useEffect(() => {
    void bootstrapCustomDomain()
  }, [])
}
