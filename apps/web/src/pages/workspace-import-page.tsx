import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Progress, RadioGroup, RadioGroupItem, Badge, Skeleton } from '@rundesk/ui'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy, Info, KeyRound, Table2, Ban, BookOpen, MessagesSquare, Tent } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { usePermissions } from '../hooks/use-permissions'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import {
  SHEET_FIELDS,
  fetchSheetJob,
  fetchSheetJobs,
  fetchSheetSources,
  previewSheet,
  startSheetImport,
  uploadImportFile,
  type ColumnMapping,
  type SheetField,
  type SheetJob,
  type SheetPreview,
} from '../lib/imports-api'
import { createPickTurns, sheetFileKind } from '../lib/sheet-file'
import { BasecampImportPanel, ConfluenceImportPanel, SlackImportPanel } from './import-panels'

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
  // §12.5 — populated only when a ClickUp API token was supplied (comments +
  // attachments are pulled via the ClickUp API, which a CSV export can't carry).
  commentsImported?: number
  attachmentsImported?: number
  attachmentsSkipped?: number
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

type ImportTab = 'clickup' | 'sheet' | 'doc' | 'confluence' | 'basecamp' | 'slack'
const IMPORT_TABS: ImportTab[] = ['sheet', 'doc', 'confluence', 'basecamp', 'slack', 'clickup']

/**
 * §V2-S13 frame `12:08` — Create › **Imports** ›.
 *
 * The frame's submenu has twelve rows: Spreadsheet files, Document files, and
 * ten named tools. Rundesk had one importer (ClickUp CSV). Drawing ten tiles
 * that open a dialog which cannot import would be the facade defect at ten
 * times scale, so this page grows exactly one new thing — a real delimited-file
 * importer with an explicit column mapping — and the named tools appear only as
 * column PRESETS over that one importer, which is something the parser can
 * actually honour.
 *
 * The four rows with no preset are listed as text with the reason and no
 * control at all. See `import-unsupported` below.
 */
