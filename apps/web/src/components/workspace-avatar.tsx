import { cn } from '@rundesk/ui'

/*
 * A WORKSPACE'S AVATAR: its uploaded picture, or its initial on its colour
 * (QA WS-008: "Remove logo — falls back to initials avatar in the chosen
 * colour"). The colour is the workspace's own (`primaryColor`, which the
 * creation flow asks for); without one, the app's brand gradient.
 */
export function WorkspaceAvatar({
  name,
  logoUrl,
  color,
  size = 'md',
  className,
}: {
  name: string
  logoUrl?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const box = size === 'lg' ? 'h-12 w-12 text-lg' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
  if (logoUrl) {
    return <img src={logoUrl} alt="" className={cn(box, 'shrink-0 rounded-md border border-border object-cover', className)} />
  }
  const shown = /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : null
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <div
      aria-hidden="true"
      className={cn(box, 'flex shrink-0 items-center justify-center rounded-md font-semibold text-white', !shown && 'bg-brand-gradient-soft', className)}
      style={shown ? { background: shown } : undefined}
    >
      {initial}
    </div>
  )
}
