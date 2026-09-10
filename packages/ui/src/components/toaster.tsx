import { Toaster as SonnerToaster, toast } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      /*
       * §V2-S11 frames `00:35` and `08:50` — bottom-LEFT.
       *
       * Both frames that show a toast show it there: "Created field progress",
       * and two "List name taken" errors stacked. It also keeps them clear of
       * the privacy banner, which sits bottom-right and has swallowed clicks
       * meant for things behind it in three suites.
       */
      position="bottom-left"
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
