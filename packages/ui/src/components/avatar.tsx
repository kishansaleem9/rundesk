import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '../lib/cn'

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full',
      className,
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

/** Helper: pick a stable gradient hue from a string seed. */
export function avatarHue(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i)
    h |= 0
  }
  const hue = Math.abs(h) % 360
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 75% 60%))`
}

/** Quick preset combining avatar + auto-gradient + initials */
export function PersonAvatar({
  name,
  imageUrl,
  className,
  size = 'md',
}: {
  name: string
  imageUrl?: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')

  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
    xl: 'h-16 w-16 text-base',
  }

  return (
    <Avatar className={cn(sizes[size], className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={name} />}
      <AvatarFallback style={{ background: avatarHue(name) }}>
        {initials || '?'}
      </AvatarFallback>
    </Avatar>
  )
}
