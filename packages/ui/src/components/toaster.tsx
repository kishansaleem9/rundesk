import { Toaster as SonnerToaster, toast } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-glow group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
    />
  )
}

export { toast }
