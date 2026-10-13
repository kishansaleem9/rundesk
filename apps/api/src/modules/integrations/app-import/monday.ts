import { AppError, AppHttp, dateOf } from './app-http'
import { doneLike, person, setting, type AppDef, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImFieldValue, type ImNode, type ImPerson, type ImStatus, type ImTask } from './import-tree'

/**
 * MONDAY.COM, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp asks for Monday's PERSONAL API TOKEN — "authorize ClickUp to import
 * your items on Monday.com by copying the Personal API Token and inputting it
 * into ClickUp" — or, for someone who is not an admin there, their own API
 * token, which imports only what they can see. Each board comes in as a List,
 * into a new Space or one chosen; its STATUSES are the board's GROUPS or its
 * STATUS COLUMN, as the importer chooses. Dependencies, timelines, formulas,
 * mirrors, tags and most attachments do not come in. (Help centre, "Import
 * from Monday.com", read through search excerpts, 13 October.)
 *
 * Over Monday's GraphQL API (developer.monday.com, `api.monday.com/v2`): `me`
 * and its account, `users`, `boards` (paged), a board's `columns`, `groups`
 * and `items_page` with `next_items_page` by cursor; an item's
 * `column_values`, `subitems` and `updates` — its conversation, which comes in
 * as its comments.
 */

const apiUrl = () => setting('MONDAY_API_URL', 'https://api.monday.com/v2')
const VERSION = '2024-10'

type McValue = { id: string; type?: string; text?: string | null; value?: string | null }
type McItem = {
  id: string
  name?: string
  created_at?: string
  state?: string
  group?: { id?: string }
  column_values?: McValue[]
  subitems?: Array<{ id: string; name?: string; created_at?: string; column_values?: McValue[] }>
  updates?: Array<{ id: string; text_body?: string; created_at?: string; creator?: { id?: string; name?: string; email?: string } | null }>
}
type McColumn = { id: string; title: string; type: string; settings_str?: string }

const ITEM = `id name created_at state group { id } column_values { id type text value }
  subitems { id name created_at column_values { id type text value } }
  updates(limit: 100) { id text_body created_at creator { id name email } }`

/** Columns that do not come in, as ClickUp's import leaves them; and those read elsewhere (people, the date, the status). */
const SKIPPED = new Set([
  'name', 'people', 'multiple-person', 'subtasks', 'subitems', 'file', 'formula', 'mirror', 'lookup', 'board_relation', 'board-relation', 'dependency',
  'timeline', 'timerange', 'tags', 'tag', 'auto_number', 'creation_log', 'last_updated', 'item_id', 'button', 'color_picker', 'progress', 'vote',
  'time_tracking', 'doc', 'direct_doc', 'integration', 'world_clock',
])

const parse = (raw: string | null | undefined): Record<string, any> => {
  try {
    return raw ? (JSON.parse(raw) as Record<string, any>) : {}
  } catch {
    return {}
  }
}

/** A status column's labels in their order, and which of them mean done. */
function statusLabels(c: McColumn | undefined): ImStatus[] {
  if (!c) return []
  const s = parse(c.settings_str)
  const labels = (s.labels ?? {}) as Record<string, string>
  const done = new Set<number>((s.done_colors ?? []) as number[])
  return Object.entries(labels)
    .sort(([a], [b]) => Number(a) - Number(b))
    .filter(([, name]) => typeof name === 'string' && name.trim())
    .map(([i, name]) => ({ name, category: done.has(Number(i)) || doneLike(name) ? 'closed' : 'open' }))
}

