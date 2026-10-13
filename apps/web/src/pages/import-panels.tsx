import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Progress } from '@rundesk/ui'
import { AlertCircle, CheckCircle2, FileArchive, Loader2, LogIn, LogOut } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import {
  connectBasecamp,
  disconnectBasecamp,
  fetchBasecampProjects,
  fetchBasecampStatus,
  fetchImportJob,
  importConfluence,
  previewSlack,
  startBasecampImport,
  startSlackImport,
  uploadImportFile,
  type BasecampSummary,
  type ConfluenceResult,
  type SlackPreview,
  type SlackSummary,
} from '../lib/imports-api'

/**
 * Imports › **Confluence**, **Slack** and **Basecamp** (`commit-log/log-601eacc-2`):
 * the three rows of frame `12:08`'s submenu that were listed as text with a
 * reason and no control. Each is now the importer ClickUp has for it:
 *   · Confluence — the space's HTML export, made one Doc with its pages in it;
 *   · Slack — the workspace's export, its public channels into Chat;
 *   · Basecamp — signed in to, its projects and teams into Spaces or Folders.
 * Each says what it made, and links to it.
 */

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

/** A job of any importer, followed until it ends (`/import/spreadsheet/jobs/:id`). */
function useImportJob<R>(workspaceId: string, jobId: string | null, key: string) {
  return useQuery({
    queryKey: [key, workspaceId, jobId],
    queryFn: () => fetchImportJob<R>(workspaceId, jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status
      return status === 'completed' || status === 'failed' ? false : 700
    },
  })
}

