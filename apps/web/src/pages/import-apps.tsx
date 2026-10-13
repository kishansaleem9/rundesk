import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Progress } from '@rundesk/ui'
import { AlertCircle, CheckCircle2, FileArchive, KeyRound, Loader2, LogIn, LogOut } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import {
  APP_KEYS,
  connectApp,
  disconnectApp,
  fetchAppPeople,
  fetchAppProjects,
  fetchApps,
  fetchAppSources,
  fetchAppStatus,
  fetchImportJob,
  saveAppToken,
  startAppImport,
  startNotionImport,
  uploadImportFile,
  type AppKey,
  type AppSummary,
} from '../lib/imports-api'

/**
 * Imports › **Asana, Jira, Monday, Notion, Todoist, Trello, Wrike**
 * (`found-13-oct/importers-by-sign-in-unbuilt`). Each is the importer ClickUp
 * has for it: the tool is signed in to (Monday's personal API token pasted;
 * Notion read from its workspace export), what to bring is chosen, with the
 * choices ClickUp's wizard offers for that tool, its people are mapped to
 * members here, and where it goes — new Spaces or one chosen. The run is
 * followed, and its report says what it made, and what does not come in.
 */

type Tile = AppKey | 'notion'
const TILES: Tile[] = ['asana', 'jira', 'monday', 'notion', 'todoist', 'trello', 'wrike']
const LABEL: Record<Tile, string> = { asana: 'Asana', jira: 'Jira', monday: 'Monday', notion: 'Notion', todoist: 'Todoist', trello: 'Trello', wrike: 'Wrike' }
type Space = { id: string; name: string }

