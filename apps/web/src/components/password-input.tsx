import { forwardRef, useState } from 'react'
import { Input, type InputProps } from '@rundesk/ui'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

/**
 * A password field with a built-in show/hide (reveal) toggle. Wraps the shared
 * Input and swaps the `type` between "password" and "text" when the eye button
 * is pressed. The toggle is skipped in the tab order (tabIndex=-1) so keyboard
 * users still flow straight from the field to the submit button, and it never
 * submits the surrounding form (type="button").
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'trailingIcon'>>(
  function PasswordInput(props, ref) {
    const { t } = useTranslation()
    const [show, setShow] = useState(false)
    return (
      <Input
        {...props}
        ref={ref}
        type={show ? 'text' : 'password'}
        trailingIcon={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={show}
            className="pointer-events-auto -m-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
    )
  },
)
