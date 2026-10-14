/**
 * §2.4 "Map fields" and §2.5 "Custom Fields" — between reading a file and the
 * review grid. Incoming headers are pre-mapped (mapping memory, field labels,
 * ClickUp's headers, synonyms); the person corrects them, decides what the
 * Status, Priority and Task Type values mean here, and gives any new Custom
 * Field its type.
 */

import { AlertCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@rundesk/ui'
import {
  IMPORTABLE_FIELD_TYPES,
  NOT_SUPPORTED_FOR_IMPORT,
  TASK_COLUMNS,
  UNSUPPORTED_FIELD_TYPES,
  mappingProblem,
  parsePriority,
  type AutoMapTarget,
  type ColumnMapping,
  type ImportableFieldType,
  type Priority,
  type SheetTable,
  type ValueMaps,
} from '@rundesk/imports'
import { useTranslation } from '../../lib/i18n'
import type { ImportPreview } from '../../lib/imports-exports-api'
import { StepLabel, WizardStep } from './wizard-chrome'

const SELECT = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm'
export const CREATE_NEW = '__create__'

export function MapFieldsStep({
  table,
  mapping,
  onMapping,
  preview,
  valueMaps,
  onValueMaps,
  onBack,
  onContinue,
}: {
  table: SheetTable
  mapping: Record<string, AutoMapTarget>
  onMapping: (next: Record<string, AutoMapTarget>) => void
  preview: ImportPreview
  valueMaps: ValueMaps
  onValueMaps: (next: ValueMaps) => void
  onBack: () => void
  onContinue: () => void
}) {
  const { t } = useTranslation()
  const sample = (header: string) => {
    const i = table.headers.indexOf(header)
    return table.rows
      .map((r) => (r.cells[i] ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  const gridMapping: ColumnMapping = Object.fromEntries(Object.entries(mapping).map(([h, v]) => [h, v === 'parentId' ? 'skip' : v]))
  const problem = mappingProblem(gridMapping)
  const distinct = (target: string) => {
    const header = Object.entries(mapping).find(([, v]) => v === target)?.[0]
    if (!header) return []
    const i = table.headers.indexOf(header)
    return [...new Set(table.rows.map((r) => (r.cells[i] ?? '').trim()).filter(Boolean))].slice(0, 50)
  }
  const statusValues = distinct('status')
  const priorityValues = distinct('priority')
  const typeValues = distinct('taskType')
  const taken = new Set(Object.values(mapping).filter((v) => v !== 'skip' && v !== 'cf:new'))

  const set = (header: string, target: AutoMapTarget) => {
    const next = { ...mapping }
    // One incoming field per RUNDESK field: choosing a taken one frees it elsewhere.
    if (target !== 'skip' && target !== 'cf:new') for (const h of Object.keys(next)) if (next[h] === target) next[h] = 'skip'
    next[header] = target
    onMapping(next)
  }

  const setMap = <K extends keyof ValueMaps>(kind: K, raw: string, value: string | undefined) => {
    const current = { ...((valueMaps[kind] ?? {}) as Record<string, string>) }
    if (value === undefined) delete current[raw.toLowerCase()]
    else current[raw.toLowerCase()] = value
    onValueMaps({ ...valueMaps, [kind]: current })
  }

  return (
    <WizardStep
      step={3}
      of={3}
      title={t('ie.map.title')}
      subtitle={t('ie.map.subtitle')}
      onBack={onBack}
      primary={{ label: t('ie.continue'), onClick: onContinue, disabled: Boolean(problem), testId: 'map-continue' }}
    >
      <TooltipProvider delayDuration={150}>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="grid grid-cols-2 border-b border-border/60 bg-card px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>{t('ie.map.incoming')}</span>
            <span>{t('ie.map.rundeskFields')}</span>
          </div>
          {table.headers.map((h) => {
            const values = sample(h)
            const target = mapping[h] ?? 'skip'
            return (
              <div key={h} className="grid grid-cols-2 items-center gap-3 border-b border-border/40 px-3 py-2 last:border-0" data-testid={`map-row-${h}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn('truncate text-sm', target === 'skip' && 'text-muted-foreground')}>{h}</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    {values.length ? values.map((v, i) => <div key={i} className="truncate">{v}</div>) : <em>{t('ie.map.noValues')}</em>}
                  </TooltipContent>
                </Tooltip>
                <select className={SELECT} value={target} onChange={(e) => set(h, e.target.value as AutoMapTarget)} data-testid={`map-select-${h}`}>
                  <option value="skip">{t('ie.map.dontImport')}</option>
                  <optgroup label={t('ie.map.taskFields')}>
                    {TASK_COLUMNS.map((c) => (
                      <option key={c.key} value={c.key} disabled={taken.has(c.key) && target !== c.key}>
                        {c.label}
                        {c.required ? ' *' : ''}
                      </option>
                    ))}
                    <option value="parentId" disabled={taken.has('parentId') && target !== 'parentId'}>
                      {t('ie.map.parentId')}
                    </option>
                  </optgroup>
                  <optgroup label={t('ie.map.customFields')}>
                    <option value="cf:new">{t('ie.map.addNewField')}</option>
                    {preview.customFields.map((f) => (
                      <option key={f.id} value={`cf:${f.id}`} disabled={!f.importable || (taken.has(`cf:${f.id}`) && target !== `cf:${f.id}`)}>
                        {f.name}
                        {f.importable ? '' : ` — ${NOT_SUPPORTED_FOR_IMPORT}`}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )
          })}
        </div>
      </TooltipProvider>
      <p className="mt-3 text-xs text-muted-foreground">{t('ie.map.unmappedExcluded')}</p>
      {problem && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive" data-testid="map-error">
          <AlertCircle className="h-4 w-4" />
          {problem}
        </p>
      )}

      {statusValues.length > 0 && (
        <ValuePanel
          title={t('ie.map.statusValues')}
          values={statusValues}
          testId="map-status-values"
          options={[...preview.statuses.map((s) => ({ value: s.name, label: s.name })), { value: CREATE_NEW, label: t('ie.map.createNew') }]}
          chosen={(raw) => valueMaps.status?.[raw.toLowerCase()] ?? preview.statuses.find((s) => s.name.toLowerCase() === raw.toLowerCase())?.name ?? CREATE_NEW}
          onChoose={(raw, v) => setMap('status', raw, v === CREATE_NEW ? undefined : v)}
        />
      )}
      {priorityValues.length > 0 && (
        <ValuePanel
          title={t('ie.map.priorityValues')}
          values={priorityValues}
          testId="map-priority-values"
          options={[
            { value: '', label: t('ie.map.notAPriority') },
            ...(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => ({ value: p, label: t(`ie.priority.${p}` as const) })),
          ]}
          chosen={(raw) => {
            const parsed = parsePriority(raw)
            return valueMaps.priority?.[raw.toLowerCase()] ?? (parsed.ok ? parsed.value : '')
          }}
          onChoose={(raw, v) => setMap('priority', raw, v || undefined)}
        />
      )}
      {typeValues.length > 0 && (
        <ValuePanel
          title={t('ie.map.typeValues')}
          values={typeValues}
          testId="map-type-values"
          options={[...preview.taskTypes.map((ty) => ({ value: ty.name, label: ty.name })), { value: CREATE_NEW, label: t('ie.map.createNew') }]}
          chosen={(raw) => valueMaps.taskType?.[raw.toLowerCase()] ?? preview.taskTypes.find((ty) => ty.name.toLowerCase() === raw.toLowerCase())?.name ?? CREATE_NEW}
          onChoose={(raw, v) => setMap('taskType', raw, v === CREATE_NEW ? undefined : v)}
        />
      )}
    </WizardStep>
  )
}

function ValuePanel({
  title,
  values,
  options,
  chosen,
  onChoose,
  testId,
}: {
  title: string
  values: string[]
  options: Array<{ value: string; label: string }>
  chosen: (raw: string) => string
  onChoose: (raw: string, value: string) => void
  testId: string
}) {
  return (
    <div className="mt-6" data-testid={testId}>
      <StepLabel>{title}</StepLabel>
      <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
        {values.map((raw) => (
          <div key={raw} className="grid grid-cols-2 items-center gap-3">
            <span className="truncate text-sm">{raw}</span>
            <select className={SELECT} value={chosen(raw)} onChange={(e) => onChoose(raw, e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

/** §2.5 — each "Add as new custom field" gets a Data Type; the unsupported types are listed, disabled. */
export function CustomFieldsStep({
  headers,
  types,
  onTypes,
  onBack,
  onComplete,
}: {
  headers: string[]
  types: Record<string, ImportableFieldType>
  onTypes: (next: Record<string, ImportableFieldType>) => void
  onBack: () => void
  onComplete: () => void
}) {
  const { t } = useTranslation()
  return (
    <WizardStep
      step={3}
      of={3}
      title={t('ie.fields.title')}
      subtitle={t('ie.fields.subtitle')}
      onBack={onBack}
      primary={{ label: t('ie.fields.complete'), onClick: onComplete, testId: 'fields-complete' }}
    >
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="grid grid-cols-2 border-b border-border/60 bg-card px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span>{t('ie.fields.field')}</span>
          <span>{t('ie.fields.dataType')}</span>
        </div>
        {headers.map((h) => (
          <div key={h} className="grid grid-cols-2 items-center gap-3 border-b border-border/40 px-3 py-2 last:border-0">
            <span className="truncate text-sm">{h}</span>
            <select
              className={SELECT}
              value={types[h] ?? 'text'}
              onChange={(e) => onTypes({ ...types, [h]: e.target.value as ImportableFieldType })}
              data-testid={`field-type-${h}`}
            >
              {IMPORTABLE_FIELD_TYPES.map((ft) => (
                <option key={ft.type} value={ft.type}>
                  {ft.label}
                </option>
              ))}
              <optgroup label={NOT_SUPPORTED_FOR_IMPORT}>
                {UNSUPPORTED_FIELD_TYPES.map((ft) => (
                  <option key={ft.type} value={ft.type} disabled>
                    {ft.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('ie.fields.hiddenNote')}</p>
    </WizardStep>
  )
}