function ErrorLine({ message, testid }: { message: string; testid: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm" data-testid={testid} role="alert">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}

function Figure({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <div className="rounded-md border p-3" data-testid={testid} data-value={value}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

function useJob(workspaceId: string, jobId: string | null) {
  return useQuery({
    queryKey: ['app-import-job', workspaceId, jobId],
    queryFn: () => fetchImportJob<AppSummary>(workspaceId, jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status
      return status === 'completed' || status === 'failed' ? false : 700
    },
  }).data
}

/** Where a run goes: new Spaces, or one Space chosen. */
function Placement({ into, setInto, spaceId, setSpaceId }: { into: 'new' | 'space'; setInto: (v: 'new' | 'space') => void; spaceId: string; setSpaceId: (v: string) => void }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const spaces = useQuery({ queryKey: ['spaces', workspaceId], queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`), enabled: into === 'space' })
  return (
    <fieldset className="space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="radio" name="app-into" data-testid="import-app-into-new" checked={into === 'new'} onChange={() => setInto('new')} />
        {t('import.appIntoNew')}
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name="app-into" data-testid="import-app-into-space" checked={into === 'space'} onChange={() => setInto('space')} />
        {t('import.appIntoSpace')}
      </label>
      {into === 'space' && (
        <select data-testid="import-app-space" className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
          <option value="">{t('import.appPickSpace')}</option>
          {(spaces.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  )
}

function Report({ result, label }: { result: AppSummary; label: string }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  return (
    <Card className="p-6 space-y-4" data-testid="import-app-report" data-source={result.source}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        {t('import.completeTitle')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure testid="import-app-r-spaces" label={t('import.spaces')} value={result.spacesCreated} />
        <Figure testid="import-app-r-folders" label={t('import.appFolders')} value={result.foldersCreated} />
        <Figure testid="import-app-r-lists" label={t('import.lists')} value={result.listsCreated} />
        <Figure testid="import-app-r-tasks" label={t('import.tasks')} value={result.tasksCreated} />
        <Figure testid="import-app-r-subtasks" label={t('import.appSubtasks')} value={result.subtasksCreated} />
        <Figure testid="import-app-r-done" label={t('import.appDone')} value={result.tasksDone} />
        <Figure testid="import-app-r-comments" label={t('import.commentsImported')} value={result.commentsImported} />
        <Figure testid="import-app-r-files" label={t('import.appAttachments')} value={result.attachmentsImported} />
        <Figure testid="import-app-r-assignees" label={t('import.assignees')} value={result.assigneesLinked} />
        <Figure testid="import-app-r-tags" label={t('import.appTags')} value={result.tagsApplied} />
        <Figure testid="import-app-r-checklists" label={t('import.appChecklists')} value={result.checklistsImported} />
        <Figure testid="import-app-r-fields" label={t('import.appFields')} value={result.fieldValuesSet} />
        {result.pagesImported !== undefined && <Figure testid="import-app-r-pages" label={t('import.appPages')} value={result.pagesImported} />}
      </div>
      {result.made.lists.length > 0 && (
        <ul className="text-sm space-y-1" data-testid="import-app-r-made">
          {result.made.lists.map((l) => (
            <li key={l.id}>
              <a className="underline underline-offset-2" href={`/app/${workspaceId}/list/${l.id}`} data-testid="import-app-r-list" data-list-id={l.id}>
                {l.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      {(result.docs ?? []).length > 0 && (
        <ul className="text-sm space-y-1" data-testid="import-app-r-docs">
          {(result.docs ?? []).map((d) => (
            <li key={d.id}>
              <a className="underline underline-offset-2" href={`/app/${workspaceId}/docs/${d.id}`} data-testid="import-app-r-doc" data-doc-id={d.id}>
                {d.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {result.notImported.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="import-app-r-not-imported">
          {t('import.appNotImported', { app: label, list: result.notImported.join(' · ') })}
        </p>
      )}
      {result.errors.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-5" data-testid="import-app-r-errors" data-count={result.errors.length}>
          {result.errors.slice(0, 20).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Progressing({ job }: { job: ReturnType<typeof useJob> }) {
  const { t } = useTranslation()
  if (!job || job.status === 'completed') return null
  return (
    <Card className="p-6 space-y-3" data-testid="import-app-progress" data-status={job.status}>
      {job.status === 'failed' ? (
        <ErrorLine message={job.error ?? t('import.importFailed')} testid="import-app-progress-error" />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('import.progressTitle')}
          </div>
          <Progress value={job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0} />
        </>
      )}
    </Card>
  )
}

/** One tool, signed in to, chosen from, mapped and imported. */
function AppFlow({ app, signInError }: { app: AppKey; signInError: string | null }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [token, setToken] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [options, setOptions] = useState<Record<string, string>>({})
  const [mapped, setMapped] = useState<Record<string, string | null>>({})
  const [into, setInto] = useState<'new' | 'space'>('new')
  const [spaceId, setSpaceId] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const status = useQuery({ queryKey: ['app-import-status', workspaceId, app], queryFn: () => fetchAppStatus(workspaceId, app) })
  const sources = useQuery({ queryKey: ['app-import-sources', workspaceId, app], queryFn: () => fetchAppSources(workspaceId, app), enabled: !!status.data?.connected })
  const sourceId = source ?? sources.data?.[0]?.id ?? null
  const projects = useQuery({
    queryKey: ['app-import-projects', workspaceId, app, sourceId],
    queryFn: () => fetchAppProjects(workspaceId, app, sourceId!),
    enabled: !!status.data?.connected && !!sourceId,
  })
  const pickedList = useMemo(() => [...picked].sort(), [picked])
  const people = useQuery({
    queryKey: ['app-import-people', workspaceId, app, sourceId, pickedList.join(',')],
    queryFn: () => fetchAppPeople(workspaceId, app, sourceId!, pickedList),
    enabled: !!status.data?.connected && !!sourceId && pickedList.length > 0,
  })

  // Trello hands its token back to this page, in the address's fragment: given to the server, and taken off the address.
  const fromTrello = useMutation({
    mutationFn: (value: string) => saveAppToken(workspaceId, app, value),
    onSuccess: () => status.refetch(),
    onError: (e) => setTokenError(e instanceof Error ? e.message : String(e)),
  })
  useEffect(() => {
    if (app !== 'trello' || typeof window === 'undefined') return
    const handed = /[#&]token=([^&]+)/.exec(window.location.hash)?.[1]
    if (!handed) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    fromTrello.mutate(decodeURIComponent(handed))
    // Once, on the way back from Trello.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app])

  const connect = useMutation({ mutationFn: () => connectApp(workspaceId, app), onSuccess: ({ authUrl }) => window.location.assign(authUrl) })
  const paste = useMutation({
    mutationFn: () => saveAppToken(workspaceId, app, token),
    onSuccess: () => {
      setToken('')
      setTokenError(null)
      void status.refetch()
    },
    onError: (e) => setTokenError(e instanceof Error ? e.message : String(e)),
  })
  const disconnect = useMutation({ mutationFn: () => disconnectApp(workspaceId, app), onSuccess: () => status.refetch() })
  const chosenOptions = Object.fromEntries((status.data?.options ?? []).map((o) => [o.key, options[o.key] ?? o.default]))
  const peopleMap = Object.fromEntries((people.data?.people ?? []).map((p) => [p.key, p.key in mapped ? mapped[p.key] : p.match]))
  const start = useMutation({
    mutationFn: () =>
      startAppImport(workspaceId, app, { source: sourceId!, projectIds: pickedList, spaceId: into === 'space' ? spaceId : null, options: chosenOptions, people: peopleMap }),
    onSuccess: (r) => setJobId(r.jobId),
  })
  const job = useJob(workspaceId, jobId)
  const result = job?.status === 'completed' ? job.result : null
  const label = LABEL[app]

  return (
    <div className="space-y-6" data-testid="import-app-panel" data-app={app}>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.appTitle', { app: label })}</h2>
          <p className="text-sm text-muted-foreground mt-1" data-testid="import-app-blurb">
            {t(`import.appBlurb.${app}` as 'import.appBlurb.asana')}
          </p>
        </div>
        {signInError && <ErrorLine message={signInError} testid="import-app-sign-in-error" />}
        {status.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
        ) : status.isError ? (
          <ErrorLine message={(status.error as Error).message} testid="import-app-status-error" />
        ) : !status.data.configured ? (
          <p className="text-sm text-muted-foreground" data-testid="import-app-not-configured">
            {t('import.appNotConfigured', { app: label, missing: status.data.missing.join(', ') })}
          </p>
        ) : !status.data.connected ? (
          status.data.auth === 'token' ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (token.trim()) paste.mutate()
              }}
            >
              <label className="text-sm font-medium" htmlFor="import-app-token">
                {t('import.appTokenLabel', { app: label })}
              </label>
              <div className="flex gap-2">
                <Input id="import-app-token" type="password" autoComplete="off" data-testid="import-app-token" value={token} onChange={(e) => setToken(e.target.value)} />
                <Button type="submit" data-testid="import-app-token-save" disabled={paste.isPending || !token.trim()}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  {t('import.appTokenSave')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('import.appTokenHelp')}</p>
            </form>
          ) : (
            <Button data-testid="import-app-connect" disabled={connect.isPending || fromTrello.isPending} onClick={() => connect.mutate()}>
              <LogIn className="h-4 w-4 mr-2" />
              {t('import.appSignIn', { app: label })}
            </Button>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="import-app-connected">
            <span>{t('import.appSignedIn', { app: label, name: status.data.name ?? '' })}</span>
            <Button variant="ghost" size="sm" data-testid="import-app-disconnect" onClick={() => disconnect.mutate()}>
              <LogOut className="h-3.5 w-3.5 mr-1" />
              {t('import.appSignOut')}
            </Button>
          </div>
        )}
        {connect.isError && <ErrorLine message={(connect.error as Error).message} testid="import-app-connect-error" />}
        {tokenError && <ErrorLine message={tokenError} testid="import-app-token-error" />}
      </Card>

      {status.data?.connected && !jobId && (
        <Card className="p-6 space-y-4" data-testid="import-app-choose">
          {(sources.data?.length ?? 0) > 1 && (
            <label className="block text-sm space-y-1">
              <span className="font-medium">{t('import.appSource')}</span>
              <select
                data-testid="import-app-source"
                className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={sourceId ?? ''}
                onChange={(e) => {
                  setSource(e.target.value)
                  setPicked(new Set())
                }}
              >
                {(sources.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="text-sm font-medium">{t('import.appProjects')}</div>
          {sources.isError ? (
            <ErrorLine message={(sources.error as Error).message} testid="import-app-projects-error" />
          ) : projects.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
          ) : projects.isError ? (
            <ErrorLine message={(projects.error as Error).message} testid="import-app-projects-error" />
          ) : projects.data.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="import-app-nothing">
              {t('import.appNothing')}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {projects.data.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    data-testid={`import-app-project-${p.id}`}
                    checked={picked.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(p.id)
                      else next.delete(p.id)
                      setPicked(next)
                    }}
                  />
                  <span className="font-medium">{p.name}</span>
                  {p.detail && <span className="text-xs text-muted-foreground">{p.detail}</span>}
                </li>
              ))}
            </ul>
          )}

          {(status.data.options ?? []).map((o) => (
            <fieldset key={o.key} className="space-y-1 text-sm" data-testid={`import-app-option-${o.key}`}>
              <legend className="font-medium">{t(`import.appOption.${o.key}` as 'import.appOption.sections')}</legend>
              {o.choices.map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`app-option-${o.key}`}
                    data-testid={`import-app-option-${o.key}-${c}`}
                    checked={(options[o.key] ?? o.default) === c}
                    onChange={() => setOptions({ ...options, [o.key]: c })}
                  />
                  {t(`import.appOption.${o.key}.${c}` as 'import.appOption.sections.statuses')}
                </label>
              ))}
            </fieldset>
          ))}

          {picked.size > 0 && (
            <div className="space-y-2" data-testid="import-app-people">
              <div className="text-sm font-medium">{t('import.appPeople')}</div>
              <p className="text-xs text-muted-foreground">{t('import.appPeopleHelp', { app: label })}</p>
              {people.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
              ) : people.isError ? (
                <ErrorLine message={(people.error as Error).message} testid="import-app-people-error" />
              ) : (
                <ul className="divide-y rounded-md border">
                  {people.data.people.map((p) => (
                    <li key={p.key} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid={`import-app-person-${p.key}`}>
                      <span className="min-w-0 flex-1 truncate">
                        {p.name ?? p.email ?? p.key}
                        {p.email && <span className="ml-2 text-xs text-muted-foreground">{p.email}</span>}
                      </span>
                      <select
                        data-testid={`import-app-person-select-${p.key}`}
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                        value={(p.key in mapped ? mapped[p.key] : p.match) ?? ''}
                        onChange={(e) => setMapped({ ...mapped, [p.key]: e.target.value || null })}
                      >
                        <option value="">{t('import.appNobody')}</option>
                        {people.data.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Placement into={into} setInto={setInto} spaceId={spaceId} setSpaceId={setSpaceId} />
          <Button
            data-testid="import-app-start"
            className="w-full"
            disabled={start.isPending || picked.size === 0 || (into === 'space' && !spaceId) || people.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('import.appStart', { count: picked.size })}
          </Button>
          {start.isError && <ErrorLine message={(start.error as Error).message} testid="import-app-start-error" />}
          {status.data.notImported.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="import-app-not-imported">
              {t('import.appNotImported', { app: label, list: status.data.notImported.join(' · ') })}
            </p>
          )}
        </Card>
      )}

      <Progressing job={job} />
      {result && <Report result={result} label={label} />}
    </div>
  )
}

/** Notion, from its workspace export, as ClickUp imports it. */
function NotionFlow() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [into, setInto] = useState<'new' | 'space'>('new')
  const [spaceId, setSpaceId] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const run = useMutation({
    mutationFn: async (file: File) => {
      const fileKey = await uploadImportFile(workspaceId, file, 'notion')
      return startNotionImport(workspaceId, { fileKey, spaceId: into === 'space' ? spaceId : null })
    },
    onMutate: () => setJobId(null),
    onSuccess: (r) => setJobId(r.jobId),
  })
  const job = useJob(workspaceId, jobId)
  const result = job?.status === 'completed' ? job.result : null
  return (
    <div className="space-y-6" data-testid="import-app-panel" data-app="notion">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.appTitle', { app: 'Notion' })}</h2>
          <p className="text-sm text-muted-foreground mt-1" data-testid="import-app-blurb">
            {t('import.appBlurb.notion')}
          </p>
        </div>
        <Placement into={into} setInto={setInto} spaceId={spaceId} setSpaceId={setSpaceId} />
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          id="import-notion-file"
          data-testid="import-notion-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) run.mutate(file)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          data-testid="import-notion-choose"
          disabled={run.isPending || (into === 'space' && !spaceId)}
          onClick={() => document.getElementById('import-notion-file')?.click()}
        >
          {run.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileArchive className="h-4 w-4 mr-2" />}
          {run.isPending ? t('import.importing') : t('import.notionChoose')}
        </Button>
        {run.isError && <ErrorLine message={(run.error as Error).message} testid="import-notion-error" />}
      </Card>
      <Progressing job={job} />
      {result && <Report result={result} label="Notion" />}
    </div>
  )
}

export function AppsImportPanel({ landing }: { landing: { app: string | null; error: string | null } }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const first = TILES.includes(landing.app as Tile) ? (landing.app as Tile) : null
  const [chosen, setChosen] = useState<Tile | null>(first)
  const catalogue = useQuery({ queryKey: ['app-import-catalogue', workspaceId], queryFn: () => fetchApps(workspaceId) })
  const connected = new Set((catalogue.data ?? []).filter((a) => a.connected).map((a) => a.key))
  return (
    <div className="space-y-6" data-testid="import-apps">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.appsTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('import.appsBlurb')}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TILES.map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`import-app-${key}`}
              data-active={chosen === key ? 'true' : 'false'}
              data-connected={key !== 'notion' && connected.has(key as AppKey) ? 'true' : 'false'}
              onClick={() => setChosen(key)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${chosen === key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
            >
              <span className="font-medium">{LABEL[key]}</span>
              {key !== 'notion' && connected.has(key as AppKey) && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-500" />}
            </button>
          ))}
        </div>
      </Card>
      {chosen === 'notion' ? <NotionFlow /> : chosen && (APP_KEYS as string[]).includes(chosen) ? <AppFlow key={chosen} app={chosen as AppKey} signInError={chosen === first ? landing.error : null} /> : null}
    </div>
  )
}
