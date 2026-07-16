import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Progress, RadioGroup, RadioGroupItem, Badge } from '@rundesk/ui'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy, Info } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type ConflictStrategy = 'skip' | 'create' | 'merge'

type Preview = {
  totalRows: number
  sample: Array<{ title: string; status?: string; priority?: string; list?: string }>
  uniqueLists: string[]
  customFields: Array<{ name: string; type: string }>
  duplicates: { count: number; sample: Array<{ title: string; list: string; reason: string }> }
  notImported: { comments: string; attachments: string }
}

type ImportSummary = {
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  tasksUpdated: number
  tasksSkipped: number
  labelsCreated: number
  assigneesLinked: number
  subtasksLinked: number
  customFieldsCreated: number
  customFieldValuesSet: number
  duplicatesDetected: number
  errors: string[]
  notImported: { comments: string; attachments: string }
}

type Job = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total: number
  processed: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  error: string | null
  result: ImportSummary | null
}

export function ImportPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [csv, setCsv] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [projectName, setProjectName] = useState('ClickUp Import')
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const previewMut = useMutation({
    mutationFn: () =>
      api<Preview>(`/workspaces/${workspaceId}/import/clickup/preview`, {
        method: 'POST',
        body: { csv },
      }),
    onSuccess: (data) => setPreview(data),
  })

  const importMut = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(`/workspaces/${workspaceId}/import/clickup`, {
        method: 'POST',
        body: { csv, targetProjectName: projectName, strategy },
      }),
    onSuccess: (data) => setJobId(data.jobId),
  })

  // Poll the server-side import job for real progress until it finishes.
  const jobQuery = useQuery({
    queryKey: ['clickup-import-job', workspaceId, jobId],
    queryFn: () => api<Job>(`/workspaces/${workspaceId}/import/clickup/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as Job | undefined)?.status
      return status === 'completed' || status === 'failed' ? false : 700
    },
  })

  const job = jobQuery.data
  const isRunning = !!jobId && job?.status !== 'completed' && job?.status !== 'failed'
  const result = job?.status === 'completed' ? job.result : null

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(typeof reader.result === 'string' ? reader.result : '')
      setPreview(null)
      setJobId(null)
    }
    reader.readAsText(file)
  }

  function reset() {
    setCsv('')
    setFilename('')
    setPreview(null)
    setJobId(null)
    setStrategy('skip')
  }

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('import.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('import.subtitle')}</p>
      </div>

      {/* Step 1 — upload */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4" />
          {t('import.step1Title')}
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:font-medium hover:file:bg-primary/90"
        />
        {filename && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            {t('import.fileInfo', { name: filename, size: (csv.length / 1024).toFixed(1) })}
          </div>
        )}
        <Button
          onClick={() => previewMut.mutate()}
          disabled={!csv || previewMut.isPending}
          variant="secondary"
        >
          {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('import.preview')}
        </Button>
        {previewMut.isError && <ErrorBox message={(previewMut.error as Error).message} />}
      </Card>

      {/* Step 2 — review + conflicts */}
      {preview && !jobId && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('import.step2Title')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label={t('import.totalRows')} value={preview.totalRows} />
            <Stat label={t('import.listsDetected')} value={preview.uniqueLists.length} />
            <Stat label={t('import.customFields')} value={preview.customFields.length} />
            <Stat label={t('import.duplicatesLabel')} value={preview.duplicates.count} />
          </div>

          {/* Detected custom fields */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t('import.customFieldsDetected')}
            </div>
            {preview.customFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('import.customFieldsNone')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {preview.customFields.map((f) => (
                  <Badge key={f.name} variant="secondary" className="gap-1.5">
                    {f.name}
                    <span className="text-[10px] uppercase opacity-70">{f.type}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {preview.uniqueLists.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {t('import.listsToCreate')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {preview.uniqueLists.map((l) => (
                  <span key={l} className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Conflict resolution — only when duplicates were detected */}
          {preview.duplicates.count > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Copy className="h-4 w-4 text-amber-600" />
                {t('import.conflictTitle')}
              </div>
              <p className="text-sm text-muted-foreground">
                {tCount('import.conflictHelp', preview.duplicates.count)}
              </p>
              <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as ConflictStrategy)}>
                <StrategyOption
                  value="skip"
                  label={t('import.strategySkip')}
                  help={t('import.strategySkipHelp')}
                />
                <StrategyOption
                  value="create"
                  label={t('import.strategyCreate')}
                  help={t('import.strategyCreateHelp')}
                />
                <StrategyOption
                  value="merge"
                  label={t('import.strategyMerge')}
                  help={t('import.strategyMergeHelp')}
                />
              </RadioGroup>
              {preview.duplicates.sample.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preview.duplicates.sample.map((d, i) => (
                    <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {d.list} · {d.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <label className="text-sm font-medium">{t('import.projectName')}</label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="ClickUp Import" />
          </div>

          <NotIncludedNote note={t('import.notIncludedNote')} title={t('import.notIncludedTitle')} />

          <Button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
            className="w-full"
          >
            {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {tCount('import.startImport', preview.totalRows)}
          </Button>
          {importMut.isError && <ErrorBox message={(importMut.error as Error).message} />}
        </Card>
      )}

      {/* Step 3 — live progress */}
      {jobId && job && job.status !== 'completed' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            {job.status === 'failed' ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {job.status === 'failed' ? t('import.importFailed') : t('import.progressTitle')}
          </div>
          {job.status === 'failed' ? (
            <ErrorBox message={job.error ?? t('import.importFailed')} />
          ) : (
            <>
              <Progress value={job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0} />
              <div className="text-sm text-muted-foreground">
                {t('import.progressCount', { processed: job.processed, total: job.total })}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat label={t('import.created')} value={job.createdCount} />
                <Stat label={t('import.updated')} value={job.updatedCount} />
                <Stat label={t('import.skipped')} value={job.skippedCount} />
              </div>
            </>
          )}
        </Card>
      )}

      {/* Step 4 — final report */}
      {result && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            <Stat label={t('import.spaces')} value={result.spacesCreated} />
            <Stat label={t('import.projects')} value={result.projectsCreated} />
            <Stat label={t('import.lists')} value={result.listsCreated} />
            <Stat label={t('import.tasks')} value={result.tasksCreated} />
            <Stat label={t('import.updated')} value={result.tasksUpdated} />
            <Stat label={t('import.skipped')} value={result.tasksSkipped} />
            <Stat label={t('import.customFields')} value={result.customFieldsCreated} />
            <Stat label={t('import.customValues')} value={result.customFieldValuesSet} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={t('import.labels')} value={result.labelsCreated} />
            <Stat label={t('import.assignees')} value={result.assigneesLinked} />
            <Stat label={t('import.subtasks')} value={result.subtasksLinked} />
          </div>

          <NotIncludedNote note={t('import.notIncludedNote')} title={t('import.notIncludedTitle')} />

          {result.errors.length > 0 && (
            <details className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <summary className="font-medium cursor-pointer">
                {tCount('import.rowsSkipped', result.errors.length)}
              </summary>
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>
              {t('import.importAnother')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

function StrategyOption({ value, label, help }: { value: string; label: string; help: string }) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer hover:bg-muted/40">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  )
}

function NotIncludedNote({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        <span className="font-medium text-foreground">{title}. </span>
        {note}
      </span>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}