export const MONDAY: AppDef = {
  key: 'monday',
  label: 'Monday',
  icon: '📅',
  auth: 'token',
  env: [],
  options: [{ key: 'statuses', choices: ['groups', 'column'], default: 'groups' }],
  notImported: ['Dependencies, timelines, formulas, mirrors and tags, as ClickUp’s Monday import leaves them', 'Files in a board’s file columns and updates'],
  identify: async (token: GrantToken) => {
    const me = await gql<{ me?: { id?: string; name?: string; email?: string; account?: { name?: string } } }>(token.accessToken, '{ me { id name email account { name } } }')
    return { name: me.me?.name || me.me?.email || 'Monday', email: me.me?.email ?? null, account: { id: me.me?.id ?? null, accountName: me.me?.account?.name ?? 'Monday' } }
  },
  reader: (grant) => new MondayReader(grant.accessToken, grant.account),
}

/** One GraphQL question; Monday's own errors said in its words. */
async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const http = new AppHttp('Monday', [apiUrl()], { Authorization: token, 'API-Version': VERSION })
  const body = await http.json<{ data?: T; errors?: Array<{ message?: string }>; error_message?: string }>(apiUrl(), {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
    headers: { 'Content-Type': 'application/json' },
  })
  const error = body.errors?.[0]?.message ?? body.error_message
  if (error) throw new AppError(`Monday said: ${error}`, /token|auth/i.test(error) ? 401 : 502)
  return body.data as T
}

class MondayReader implements AppReader {
  constructor(
    private readonly token: string,
    private readonly account: Record<string, unknown>,
  ) {}

  async sources() {
    return [{ id: 'monday', name: String(this.account.accountName ?? 'Monday') }]
  }

  async projects(): Promise<AppProject[]> {
    const out: AppProject[] = []
    for (let page = 1; page < 100; page++) {
      const body = await gql<{ boards?: Array<{ id: string; name: string; type?: string; workspace?: { name?: string } | null }> }>(
        this.token,
        'query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name type workspace { name } } }',
        { page },
      )
      const rows = body.boards ?? []
      for (const b of rows) if (!b.type || b.type === 'board') out.push({ id: String(b.id), name: b.name, detail: b.workspace?.name ?? 'Main workspace' })
      if (rows.length < 100) break
    }
    return out
  }

  async people() {
    const body = await gql<{ users?: Array<{ id: string; name?: string; email?: string }> }>(this.token, '{ users(limit: 1000) { id name email } }')
    return (body.users ?? []).map((u) => person('monday', u.id, u.name, u.email))
  }