function JobProgress({ job, testid }: { job: { status: string; processed: number; total: number; error: string | null } | undefined; testid: string }) {
  const { t } = useTranslation()
  if (!job || job.status === 'completed') return null
  return (
    <Card className="p-6 space-y-3" data-testid={testid} data-status={job.status}>
      {job.status === 'failed' ? (
        <ErrorLine message={job.error ?? t('import.importFailed')} testid={`${testid}-error`} />
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

// ═══ Confluence ═══════════════════════════════════════════════════════════════

export function ConfluenceImportPanel() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [made, setMade] = useState<ConfluenceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async (file: File) => {
      const fileKey = await uploadImportFile(workspaceId, file, 'confluence')
      return importConfluence(workspaceId, { fileKey })
    },
    onSuccess: (r) => {
      setError(null)
      setMade(r)
    },
    onError: (e) => {
      setMade(null)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  return (
    <Card className="p-6 space-y-4" data-testid="import-confluence-panel">
      <div>
        <h2 className="text-lg font-semibold">{t('import.confluenceTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('import.confluenceBlurb')}</p>
      </div>
      <input
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        id="import-confluence-file"
        data-testid="import-confluence-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) run.mutate(file)
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        data-testid="import-confluence-choose"
        disabled={run.isPending}
        onClick={() => document.getElementById('import-confluence-file')?.click()}
      >
        {run.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileArchive className="h-4 w-4 mr-2" />}
        {run.isPending ? t('import.importing') : t('import.confluenceChoose')}
      </Button>
      {error && <ErrorLine message={error} testid="import-confluence-error" />}
      {made && (
        <div className="space-y-2 text-sm" data-testid="import-confluence-result" data-doc-id={made.doc.id} data-pages={made.pagesImported}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-muted-foreground">{t('import.confluenceMade', { count: made.pagesImported })}</span>
            <a className="font-medium underline underline-offset-2" href={`/app/${workspaceId}/docs/${made.doc.id}`} data-testid="import-confluence-open">
              {made.doc.title}
            </a>
          </div>
          {made.missing.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="import-confluence-missing" data-count={made.missing.length}>
              {t('import.confluenceMissing', { list: made.missing.slice(0, 20).join(', ') })}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// ═══ Slack ════════════════════════════════════════════════════════════════════

export function SlackImportPanel() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [fileKey, setFileKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<SlackPreview | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState<string | null>(null)

  const read = useMutation({
    mutationFn: async (file: File) => {
      const key = await uploadImportFile(workspaceId, file, 'slack')
      return { key, preview: await previewSlack(workspaceId, key) }
    },
    onMutate: () => {
      setPreview(null)
      setJobId(null)
    },
    onSuccess: ({ key, preview: p }) => {
      setFileKey(key)
      setPreview(p)
      setChosen(new Set(p.channels.map((c) => c.name)))
    },
  })
  const start = useMutation({
    mutationFn: () => startSlackImport(workspaceId, { fileKey: fileKey!, channels: [...chosen] }),
    onSuccess: (r) => setJobId(r.jobId),
  })
  const job = useImportJob<SlackSummary>(workspaceId, jobId, 'slack-import-job').data
  const result = job?.status === 'completed' ? job.result : null
  const messages = useMemo(
    () => (preview?.channels ?? []).filter((c) => chosen.has(c.name)).reduce((n, c) => n + c.messages, 0),
    [preview, chosen],
  )

  return (
    <div className="space-y-6" data-testid="import-slack-panel">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.slackTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('import.slackBlurb')}</p>
        </div>
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          id="import-slack-file"
          data-testid="import-slack-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) read.mutate(file)
            e.target.value = ''
          }}
        />
        <Button type="button" variant="outline" data-testid="import-slack-choose" disabled={read.isPending} onClick={() => document.getElementById('import-slack-file')?.click()}>
          {read.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileArchive className="h-4 w-4 mr-2" />}
          {t('import.slackChoose')}
        </Button>
        {read.isError && <ErrorLine message={(read.error as Error).message} testid="import-slack-error" />}
      </Card>

      {preview && !jobId && (
        <Card className="p-6 space-y-4" data-testid="import-slack-preview">
          <div className="text-sm font-medium">{t('import.slackChannels')}</div>
          <ul className="divide-y rounded-md border">
            {preview.channels.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`import-slack-channel-${c.name}`}
                  checked={chosen.has(c.name)}
                  onChange={(e) => {
                    const next = new Set(chosen)
                    if (e.target.checked) next.add(c.name)
                    else next.delete(c.name)
                    setChosen(next)
                  }}
                />
                <span className="font-medium">#{c.name}</span>
                {c.archived && <span className="text-xs text-muted-foreground">{t('import.slackArchived')}</span>}
                <span className="ml-auto text-xs text-muted-foreground" data-testid={`import-slack-count-${c.name}`} data-messages={c.messages}>
                  {t('import.slackMessages', { count: c.messages, replies: c.replies })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" data-testid="import-slack-people" data-members={preview.people.members} data-total={preview.people.total}>
            {t('import.slackPeople', { members: preview.people.members, total: preview.people.total })}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="import-slack-not-imported">
            {t('import.slackNotImported', { channels: preview.notImported.privateChannels, direct: preview.notImported.directMessages })}
          </p>
          <Button data-testid="import-slack-start" className="w-full" disabled={start.isPending || chosen.size === 0} onClick={() => start.mutate()}>
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('import.slackStart', { count: messages })}
          </Button>
          {start.isError && <ErrorLine message={(start.error as Error).message} testid="import-slack-start-error" />}
        </Card>
      )}

      <JobProgress job={job} testid="import-slack-progress" />

      {result && (
        <Card className="p-6 space-y-4" data-testid="import-slack-report">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Figure testid="import-slack-r-channels" label={t('import.slackChannelsMade')} value={result.channelsCreated} />
            <Figure testid="import-slack-r-messages" label={t('import.slackMessagesMade')} value={result.messagesImported} />
            <Figure testid="import-slack-r-replies" label={t('import.slackRepliesMade')} value={result.repliesImported} />
            <Figure testid="import-slack-r-reactions" label={t('import.slackReactionsMade')} value={result.reactionsImported} />
          </div>
          <ul className="text-sm space-y-1">
            {result.channels.map((c) => (
              <li key={c.id}>
                <a className="underline underline-offset-2" href={`/app/${workspaceId}/chat?channel=${c.id}`} data-testid="import-slack-r-channel" data-channel-id={c.id}>
                  #{c.name}
                </a>{' '}
                <span className="text-muted-foreground">({c.messages})</span>
              </li>
            ))}
          </ul>
          {result.authorsNotMembers.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="import-slack-r-strangers" data-count={result.authorsNotMembers.length}>
              {t('import.slackStrangers', { list: result.authorsNotMembers.slice(0, 20).join(', ') })}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

// ═══ Basecamp ═════════════════════════════════════════════════════════════════

type Space = { id: string; name: string }

export function BasecampImportPanel({ signInError }: { signInError?: string | null }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/import' })
  const [account, setAccount] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [into, setInto] = useState<'new' | 'space'>('new')
  const [spaceId, setSpaceId] = useState<string>('')
  const [jobId, setJobId] = useState<string | null>(null)

  const status = useQuery({ queryKey: ['basecamp-import-status', workspaceId], queryFn: () => fetchBasecampStatus(workspaceId) })
  const accountId = account ?? status.data?.accounts[0]?.id ?? null
  const projects = useQuery({
    queryKey: ['basecamp-import-projects', workspaceId, accountId],
    queryFn: () => fetchBasecampProjects(workspaceId, accountId!),
    enabled: !!status.data?.connected && !!accountId,
  })
  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
    enabled: into === 'space',
  })
  const connect = useMutation({
    mutationFn: () => connectBasecamp(workspaceId),
    onSuccess: ({ authUrl }) => window.location.assign(authUrl),
  })
  const disconnect = useMutation({ mutationFn: () => disconnectBasecamp(workspaceId), onSuccess: () => status.refetch() })
  const start = useMutation({
    mutationFn: () => startBasecampImport(workspaceId, { accountId: accountId!, projectIds: [...picked], spaceId: into === 'space' ? spaceId : null }),
    onSuccess: (r) => setJobId(r.jobId),
  })
  const job = useImportJob<BasecampSummary>(workspaceId, jobId, 'basecamp-import-job').data
  const result = job?.status === 'completed' ? job.result : null

  return (
    <div className="space-y-6" data-testid="import-basecamp-panel">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('import.basecampTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('import.basecampBlurb')}</p>
        </div>
        {signInError && <ErrorLine message={signInError} testid="import-basecamp-sign-in-error" />}
        {status.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
        ) : status.isError ? (
          <ErrorLine message={(status.error as Error).message} testid="import-basecamp-status-error" />
        ) : !status.data.configured ? (
          <p className="text-sm text-muted-foreground" data-testid="import-basecamp-not-configured">
            {t('import.basecampNotConfigured', { missing: status.data.missing.join(', ') })}
          </p>
        ) : !status.data.connected ? (
          <Button data-testid="import-basecamp-connect" disabled={connect.isPending} onClick={() => connect.mutate()}>
            <LogIn className="h-4 w-4 mr-2" />
            {t('import.basecampConnect')}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="import-basecamp-connected">
            <span>{t('import.basecampSignedIn', { name: status.data.name ?? '' })}</span>
            {status.data.accounts.length > 1 && (
              <select
                data-testid="import-basecamp-account"
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={accountId ?? ''}
                onChange={(e) => {
                  setAccount(e.target.value)
                  setPicked(new Set())
                }}
              >
                {status.data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant="ghost" size="sm" data-testid="import-basecamp-disconnect" onClick={() => disconnect.mutate()}>
              <LogOut className="h-3.5 w-3.5 mr-1" />
              {t('import.basecampDisconnect')}
            </Button>
          </div>
        )}
        {connect.isError && <ErrorLine message={(connect.error as Error).message} testid="import-basecamp-connect-error" />}
      </Card>

      {status.data?.connected && !jobId && (
        <Card className="p-6 space-y-4" data-testid="import-basecamp-choose">
          <div className="text-sm font-medium">{t('import.basecampProjects')}</div>
          {projects.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
          ) : projects.isError ? (
            <ErrorLine message={(projects.error as Error).message} testid="import-basecamp-projects-error" />
          ) : (
            <ul className="divide-y rounded-md border">
              {projects.data.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    data-testid={`import-basecamp-project-${p.id}`}
                    checked={picked.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(p.id)
                      else next.delete(p.id)
                      setPicked(next)
                    }}
                  />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{t(p.kind === 'team' ? 'import.basecampTeam' : 'import.basecampProject')}</span>
                </li>
              ))}
            </ul>
          )}
          <fieldset className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="basecamp-into" data-testid="import-basecamp-into-new" checked={into === 'new'} onChange={() => setInto('new')} />
              {t('import.basecampIntoNew')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="basecamp-into" data-testid="import-basecamp-into-space" checked={into === 'space'} onChange={() => setInto('space')} />
              {t('import.basecampIntoSpace')}
            </label>
            {into === 'space' && (
              <select
                data-testid="import-basecamp-space"
                className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
              >
                <option value="">{t('import.basecampPickSpace')}</option>
                {(spaces.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
          <Button
            data-testid="import-basecamp-start"
            className="w-full"
            disabled={start.isPending || picked.size === 0 || (into === 'space' && !spaceId)}
            onClick={() => start.mutate()}
          >
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('import.basecampStart', { count: picked.size })}
          </Button>
          {start.isError && <ErrorLine message={(start.error as Error).message} testid="import-basecamp-start-error" />}
        </Card>
      )}

      <JobProgress job={job} testid="import-basecamp-progress" />

      {result && (
        <Card className="p-6 space-y-4" data-testid="import-basecamp-report">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('import.completeTitle')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Figure testid="import-basecamp-r-spaces" label={t('import.spaces')} value={result.spacesCreated} />
            <Figure testid="import-basecamp-r-folders" label={t('import.basecampFolders')} value={result.foldersCreated} />
            <Figure testid="import-basecamp-r-lists" label={t('import.lists')} value={result.listsCreated} />
            <Figure testid="import-basecamp-r-tasks" label={t('import.tasks')} value={result.tasksCreated} />
            <Figure testid="import-basecamp-r-done" label={t('import.basecampDone')} value={result.tasksDone} />
            <Figure testid="import-basecamp-r-comments" label={t('import.commentsImported')} value={result.commentsImported} />
            <Figure testid="import-basecamp-r-assignees" label={t('import.assignees')} value={result.assigneesLinked} />
            <Figure testid="import-basecamp-r-statuses" label={t('import.basecampGroups')} value={result.statusesFromGroups} />
          </div>
        </Card>
      )}
    </div>
  )
}
