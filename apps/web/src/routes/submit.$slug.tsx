import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/submit/$slug')({
  component: PublicFormPage,
})

type FormField = {
  id: string
  type: string
  label: string
  placeholder?: string | null
  helpText?: string | null
  isRequired: boolean
  options?: { label: string; value: string }[] | null
}

type PublicForm = {
  id: string
  title: string
  description?: string | null
  isPublic: boolean
  fields: FormField[]
}

type SubmitResult = {
  ok: boolean
  submissionId: string
  confirmationMsg?: string | null
}

function PublicFormPage() {
  const { slug } = Route.useParams()
  const [formData, setFormData] = useState<Record<string, string | string[]>>({})
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [submitterName, setSubmitterName] = useState('')
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const formQuery = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => api<PublicForm>(`/forms/${slug}`, { skipAuth: true }),
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: (body: { data: typeof formData; submitterEmail: string; submitterName: string }) =>
      api<SubmitResult>(`/forms/${slug}/submit`, {
        method: 'POST',
        body,
        skipAuth: true,
      }),
    onSuccess: (result) => setSubmitted(result),
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    for (const field of formQuery.data?.fields ?? []) {
      const val = formData[field.id]
      if (field.isRequired && (!val || (Array.isArray(val) ? val.length === 0 : val.trim() === ''))) {
        errs[field.id] = 'This field is required'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    submitMutation.mutate({ data: formData, submitterEmail, submitterName })
  }

  function setFieldValue(fieldId: string, value: string | string[]) {
    setFormData((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => { const next = { ...prev }; delete next[fieldId]; return next })
  }

  if (formQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (formQuery.isError) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold">Form not found</h2>
          <p className="text-muted-foreground text-sm mt-1">
            This form doesn&apos;t exist or has been disabled.
          </p>
        </div>
      </div>
    )
  }

  const form = formQuery.data!

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Submitted!</h2>
          <p className="text-muted-foreground">
            {submitted.confirmationMsg ?? 'Thank you! Your request has been submitted.'}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-brand-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold">R</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">Rundesk</span>
          </div>
          <h1 className="text-2xl font-bold">{form.title}</h1>
          {form.description && (
            <p className="text-muted-foreground mt-1">{form.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="p-6 space-y-5">
            {/* Submitter info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Your name</label>
                <Input
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Your email</label>
                <Input
                  type="email"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            {form.fields.length > 0 && <hr className="border-border" />}

            {/* Dynamic fields */}
            {form.fields.map((field) => (
              <FormFieldRenderer
                key={field.id}
                field={field}
                value={formData[field.id]}
                error={errors[field.id]}
                onChange={(val) => setFieldValue(field.id, val)}
              />
            ))}

            <Button
              type="submit"
              className="w-full"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</>
              ) : 'Submit'}
            </Button>

            {submitMutation.isError && (
              <p className="text-sm text-destructive text-center">
                Submission failed. Please try again.
              </p>
            )}
          </Card>
        </form>
      </div>
    </div>
  )
}

function FormFieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: string | string[] | undefined
  error?: string
  onChange: (val: string | string[]) => void
}) {
  const strValue = typeof value === 'string' ? value : ''
  const arrValue = Array.isArray(value) ? value : []

  return (
    <div>
      <label className="text-sm font-medium block mb-1">
        {field.label}
        {field.isRequired && <span className="text-destructive ml-1">*</span>}
      </label>

      {field.type === 'short_text' && (
        <Input
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          className={error ? 'border-destructive' : ''}
        />
      )}

      {field.type === 'long_text' && (
        <textarea
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          rows={4}
          className={`w-full rounded-md border px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring ${
            error ? 'border-destructive' : 'border-border'
          }`}
        />
      )}

      {field.type === 'email' && (
        <Input
          type="email"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? 'email@example.com'}
          className={error ? 'border-destructive' : ''}
        />
      )}

      {field.type === 'number' && (
        <Input
          type="number"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          className={error ? 'border-destructive' : ''}
        />
      )}

      {field.type === 'date' && (
        <Input
          type="date"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={error ? 'border-destructive' : ''}
        />
      )}

      {field.type === 'dropdown' && (
        <select
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
            error ? 'border-destructive' : 'border-border'
          }`}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.type === 'multi_select' && (
        <div className="space-y-1">
          {(field.options ?? []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={arrValue.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...arrValue, opt.value])
                  } else {
                    onChange(arrValue.filter((v) => v !== opt.value))
                  }
                }}
                className="rounded"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {field.type === 'file' && (
        <div className="border-2 border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
          File upload not available in preview
        </div>
      )}

      {field.helpText && (
        <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