  async read(_source: string, board: AppProject, options: Record<string, string>): Promise<ImNode> {
    const first = await gql<{ boards?: Array<{ name: string; columns?: McColumn[]; groups?: Array<{ id: string; title: string; position?: string }>; items_page?: { cursor?: string | null; items?: McItem[] } }> }>(
      this.token,
      `query ($ids: [ID!]) { boards(ids: $ids) { name columns { id title type settings_str } groups { id title position } items_page(limit: 100) { cursor items { ${ITEM} } } } }`,
      { ids: [board.id] },
    )
    const b = first.boards?.[0]
    if (!b) throw new AppError('Monday has no such board, or it is not one this token opens')
    const items: McItem[] = [...(b.items_page?.items ?? [])]
    let cursor = b.items_page?.cursor ?? null
    for (let page = 0; cursor && page < 500; page++) {
      const next = await gql<{ next_items_page?: { cursor?: string | null; items?: McItem[] } }>(
        this.token,
        `query ($cursor: String!) { next_items_page(limit: 100, cursor: $cursor) { cursor items { ${ITEM} } } }`,
        { cursor },
      )
      items.push(...(next.next_items_page?.items ?? []))
      cursor = next.next_items_page?.cursor ?? null
    }
    const people = new Map((await this.people()).map((p) => [p.key, p]))
    const columns = b.columns ?? []
    const statusColumn = columns.find((c) => c.type === 'status' || c.type === 'color')
    const dateColumn = columns.find((c) => c.type === 'date')
    const groups = [...(b.groups ?? [])].sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0))
    const groupName = new Map(groups.map((g) => [g.id, g.title]))
    const byColumn = options.statuses === 'column' && !!statusColumn
    const statuses: ImStatus[] = byColumn ? statusLabels(statusColumn) : groups.map((g) => ({ name: g.title, category: doneLike(g.title) ? 'closed' : 'open' }))
    const closedNames = new Set(statuses.filter((s) => s.category === 'closed').map((s) => s.name.toLowerCase()))
    const columnOf = new Map(columns.map((c) => [c.id, c]))

    const valueOf = (item: { column_values?: McValue[] }, id: string | undefined) => (id ? item.column_values?.find((v) => v.id === id) : undefined)
    const assignees = (values: McValue[] | undefined): ImPerson[] =>
      (values ?? [])
        .filter((v) => v.type === 'people' || v.type === 'multiple-person' || columnOf.get(v.id)?.type === 'people')
        .flatMap((v) => (parse(v.value).personsAndTeams ?? []) as Array<{ id: number; kind?: string }>)
        .filter((p) => p.kind !== 'team')
        .map((p) => people.get(`monday:${p.id}`) ?? person('monday', p.id, null, null))
    const fields = (item: McItem): ImFieldValue[] => {
      const out: ImFieldValue[] = []
      for (const v of item.column_values ?? []) {
        const c = columnOf.get(v.id)
        const type = c?.type ?? v.type ?? ''
        // The status column is the statuses when they come from it; else it is kept as a field, as the board's other columns are.
        if (!c || SKIPPED.has(type) || (byColumn && c === statusColumn) || c === dateColumn || !(v.text ?? '').trim()) continue
        const text = (v.text ?? '').trim()
        if (type === 'numbers' || type === 'numeric' || type === 'rating') out.push({ name: c.title, type: 'number', value: Number(text) })
        else if (type === 'checkbox') out.push({ name: c.title, type: 'checkbox', value: parse(v.value).checked === true || parse(v.value).checked === 'true' })
        else if (type === 'date') out.push({ name: c.title, type: 'date', value: parse(v.value).date ?? text })
        else if (type === 'link') out.push({ name: c.title, type: 'url', value: parse(v.value).url ?? text })
        else if (type === 'status' || type === 'color') out.push({ name: c.title, type: 'dropdown', value: text, options: statusLabels(c).map((s) => s.name) })
        else out.push({ name: c.title, type: 'text', value: text })
      }
      return out
    }
    const due = (item: McItem) => {
      const v = parse(valueOf(item, dateColumn?.id)?.value)
      return { at: dateOf(v.date && v.time ? `${v.date}T${v.time}Z` : v.date), time: !!v.time }
    }
    const task = (item: McItem): ImTask => {
      const status = byColumn ? (valueOf(item, statusColumn!.id)?.text ?? null) : (item.group?.id ? groupName.get(item.group.id) ?? null : null)
      const d = due(item)
      return imTask(item.id, item.name ?? '', {
        status,
        done: !!status && closedNames.has(status.toLowerCase()),
        due: d.at,
        dueHasTime: d.time,
        created: dateOf(item.created_at),
        assignees: assignees(item.column_values),
        fields: fields(item),
        subtasks: (item.subitems ?? []).map((s) => {
          const own = (s.column_values ?? []).find((v) => v.type === 'status' || v.type === 'color')?.text ?? null
          return imTask(s.id, s.name ?? '', { done: doneLike(own), created: dateOf(s.created_at), assignees: assignees(s.column_values) })
        }),
        details: async () => ({
          comments: (item.updates ?? [])
            .map((u) => ({ author: u.creator?.id ? person('monday', u.creator.id, u.creator.name, u.creator.email) : null, text: u.text_body ?? '', at: dateOf(u.created_at) }))
            .sort((x, y) => (x.at?.getTime() ?? 0) - (y.at?.getTime() ?? 0)),
          files: [],
        }),
      })
    }
    return { kind: 'list', list: { name: b.name, statuses, tasks: items.filter((i) => i.state !== 'deleted' && i.state !== 'archived').map(task) } }
  }
}
