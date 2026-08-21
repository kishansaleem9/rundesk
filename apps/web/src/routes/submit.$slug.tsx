import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { CheckCircle2, AlertCircle, Loader2, Upload, FileText, X } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'

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
  visibilityMode?: 'all' | 'any'
  visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
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
  submissionId: string | null
  confirmationMsg?: string | null
}

function PublicFormPage() {
  const { t } = useTranslation()
  const { slug } = Route.useParams()
  const [formData, setFormData] = useState<Record<string, string | string[]>>({})
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [submitterName, setSubmitterName] = useState('')
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // A5.5 honeypot — off-screen and unlabelled, so only a form-filling bot ever
  // populates it. The server drops those submissions silently.
  const [hp, setHp] = useState('')

  const formQuery = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => api<PublicForm>(`/forms/${slug}`, { skipAuth: true }),
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: (body: { data: typeof formData; submitterEmail: string; submitterName: string; hp: string }) =>
      api<SubmitResult>(`/forms/${slug}/submit`, {
        method: 'POST',
        body,
        skipAuth: true,
      }),
    onSuccess: (result) => setSubmitted(result),
  })

  const isFieldVisible = (field: FormField): boolean => {
    const rules = field.visibilityRules ?? []
    if (rules.length === 0) return true
    const mode = field.visibilityMode ?? 'all'
    const matcher = mode === 'any' ? 'some' : 'every'
    return rules[matcher]((rule) => {
      const source = formData[rule.fieldId]
      const sourceText = Array.isArray(source) ? source.join(',') : source ?? ''
      const sourceArr = Array.isArray(source) ? source : typeof source === 'string' && source ? source.split(',') : []
      if (rule.operator === 'equals') return sourceText === rule.value
      if (rule.operator === 'not_equals') return sourceText !== rule.value
      if (rule.operator === 'contains') return sourceArr.includes(rule.value) || sourceText.includes(rule.value)
      return !sourceArr.includes(rule.value) && !sourceText.includes(rule.value)
    })
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    for (const field of formQuery.data?.fields ?? []) {
      if (!isFieldVisible(field)) continue
      const val = formData[field.id]
      if (field.isRequired && (!val || (Array.isArray(val) ? val.length === 0 : val.trim() === ''))) {
        errs[field.id] = t('submitForm.requiredField')
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    submitMutation.mutate({ data: formData, submitterEmail, submitterName, hp })
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
          <h2 className="text-lg font-semibold">{t('submitForm.notFoundTitle')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('submitForm.notFoundBody')}
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
          <h2 className="text-xl font-semibold mb-2">{t('submitForm.successTitle')}</h2>
          <p className="text-muted-foreground">
            {submitted.confirmationMsg ?? t('submitForm.successBody')}
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
          {/* A5.5 honeypot: hidden from people and from assistive tech, but
              present in the DOM for a bot that fills every input it finds. */}
          <input
            type="text"
            name="website"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute h-0 w-0 opacity-0 pointer-events-none -z-10"
          />
          <Card className="p-6 space-y-5">
            {/* Submitter info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">{t('submitForm.yourName')}</label>
                <Input
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  placeholder={t('submitForm.namePlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">{t('submitForm.yourEmail')}</label>
                <Input
                  type="email"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  placeholder={t('submitForm.emailPlaceholder')}
                />
              </div>
            </div>

            {form.fields.length > 0 && <hr className="border-border" />}

            {/* Dynamic fields */}
            {form.fields.filter(isFieldVisible).map((field) => (
              <FormFieldRenderer
                key={field.id}
                field={field}
                slug={slug}
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
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('submitForm.submitting')}</>
              ) : t('submitForm.submit')}
            </Button>

            {submitMutation.isError && (
              <p className="text-sm text-destructive text-center" role="alert">
                {submitMutation.error instanceof ApiError
                  ? submitMutation.error.message
                  : t('submitForm.submitError')}
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
  slug,
  value,
  error,
  onChange,
}: {
  field: FormField
  slug: string
  value: string | string[] | undefined
  error?: string
  onChange: (val: string | string[]) => void
}) {
  const { t } = useTranslation()
  const strValue = typeof value === 'string' ? value : ''
  const arrValue = Array.isArray(value) ? value : []
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Presign → PUT → store the object key as this field's value (public intake).
  const handleFileUpload = async (file: File) => {
    setUploadError(null)
    setUploading(true)
    try {
      const contentType = file.type || 'application/octet-stream'
      const presign = await api<{ uploadUrl: string; storageKey: string; fileName: string }>(
        `/forms/${slug}/attachments/presign`,
        { method: 'POST', skipAuth: true, body: { fileName: file.name, contentType, sizeBytes: file.size } },
      )
      const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
      setUploadName(file.name)
      onChange(presign.storageKey)
    } catch (err) {
      onChange('')
      setUploadName(null)
      setUploadError(err instanceof ApiError ? err.message : t('submitForm.uploadError'))
    } finally {
      setUploading(false)
    }
  }

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
          placeholder={field.placeholder ?? t('submitForm.emailFieldPlaceholder')}
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
          <option value="">{t('submitForm.selectOption')}</option>
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
        <div className="space-y-2">
          {strValue ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{uploadName ?? t('submitForm.uploadedFile')}</span>
              <button
                type="button"
                title={t('submitForm.removeFile')}
                onClick={() => { onChange(''); setUploadName(null) }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 text-sm cursor-pointer transition-colors ${
                error ? 'border-destructive' : 'border-border hover:border-foreground/30'
              } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> <InlineSkeleton /></>
              ) : (
                <><Upload className="h-4 w-4" /> {t('submitForm.chooseFile')} <span className="text-muted-foreground">{t('submitForm.maxFileSize')}</span></>
              )}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void handleFileUpload(f)
                }}
              />
            </label>
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}

      {field.helpText && (
        <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
