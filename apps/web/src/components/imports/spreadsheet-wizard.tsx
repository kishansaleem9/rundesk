/**
 * §2 — the Spreadsheet importer. Step 1 is choosing "Spreadsheet" on the
 * source grid, so the first screen here is STEP 2 ("Import Destination") and
 * the second is STEP 3, the Spreadsheets Importer: upload → Map fields →
 * (Custom Fields) → the review grid → "Import into RUNDESK".
 *
 * The file is read HERE, in the browser, by `@rundesk/imports` — the same
 * reader and the same rules the API applies again to what it is sent — so the
 * person reviews exactly the rows that will be judged.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Input, cn, toast } from '@rundesk/ui'
import {
  autoMap,
  buildGrid,
  DATE_FORMAT_OPTIONS,
  DELIMITER_OPTIONS,
  matchAssignee,
  readSheetFile,
  SheetReadError,
  splitMulti,
  suggestFieldType,
  taskGridColumns,
  validateGrid,
  GOOGLE_SHEETS_HINT,
  type AutoMapTarget,
  type DateFormatKey,
  type GridColumn,
  type GridRow,
  type ImportableFieldType,
  type SheetTable,
  type ValueMaps,
} from '@rundesk/imports'
import { refusalMessage } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { chunkRows, importsApi, type ImportPreview, type LocationRef } from '../../lib/imports-exports-api'
import { DataImportGrid } from './data-import-grid'
import { LocationPicker } from './location-pickers'
import { CustomFieldsStep, MapFieldsStep } from './map-fields-step'
import { ImportedNotImported, StepLabel, WizardStep } from './wizard-chrome'

type Stage = 'grid' | 'map' | 'fields'
const SELECT = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm'

export function SpreadsheetWizard({
  workspaceId,
  initialLocation,
  onExit,
  onStarted,
}: {
  workspaceId: string
  /** Opened from a Space, Folder or List: that location is the destination already. */
  initialLocation?: (LocationRef & { path: string }) | null
  onExit: () => void
  onStarted: (jobId: string) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<2 | 3>(2)
  const [location, setLocation] = useState<(LocationRef & { path: string }) | null>(initialLocation ?? null)
  // A location handed in arrives once the tree has loaded; it is taken unless one was chosen.
  useEffect(() => {
    if (initialLocation) setLocation((current) => current ?? initialLocation)
  }, [initialLocation?.type, initialLocation?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFormat, setDateFormat] = useState<DateFormatKey>('ymd')
  const [delimiterChoice, setDelimiterChoice] = useState<string>(',')
  const [otherDelimiter, setOtherDelimiter] = useState('')
  const delimiter = delimiterChoice === 'other' ? otherDelimiter : delimiterChoice
  const [job, setJob] = useState<{ id: string } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const [stage, setStage] = useState<Stage>('grid')
  const [booting, setBooting] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [table, setTable] = useState<SheetTable | null>(null)
  const [mapping, setMapping] = useState<Record<string, AutoMapTarget>>({})
  const [fieldTypes, setFieldTypes] = useState<Record<string, ImportableFieldType>>({})
  const [valueMaps, setValueMaps] = useState<ValueMaps>({})
  const [columns, setColumns] = useState<GridColumn[]>([])
  const [rows, setRows] = useState<GridRow[]>([])
  const [invite, setInvite] = useState<Set<string>>(new Set())

  const begin = useMutation({
    mutationFn: async () => {
      const made = await importsApi.create(workspaceId, {
        source: 'spreadsheet',
        options: { destination: { type: location!.type, id: location!.id }, dateFormat, delimiter },
      })
      return { made, preview: await importsApi.preview(workspaceId, made.id) }
    },
    onSuccess: ({ made, preview: p }) => {
      setJob({ id: made.id })
      setPreview(p)
      setStep(3)
    },
    onError: (e) => toast.error(refusalMessage(e, t('ie.couldNotStart'))),
  })

  const readFile = async (file: File) => {
    setBooting(true)
    try {
      const sheet = await readSheetFile(file.name, new Uint8Array(await file.arrayBuffer()))
      if (!sheet.rows.length) throw new SheetReadError('empty_file', t('ie.noRows'))
      setTable(sheet)
      setFileName(file.name)
      setMapping(
        autoMap(sheet.headers, {
          memory: preview?.mappingMemory,
          customFields: preview?.customFields.filter((f) => f.importable).map((f) => ({ id: f.id, name: f.name })),
        }),
      )
      setStage('map')
    } catch (e) {
      toast.error(e instanceof SheetReadError ? e.message : t('ie.unreadable'))
    } finally {
      setBooting(false)
    }
  }

  const newFieldHeaders = Object.entries(mapping).filter(([, v]) => v === 'cf:new').map(([h]) => h)

  const toGrid = (types = fieldTypes) => {
    if (!table || !preview) return
    const fields = preview.customFields
      .filter((f) => f.importable)
      .map((f) => ({ id: f.id, name: f.name, type: f.type as ImportableFieldType }))
    const grid = buildGrid(table, mapping, { delimiter, customFields: fields, newFieldTypes: types })
    setColumns(grid.columns)
    setRows(grid.rows)
    setStage('grid')
  }

  const continueFromMap = () => {
    if (newFieldHeaders.length && table) {
      const next = { ...fieldTypes }
      for (const h of newFieldHeaders) {
        if (next[h]) continue
        const i = table.headers.indexOf(h)
        next[h] = suggestFieldType(table.rows.map((r) => r.cells[i] ?? ''), { dateFormat, delimiter })
      }
      setFieldTypes(next)
      setStage('fields')
      return
    }
    toGrid()
  }

  const ctx = useMemo(() => ({ dateFormat, delimiter, valueMaps }), [dateFormat, delimiter, valueMaps])
  const verdict = useMemo(() => (columns.length ? validateGrid(rows, columns, ctx) : null), [rows, columns, ctx])

  // People in Task assignee who are not members here: reported before Start, invited or skipped.
  const unmatched = useMemo(() => {
    if (!preview) return []
    const members = preview.members.map((m) => ({ userId: m.id, email: m.email, displayName: m.name }))
    const seen = new Map<string, { value: string; ambiguous: boolean }>()
    for (const r of rows) {
      for (const v of splitMulti(r.values.assignees ?? '', delimiter)) {
        const hit = matchAssignee(v, members)
        if (!('userId' in hit) && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), { value: v, ambiguous: Boolean(hit.ambiguous) })
      }
    }
    return [...seen.values()]
  }, [rows, preview, delimiter])

  const start = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('No import')
      const chunks = chunkRows(rows)
      for (const [i, chunk] of chunks.entries()) await importsApi.upload(workspaceId, job.id, i, chunk)
      // A typed-in grid has no file headers: its own columns are the mapping.
      const columnMap: Record<string, string> = table
        ? { ...mapping }
        : Object.fromEntries(columns.filter((c) => c.kind !== 'custom').map((c) => [c.label, c.key]))
      await importsApi.mapping(workspaceId, job.id, { columns: columnMap, grid: columns, valueMaps, invite: [...invite] })
      return importsApi.start(workspaceId, job.id)
    },
    onSuccess: () => {
      toast.success(t('ie.started'))
      onStarted(job!.id)
    },
    onError: (e) => toast.error(refusalMessage(e, t('ie.couldNotStart'))),
  })

  const manual = () => {
    setTable(null)
    setFileName(null)
    setMapping({})
    setColumns(taskGridColumns())
    setRows([{ key: 'm1', values: {} }])
    setStage('grid')
  }

  // A manual grid has no incoming headers; its Task Name column is the mapping.
  const mappingOk = table ? Object.values(mapping).includes('taskName') : columns.some((c) => c.key === 'taskName')
  const importDisabled = !verdict || verdict.validKeys.size === 0 || !mappingOk

  if (step === 2) {
    const helper =
      location?.type === 'space'
        ? t('ie.dest.helperSpace')
        : location?.type === 'folder'
          ? t('ie.dest.helperFolder')
          : location?.type === 'project'
            ? t('ie.dest.helperProject')
            : location?.type === 'list'
              ? t('ie.dest.helperList')
              : null
    return (
      <WizardStep
        step={2}
        of={3}
        title={t('ie.dest.title')}
        onBack={onExit}
        primary={{
          label: t('ie.continue'),
          onClick: () => begin.mutate(),
          disabled: !location || !delimiter || [...delimiter].length !== 1,
          busy: begin.isPending,
          testId: 'dest-continue',
        }}
      >
        <div className="space-y-5">
          <div>
            <StepLabel>{t('ie.dest.whereLabel')}</StepLabel>
            <LocationPicker workspaceId={workspaceId} value={location} onChange={setLocation} />
            {helper && (
              <p className="mt-1.5 text-xs text-muted-foreground" data-testid="dest-helper">
                {helper}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t('ie.dest.listColumnNote')}</p>
          </div>
          <div>
            <StepLabel htmlFor="import-date-format">{t('ie.dest.dateLabel')}</StepLabel>
            <select id="import-date-format" className={SELECT} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormatKey)} data-testid="dest-date-format">
              {DATE_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <StepLabel htmlFor="import-delimiter">{t('ie.dest.delimiterLabel')}</StepLabel>
            <p className="-mt-0.5 mb-1.5 text-xs text-muted-foreground">{t('ie.dest.delimiterHelper')}</p>
            <select id="import-delimiter" className={SELECT} value={delimiterChoice} onChange={(e) => setDelimiterChoice(e.target.value)} data-testid="dest-delimiter">
              {DELIMITER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {delimiterChoice === 'other' && (
              <Input
                className="mt-2 w-24"
                maxLength={1}
                value={otherDelimiter}
                onChange={(e) => setOtherDelimiter(e.target.value.slice(0, 1))}
                placeholder={t('ie.dest.oneCharacter')}
                data-testid="dest-delimiter-other"
              />
            )}
          </div>
        </div>
        <ImportedNotImported
          imported={[
            t('ie.what.tasks'),
            t('ie.what.subtasks'),
            t('ie.what.descriptions'),
            t('ie.what.assignees'),
            t('ie.what.statuses'),
            t('ie.what.dates'),
            t('ie.what.priority'),
            t('ie.what.tags'),
            t('ie.what.time'),
            t('ie.what.checklists'),
            t('ie.what.taskTypes'),
            t('ie.what.lists'),
            t('ie.what.customFields'),
          ]}
          notImported={[
            t('ie.what.noComments'),
            t('ie.what.noAttachments'),
            t('ie.what.noFormatting'),
            t('ie.what.noFieldTypes'),
            t('ie.what.noDeepNesting'),
          ]}
        />
      </WizardStep>
    )
  }

  if (stage === 'map' && table && preview) {
    return (
      <MapFieldsStep
        table={table}
        mapping={mapping}
        onMapping={setMapping}
        preview={preview}
        valueMaps={valueMaps}
        onValueMaps={setValueMaps}
        onBack={() => {
          setTable(null)
          setStage('grid')
        }}
        onContinue={continueFromMap}
      />
    )
  }

  if (stage === 'fields') {
    return (
      <CustomFieldsStep
        headers={newFieldHeaders}
        types={fieldTypes}
        onTypes={setFieldTypes}
        onBack={() => setStage('map')}
        onComplete={() => toGrid(fieldTypes)}
      />
    )
  }

  return (
    <WizardStep step={3} of={3} title={t('ie.grid.title')} subtitle={t('ie.grid.subtitle')} wide onBack={() => (table ? setStage('map') : setStep(2))}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {preview && t('ie.grid.destination', { path: preview.destination.path })}
          {fileName && <span className="ml-2">· {fileName}</span>}
        </span>
        <span>{GOOGLE_SHEETS_HINT}</span>
      </div>
      <DataImportGrid
        columns={columns.length ? columns : taskGridColumns()}
        rows={rows}
        verdict={verdict}
        onRowsChange={setRows}
        onImport={() => start.mutate()}
        importDisabled={importDisabled}
        importing={start.isPending}
        onFile={readFile}
        onManual={manual}
        booting={booting}
        banner={
          unmatched.length > 0 ? (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-400/10 p-3 text-sm" data-testid="grid-unmatched">
              <div className="font-medium">{t('ie.grid.unmatchedTitle', { count: unmatched.length })}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('ie.grid.unmatchedBody')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unmatched.slice(0, 40).map((u) => {
                  const isEmail = u.value.includes('@')
                  const on = invite.has(u.value.toLowerCase())
                  return (
                    <span key={u.value} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs">
                      {u.value}
                      {u.ambiguous && <em className="text-muted-foreground">({t('ie.grid.ambiguous')})</em>}
                      {isEmail ? (
                        <button
                          type="button"
                          className={cn('rounded px-1.5 py-0.5', on ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:text-foreground')}
                          onClick={() =>
                            setInvite((s) => {
                              const next = new Set(s)
                              if (next.has(u.value.toLowerCase())) next.delete(u.value.toLowerCase())
                              else next.add(u.value.toLowerCase())
                              return next
                            })
                          }
                        >
                          {on ? t('ie.grid.invite') : t('ie.grid.skip')}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{t('ie.grid.skip')}</span>
                      )}
                    </span>
                  )
                })}
              </div>
              {invite.size > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('ie.grid.inviteCharges')}</p>}
            </div>
          ) : null
        }
      />
    </WizardStep>
  )
}
