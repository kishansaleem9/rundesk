import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Preview = {
  totalRows: number
  sample: Array<{
    title: string
    status?: string
    priority?: string
    list?: string
  }>
  uniqueLists: string[]
}

type ImportResult = {
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  errors: string[]
}

export function ImportPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [csv, setCsv] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [projectName, setProjectName] = useState('ClickUp Import')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

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
      api<ImportResult>(`/workspaces/${workspaceId}/import/clickup`, {
        method: 'POST',
        body: { csv, targetProjectName: projectName },
      }),
    onSuccess: (data) => setResult(data),
  })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(typeof reader.result === 'string' ? reader.result : '')
      setPreview(null)
      setResult(null)
    }
    reader.readAsText(file)
  }

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('import.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('import.subtitle')}
        </p>
      </div>

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
          {previewMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {t('import.preview')}
        </Button>
        {previewMut.isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span>{(previewMut.error as Error).message}</span>
          </div>
        )}
      </Card>

      {preview && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('import.step2Title')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={t('import.totalRows')} value={preview.totalRows} />
            <Stat label={t('import.listsDetected')} value={preview.uniqueLists.length} />
            <Stat label={t('import.sampleShown')} value={preview.sample.length} />
          </div>
          {preview.uniqueLists.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {t('import.listsToCreate')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {preview.uniqueLists.map((l) => (
                  <span
                    key={l}
                    className="rounded-md bg-muted px-2 py-1 text-xs font-medium"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t('import.sampleTasks')}
            </div>
            <div className="rounded-md border divide-y">
              {preview.sample.map((s, i) => (
                <div key={i} className="px-3 py-2 text-sm flex items-center gap-3">
                  <span className="font-medium flex-1 truncate">{s.title}</span>
                  {s.status && (
                    <span className="text-xs text-muted-foreground">{s.status}</span>
                  )}
                  {s.priority && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{s.priority}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-sm font-medium">{t('import.projectName')}</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="ClickUp Import"
            />
          </div>

          <Button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending || result !== null}
            className="w-full"
          >
            {importMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {tCount('import.importing', preview.totalRows)}
              </>
            ) : (
              tCount('import.startImport', preview.totalRows)
            )}
          </Button>
          {importMut.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span>{(importMut.error as Error).message}</span>
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Stat label={t('import.spaces')} value={result.spacesCreated} />
            <Stat label={t('import.projects')} value={result.projectsCreated} />
            <Stat label={t('import.lists')} value={result.listsCreated} />
            <Stat label={t('import.tasks')} value={result.tasksCreated} />
          </div>
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
            <Button
              variant="secondary"
              onClick={() => {
                setCsv('')
                setFilename('')
                setPreview(null)
                setResult(null)
              }}
            >
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