export function ImportPage() {
  const { t } = useTranslation()
  // A tab named in the address opens on it: Basecamp's sign-in comes back to `?tab=basecamp`.
  const [landing] = useState(() => {
    const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
    const named = q.get('tab') as ImportTab | null
    return { tab: named && IMPORT_TABS.includes(named) ? named : null, error: q.get('importError') }
  })
  const [tab, setTab] = useState<ImportTab>(landing.tab ?? 'sheet')
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  // Importing a spreadsheet or a ClickUp export is `workspace.import`'s, an admin's by default
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`); documents are anyone's.
  // null while the permissions are still being asked. Read as false, that told
  // a member granted workspace.import "not yours" until they answered, which a
  // CI rehearsal on 1 October caught under a full run's load (data-transfer-keys).
  const mayImport = usePermissions(workspaceId).can('workspace.import')
  // A guest does not import, whatever a custom role grants them: the API refuses
  // them in these words (`found-6-oct/a-guest-who-may-import-makes-a-space`), so
  // neither import is offered. The role is known at once, from the session.
  const guest = useWorkspaceRole(workspaceId).role === 'guest'

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('import.pageTitle')}</h1>
        <p className="text-muted-foreground mt-1">{t('import.pageSubtitle')}</p>
      </div>

      <div className="flex gap-2 border-b" data-testid="import-tabs">
        <TabButton
          testid="import-tab-sheet"
          active={tab === 'sheet'}
          onClick={() => setTab('sheet')}
          icon={<Table2 className="h-4 w-4" />}
          label={t('import.tabSheet')}
        />
        {/*
          §V2-S13 frame `12:05` — the submenu's SECOND row, "Document files".
          A row that opened nothing would be the facade this page's header
          refuses for the ten named tools; this one imports the formats
          Rundesk can genuinely read and says plainly which it cannot.
        */}
        <TabButton
          testid="import-tab-doc"
          active={tab === 'doc'}
          onClick={() => setTab('doc')}
          icon={<FileText className="h-4 w-4" />}
          label={t('import.tabDoc')}
        />
        {/*
          The frame's Confluence, Basecamp and Slack rows (`commit-log/log-601eacc-2`):
          each the importer ClickUp has for it, not a sentence saying why not.
        */}
        <TabButton
          testid="import-tab-confluence"
          active={tab === 'confluence'}
          onClick={() => setTab('confluence')}
          icon={<BookOpen className="h-4 w-4" />}
          label="Confluence"
        />
        <TabButton
          testid="import-tab-basecamp"
          active={tab === 'basecamp'}
          onClick={() => setTab('basecamp')}
          icon={<Tent className="h-4 w-4" />}
          label="Basecamp"
        />
        <TabButton
          testid="import-tab-slack"
          active={tab === 'slack'}
          onClick={() => setTab('slack')}
          icon={<MessagesSquare className="h-4 w-4" />}
          label="Slack"
        />
        <TabButton
          testid="import-tab-clickup"
          active={tab === 'clickup'}
          onClick={() => setTab('clickup')}
          icon={<Upload className="h-4 w-4" />}
          label={t('import.tabClickup')}
        />
      </div>

      {tab === 'doc' ? (
        <DocImportPanel />
      ) : tab === 'confluence' ? (
        <ConfluenceImportPanel />
      ) : guest ? (
        <p className="rounded-md border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground" data-testid="import-not-for-guests">
          {t('import.guestsCannot')}
        </p>
      ) : mayImport === null ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite" data-testid="import-asking">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !mayImport ? (
        <p className="rounded-md border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground" data-testid="import-not-yours">
          {t('import.notYours')}
        </p>
      ) : tab === 'sheet' ? (
        <SpreadsheetImportPanel />
      ) : tab === 'basecamp' ? (
        <BasecampImportPanel signInError={landing.tab === 'basecamp' ? landing.error : null} />
      ) : tab === 'slack' ? (
        <SlackImportPanel />
      ) : (
        <ClickUpImportPanel />
      )}
    </div>
  )
}

function TabButton({
  testid,
  active,
  onClick,
  icon,
  label,
}: {
  testid: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ═══ Spreadsheet files ════════════════════════════════════════════════════════

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'col'

/**
 * §V2-S13 frame `12:05` — Imports › **Document files**.
 *
 * WHAT A DOCUMENT IMPORT SHOULD DO WAS IN NO FRAME, so it was decided from what
 * this product already does: `docs/tiptap-markdown.ts` turns a Doc into
 * GitHub-flavoured Markdown and the export endpoint serves it. Import is that
 * run backwards, which makes the round trip — export a doc, import the file,
 * get the same doc — the check a facade cannot pass.
 *
 * THE REFUSAL NAMES THE FORMATS, because "unsupported file" tells somebody
 * holding a .docx nothing about what to do next. `attachment-text.ts` already
 * decided binary documents are out of scope — "a heavy parser dependency" —
 * so the honest answer is which extensions work, not an apology.
 *
 * The file is read in the BROWSER and sent as text: these formats are text by
 * definition, so multipart would buy nothing but a second code path.
 */
function DocImportPanel() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ id: string; title: string } | null>(null)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      /*
       * A Word document is a zip and HTML can be large: both go up as the file
       * itself and are named by their key (`commit-log/log-601eacc-2`).
       * Markdown and plain text are sent as text, as they always were.
       */
      if (/\.(docx|html?|xhtml)$/i.test(file.name)) {
        const fileKey = await uploadImportFile(workspaceId, file, 'doc')
        return api<{ id: string; title: string }>(`/workspaces/${workspaceId}/docs/import`, {
          method: 'POST',
          body: { fileName: file.name, fileKey },
        })
      }
      const markdown = await file.text()
      return api<{ id: string; title: string }>(`/workspaces/${workspaceId}/docs/import`, {
        method: 'POST',
        body: { fileName: file.name, markdown },
      })
    },
    onSuccess: (doc) => {
      setError(null)
      setMade(doc)
    },
    // The server's sentence, not a generic one: it names the file and the
    // formats that work, and replacing it here would throw that away.
    onError: (e) => {
      setMade(null)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  return (
    <div className="space-y-6" data-testid="import-doc-panel">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.docTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1" data-testid="import-doc-blurb">
            {t('import.docBlurb')}
          </p>
        </div>

        <input
          type="file"
          accept=".docx,.html,.htm,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/markdown,text/plain"
          className="hidden"
          id="import-doc-file"
          data-testid="import-doc-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            // Cleared so choosing the SAME file twice fires a second change
            // event; without this a retry after an error looks like a dead
            // control.
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          data-testid="import-doc-choose"
          disabled={upload.isPending}
          onClick={() => document.getElementById('import-doc-file')?.click()}
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          {t('import.docChoose')}
        </Button>

        <p className="text-xs text-muted-foreground" data-testid="import-doc-accepted">
          {t('import.docAccepted')}
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive" data-testid="import-doc-error">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {made && (
          <div
            className="flex items-center gap-2 text-sm"
            data-testid="import-doc-result"
            data-doc-id={made.id}
          >
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-muted-foreground">{t('import.docImported')}</span>
            {/*
              A LINK TO THE THING THAT WAS MADE, not just a note that something
              was. An import whose only evidence is a sentence is one the
              person has to go hunting for.
            */}
            <a
              className="font-medium underline underline-offset-2"
              href={`/app/${workspaceId}/docs/${made.id}`}
              data-testid="import-doc-open"
            >
              {made.title}
            </a>
          </div>
        )}
      </Card>
    </div>
  )
}

function SpreadsheetImportPanel() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })

  const [preset, setPreset] = useState('generic')
  const [content, setContent] = useState('')
  // A workbook or a JSON list, uploaded and named by its key (`ledger-rows/row-816`); null for text.
  const [fileKey, setFileKey] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filename, setFilename] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [preview, setPreview] = useState<SheetPreview | null>(null)
  const [projectName, setProjectName] = useState('')
  const [defaultListName, setDefaultListName] = useState('')
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  const [jobId, setJobId] = useState<string | null>(null)
  // The last file chosen was not delimited text, and was not read (`isSheetFile`).
  const [notText, setNotText] = useState(false)
  // Whose read may land: the last file chosen, and no earlier one.
  const [pickTurns] = useState(createPickTurns)

  const catalogue = useQuery({
    queryKey: ['sheet-import-sources', workspaceId],
    queryFn: () => fetchSheetSources(workspaceId),
  })

  // What the server reads: the uploaded file, or the text the page read.
  const source = fileKey ? { fileKey, fileName: filename } : { content }
  const previewMut = useMutation({
    mutationFn: (override?: { preset?: string; mapping?: ColumnMapping }) =>
      previewSheet(workspaceId, {
        ...source,
        preset: override?.preset ?? preset,
        mapping: override?.mapping ?? mapping ?? undefined,
        defaultListName: defaultListName.trim() || undefined,
      }),
    onSuccess: (data) => {
      setPreview(data)
      setMapping(data.mapping)
      // A Monday board comes in as ClickUp brings one: under its own name, unless one was typed.
      if (data.layout?.kind === 'board' && !projectName.trim()) setProjectName(data.layout.board)
    },
  })

  const importMut = useMutation({
    mutationFn: () =>
      startSheetImport(workspaceId, {
        ...source,
        preset,
        mapping: mapping ?? undefined,
        targetProjectName: projectName.trim() || undefined,
        defaultListName: defaultListName.trim() || undefined,
        strategy,
      }),
    onSuccess: (data) => setJobId(data.jobId),
  })

  const jobQuery = useQuery({
    queryKey: ['sheet-import-job', workspaceId, jobId],
    queryFn: () => fetchSheetJob(workspaceId, jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as SheetJob | undefined)?.status
      return status === 'completed' || status === 'failed' ? false : 700
    },
  })

  const job = jobQuery.data
  const result = job?.status === 'completed' ? job.result : null

  const history = useQuery({
    queryKey: ['sheet-import-history', workspaceId, job?.status],
    queryFn: () => fetchSheetJobs(workspaceId, 'spreadsheet'),
  })

  // A new file invalidates everything downstream of it.
  useEffect(() => {
    setPreview(null)
    setMapping(null)
    setJobId(null)
  }, [content, fileKey])

  const fieldLabel = (f: SheetField) =>
    t(`import.field.${f}` as Parameters<typeof t>[0]) as string

  const accepted = catalogue.data?.acceptedExtensions ?? ['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json']
  const activeSource = useMemo(
    () => catalogue.data?.sources.find((s) => s.key === preset),
    [catalogue.data, preset],
  )

  /*
   * A FILE IS READ AS WHAT IT IS (`ledger-rows/row-816`), asked by its name
   * and its first bytes before anything is read (`sheetFileKind`): delimited
   * text is read by the page and sent as text, as it always was; a workbook —
   * whatever it is called — or a JSON list is uploaded as it is and read by the
   * server, since a workbook's bytes do not survive being read as text
   * (`found-5-oct/xlsx-read-as-text`: read so, its zip was drawn as a column
   * and its run failed). A file of no kind the import reads is refused in the
   * words under the picker, and nothing of it is kept — nor any earlier file's
   * read or upload that lands later (`createPickTurns`).
   */
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    const turn = pickTurns.next()
    const kind = await sheetFileKind(file, accepted)
    if (!pickTurns.isLatest(turn)) return
    setUploadError(null)
    // The last file's refusal is not this one's.
    previewMut.reset()
    if (!kind) {
      setNotText(true)
      setFilename('')
      setContent('')
      setFileKey(null)
      input.value = ''
      return
    }
    setNotText(false)
    setFilename(file.name)
    setFileSize(file.size)
    if (kind === 'file') {
      setContent('')
      setFileKey(null)
      setUploading(true)
      try {
        const key = await uploadImportFile(workspaceId, file, 'sheet')
        if (pickTurns.isLatest(turn)) setFileKey(key)
      } catch (err) {
        if (pickTurns.isLatest(turn)) setUploadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (pickTurns.isLatest(turn)) setUploading(false)
      }
      return
    }
    setFileKey(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (pickTurns.isLatest(turn)) setContent(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsText(file)
  }

  function choosePreset(key: string) {
    setPreset(key)
    // Re-derive the mapping from the new preset rather than keeping the old
    // one: a preset that did not change the columns would be a dead control.
    setMapping(null)
    if (content || fileKey) previewMut.mutate({ preset: key, mapping: undefined })
  }

  function setColumn(header: string, field: SheetField) {
    const next: ColumnMapping = { ...(mapping ?? {}), [header]: field }
    setMapping(next)
    previewMut.mutate({ mapping: next })
  }

  return (
    <div className="space-y-6" data-testid="import-sheet-panel">
      {/* Step 1 — where the export came from */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Table2 className="h-4 w-4" />
          {t('import.sheetSourceTitle')}
        </div>
        <div className="flex flex-wrap gap-2" data-testid="import-source-picker">
          {(catalogue.data?.sources ?? []).map((s) => (
            <button
              key={s.key}
              type="button"
              data-testid={`import-source-${s.key}`}
              data-active={preset === s.key ? 'true' : 'false'}
              onClick={() => choosePreset(s.key)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                preset === s.key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {activeSource && (
          <p className="text-xs text-muted-foreground" data-testid="import-source-hint">
            {activeSource.exportHint}
          </p>
        )}

        {/* The frame's remaining rows — stated, never drawn as a control. */}
        {(catalogue.data?.unsupported ?? []).length > 0 && (
          <div
            className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-2"
            data-testid="import-unsupported"
          >
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Ban className="h-3.5 w-3.5" />
              {t('import.sheetUnsupportedTitle')}
            </div>
            <p>{t('import.sheetUnsupportedNote')}</p>
            <ul className="space-y-1">
              {(catalogue.data?.unsupported ?? []).map((u) => (
                <li key={u.key} data-testid={`import-unsupported-${u.key}`}>
                  <span className="font-medium text-foreground">{u.label}</span> — {u.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Step 2 — upload */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4" />
          {t('import.sheetStep1')}
        </div>
        <input
          type="file"
          data-testid="import-sheet-file"
          accept={accepted.join(',')}
          onChange={onFileChange}
          className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:font-medium hover:file:bg-primary/90"
        />
        <p className="text-xs text-muted-foreground" data-testid="import-sheet-accepted">
          {t('import.sheetAccepted', { list: accepted.join(' · ') })}
        </p>
        {notText && (
          <div data-testid="import-sheet-not-text" role="alert">
            <ErrorBox message={t('import.sheetAccepted', { list: accepted.join(' · ') })} />
          </div>
        )}
        {filename && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="import-sheet-filename"
            data-uploaded={fileKey ? 'true' : 'false'}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {t('import.fileInfo', { name: filename, size: ((fileKey || uploading ? fileSize : content.length) / 1024).toFixed(1) })}
          </div>
        )}
        {uploadError && (
          <div data-testid="import-sheet-upload-error" role="alert">
            <ErrorBox message={uploadError} />
          </div>
        )}
        <Button
          data-testid="import-sheet-preview"
          onClick={() => previewMut.mutate(undefined)}
          disabled={(!content && !fileKey) || uploading || previewMut.isPending}
          variant="secondary"
        >
          {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('import.preview')}
        </Button>
        {previewMut.isError && (
          // The server's words: a workbook it could not read says why.
          <div data-testid="import-sheet-preview-error" role="alert">
            <ErrorBox message={(previewMut.error as Error).message} />
          </div>
        )}
      </Card>

      {/* Step 3 — the column mapping */}
      {preview && !jobId && (
        <Card className="p-6 space-y-5" data-testid="import-sheet-review">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('import.sheetStep2')}
          </div>
          {/* A workbook: which of its sheets was read — its first visible one. */}
          {(preview.format === 'xlsx' || preview.format === 'xls') && (
            <p className="text-xs text-muted-foreground" data-testid="import-sheet-read-from" data-format={preview.format} data-sheet={preview.sheetName ?? ''}>
              {t('import.sheetReadFrom', { sheet: preview.sheetName ?? '' })}
            </p>
          )}
          {/* A source's own export, read in its own layout (`readExportLayout`): what it held beyond its table. */}
          {preview.layout?.kind === 'board' && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="import-sheet-layout"
              data-kind="board"
              data-board={preview.layout.board}
              data-groups={preview.layout.groups.length}
              data-left-out={preview.layout.leftOut}
            >
              {t('import.sheetBoard', { board: preview.layout.board, groups: preview.layout.groups.join(', '), leftOut: preview.layout.leftOut })}
            </p>
          )}
          {preview.layout?.kind === 'keyed' && (
            <p className="text-xs text-muted-foreground" data-testid="import-sheet-layout" data-kind="keyed" data-repeated={preview.layout.repeated}>
              {t('import.sheetKeyed', { repeated: preview.layout.repeated })}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat testid="import-sheet-total" label={t('import.totalRows')} value={preview.totalRows} />
            <Stat testid="import-sheet-importable" label={t('import.sheetImportable')} value={preview.importableRows} />
            <Stat testid="import-sheet-rejected" label={t('import.sheetRejected')} value={preview.rejectedRows} />
            <Stat testid="import-sheet-duplicates" label={t('import.duplicatesLabel')} value={preview.duplicates} />
          </div>

          <div className="rounded-md border divide-y" data-testid="import-mapping">
            <div className="grid grid-cols-2 gap-2 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>{t('import.sheetColumn')}</span>
              <span>{t('import.sheetMapsTo')}</span>
            </div>
            {preview.headers.map((h) => (
              <div key={h} className="grid grid-cols-2 gap-2 items-center px-3 py-2">
                <span className="text-sm font-medium truncate" title={h}>
                  {h}
                </span>
                <select
                  data-testid={`import-map-${slug(h)}`}
                  data-column={h}
                  value={(mapping ?? preview.mapping)[h] ?? 'ignore'}
                  onChange={(e) => setColumn(h, e.target.value as SheetField)}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  {SHEET_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {fieldLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {preview.mappingError && (
            <div className="text-sm text-destructive" data-testid="import-mapping-error">
              {preview.mappingError}
            </div>
          )}

          {/* The refusals, before anything is written. */}
          <div data-testid="import-sheet-rejections">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t('import.sheetRejectedTitle')}
            </div>
            {preview.rowErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="import-sheet-rejections-none">
                {t('import.sheetRejectedNone')}
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {preview.rowErrors.slice(0, 50).map((e) => (
                  <li
                    key={`${e.row}-${e.code}`}
                    data-testid="import-sheet-reject-row"
                    data-row={e.row}
                    data-code={e.code}
                    className="rounded bg-muted px-2 py-1"
                  >
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {preview.uniqueLists.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {t('import.listsToCreate')}
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="import-sheet-lists">
                {preview.uniqueLists.map((l) => (
                  <Badge key={l} variant="secondary">
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sheet-project">
                {t('import.projectName')}
              </label>
              <Input
                id="sheet-project"
                data-testid="import-sheet-project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={preview.presetLabel}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sheet-list">
                {t('import.sheetDefaultList')}
              </label>
              <Input
                id="sheet-list"
                data-testid="import-sheet-listname"
                value={defaultListName}
                onChange={(e) => setDefaultListName(e.target.value)}
                placeholder="Imported Tasks"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sheet-strategy">
              {t('import.sheetStrategy')}
            </label>
            <select
              id="sheet-strategy"
              data-testid="import-sheet-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ConflictStrategy)}
              className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="skip">{t('import.strategySkip')}</option>
              <option value="create">{t('import.strategyCreate')}</option>
              <option value="merge">{t('import.strategyMerge')}</option>
            </select>
          </div>

          <Button
            data-testid="import-sheet-start"
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending || !!preview.mappingError || preview.importableRows === 0}
            className="w-full"
          >
            {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {tCount('import.startImport', preview.importableRows)}
          </Button>
          {importMut.isError && <ErrorBox message={(importMut.error as Error).message} />}
        </Card>
      )}

      {/* Step 4 — live progress */}
      {jobId && job && job.status !== 'completed' && (
        <Card className="p-6 space-y-4" data-testid="import-sheet-progress">
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
            </>
          )}
        </Card>
      )}

      {/* Step 5 — the report */}
      {result && (
        <Card className="p-6 space-y-4" data-testid="import-sheet-report">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
            <span
              className="ml-auto rounded bg-muted px-2 py-0.5 text-xs font-normal"
              data-testid="import-sheet-preset"
              data-preset={result.sourcePreset}
            >
              {t('import.sheetPreset')}: {result.sourcePreset}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            <Stat testid="import-sheet-r-lists" label={t('import.lists')} value={result.listsCreated} />
            <Stat testid="import-sheet-r-created" label={t('import.created')} value={result.tasksCreated} />
            <Stat testid="import-sheet-r-updated" label={t('import.updated')} value={result.tasksUpdated} />
            <Stat testid="import-sheet-r-skipped" label={t('import.skipped')} value={result.tasksSkipped} />
            <Stat testid="import-sheet-r-rejected" label={t('import.sheetRejected')} value={result.tasksRejected} />
            <Stat testid="import-sheet-r-labels" label={t('import.labels')} value={result.labelsCreated} />
            <Stat testid="import-sheet-r-assignees" label={t('import.assignees')} value={result.assigneesLinked} />
            <Stat
              testid="import-sheet-r-unmatched"
              label={t('import.sheetAssigneesUnmatched')}
              value={result.assigneesUnmatched}
            />
          </div>

          {result.rowErrors.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-2">
              <div className="font-medium">{t('import.sheetRejectedTitle')}</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.rowErrors.slice(0, 50).map((e) => (
                  <li
                    key={`${e.row}-${e.code}`}
                    data-testid="import-sheet-error-row"
                    data-row={e.row}
                    data-code={e.code}
                  >
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="font-medium cursor-pointer">{result.errors.length}</summary>
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {/* The history — the reader of `clickup_import_jobs.source`. */}
      <Card className="p-6 space-y-3" data-testid="import-sheet-history">
        <div className="text-sm font-medium">{t('import.sheetHistory')}</div>
        {(history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="import-sheet-history-none">
            {t('import.sheetHistoryNone')}
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {(history.data ?? []).map((h) => (
              <li
                key={h.id}
                data-testid="import-sheet-history-row"
                data-job={h.id}
                data-source={h.source}
                data-preset={h.sourcePreset ?? ''}
                className="flex items-center gap-3 py-2"
              >
                <Badge variant="secondary">{h.sourcePreset ?? h.source}</Badge>
                <span className="text-muted-foreground">
                  {t('import.progressCount', { processed: h.processed, total: h.total })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ═══ ClickUp CSV (unchanged behaviour; testids added) ═════════════════════════

function ClickUpImportPanel() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [csv, setCsv] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [projectName, setProjectName] = useState('ClickUp Import')
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  // §12.5 — optional ClickUp API token. When set, the import ALSO pulls each
  // task's comments + attachments (which the CSV export can't carry). Empty →
  // the existing CSV-only flow is unchanged.
  const [apiToken, setApiToken] = useState('')
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
        body: {
          csv,
          targetProjectName: projectName,
          strategy,
          // Only send a token when the field is non-empty so the CSV-only path
          // is untouched; the API auto-enriches comments + attachments when set.
          apiToken: apiToken.trim() || undefined,
        },
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
    setApiToken('')
  }

  return (
    <div className="space-y-6" data-testid="import-clickup-panel">
      <div>
        <h2 className="text-lg font-semibold">{t('import.title')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('import.subtitle')}</p>
      </div>

      {/* Step 1 — upload */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4" />
          {t('import.step1Title')}
        </div>
        <input
          type="file"
          data-testid="import-clickup-file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:font-medium hover:file:bg-primary/90"
        />
        {filename && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="import-clickup-filename">
            <FileText className="h-4 w-4" />
            {t('import.fileInfo', { name: filename, size: (csv.length / 1024).toFixed(1) })}
          </div>
        )}
        <Button
          data-testid="import-clickup-preview"
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
        <Card className="p-6 space-y-5" data-testid="import-clickup-review">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('import.step2Title')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat testid="import-clickup-total" label={t('import.totalRows')} value={preview.totalRows} />
            <Stat testid="import-clickup-lists" label={t('import.listsDetected')} value={preview.uniqueLists.length} />
            <Stat testid="import-clickup-fields" label={t('import.customFields')} value={preview.customFields.length} />
            <Stat
              testid="import-clickup-duplicates"
              label={t('import.duplicatesLabel')}
              value={preview.duplicates.count}
            />
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
            <Input
              data-testid="import-clickup-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="ClickUp Import"
            />
          </div>

          {/* §12.5 — optional ClickUp API token unlocks comments + attachments. */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              {t('import.apiTokenLabel')}
              <span className="text-xs font-normal text-muted-foreground">({t('common.optional')})</span>
            </label>
            <Input
              type="password"
              data-testid="import-clickup-token"
              autoComplete="off"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={t('import.apiTokenPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('import.apiTokenHelp')}</p>
          </div>

          {apiToken.trim() ? null : (
            <NotIncludedNote note={t('import.notIncludedNote')} title={t('import.notIncludedTitle')} />
          )}

          <Button
            data-testid="import-clickup-start"
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
        <Card className="p-6 space-y-4" data-testid="import-clickup-progress">
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
                <Stat testid="import-clickup-p-created" label={t('import.created')} value={job.createdCount} />
                <Stat testid="import-clickup-p-updated" label={t('import.updated')} value={job.updatedCount} />
                <Stat testid="import-clickup-p-skipped" label={t('import.skipped')} value={job.skippedCount} />
              </div>
            </>
          )}
        </Card>
      )}

      {/* Step 4 — final report */}
      {result && (
        <Card className="p-6 space-y-4" data-testid="import-clickup-report">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            <Stat testid="import-clickup-r-spaces" label={t('import.spaces')} value={result.spacesCreated} />
            <Stat testid="import-clickup-r-projects" label={t('import.projects')} value={result.projectsCreated} />
            <Stat testid="import-clickup-r-lists" label={t('import.lists')} value={result.listsCreated} />
            <Stat testid="import-clickup-r-tasks" label={t('import.tasks')} value={result.tasksCreated} />
            <Stat testid="import-clickup-r-updated" label={t('import.updated')} value={result.tasksUpdated} />
            <Stat testid="import-clickup-r-skipped" label={t('import.skipped')} value={result.tasksSkipped} />
            <Stat testid="import-clickup-r-fields" label={t('import.customFields')} value={result.customFieldsCreated} />
            <Stat
              testid="import-clickup-r-values"
              label={t('import.customValues')}
              value={result.customFieldValuesSet}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat testid="import-clickup-r-labels" label={t('import.labels')} value={result.labelsCreated} />
            <Stat testid="import-clickup-r-assignees" label={t('import.assignees')} value={result.assigneesLinked} />
            <Stat testid="import-clickup-r-subtasks" label={t('import.subtasks')} value={result.subtasksLinked} />
          </div>

          {/* §12.5 — comments/attachments only exist when an API token was used. */}
          {result.commentsImported != null || result.attachmentsImported != null ? (
            <div className="grid grid-cols-3 gap-4">
              <Stat
                testid="import-clickup-r-comments"
                label={t('import.commentsImported')}
                value={result.commentsImported ?? 0}
              />
              <Stat
                testid="import-clickup-r-attachments"
                label={t('import.attachmentsImported')}
                value={result.attachmentsImported ?? 0}
              />
              <Stat
                testid="import-clickup-r-attachments-skipped"
                label={t('import.attachmentsSkipped')}
                value={result.attachmentsSkipped ?? 0}
              />
            </div>
          ) : (
            <NotIncludedNote note={t('import.notIncludedNote')} title={t('import.notIncludedTitle')} />
          )}

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
            <Button variant="secondary" data-testid="import-clickup-another" onClick={reset}>
              {t('import.importAnother')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, testid }: { label: string; value: number; testid?: string }) {
  return (
    <div className="rounded-md border p-3" data-testid={testid} data-value={value}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

function StrategyOption({ value, label, help }: { value: string; label: string; help: string }) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer hover:bg-muted/40">
      <RadioGroupItem value={value} data-testid={`import-strategy-${value}`} className="mt-0.5" />
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
