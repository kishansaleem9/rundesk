import { AppHttp, dateOf } from './app-http'
import { doneLike, person, setting, type AppDef, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImComment, type ImFieldValue, type ImNode, type ImPerson, type ImTask } from './import-tree'

/**
 * TRELLO, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp signs in to Trello and imports a board "as a new Folder", into a new
 * Space or one chosen. Its columns come in, as the importer chooses, as
 * STATUSES — "Your Board will be imported as a new Folder with a List titled
 * Imported from Trello" — or as LISTS of their own. Assignees, attachments,
 * comments, checklists, tags and custom fields come with the cards; "importing
 * of cover images is not supported"; a member not mapped to a person here is
 * not kept as an assignee. (Help centre, "Import from Trello", read through
 * search excerpts, 13 October.)
 *
 * Over Trello's own API (developer.atlassian.com/cloud/trello): the person
 * authorizes the application at `1/authorize`, which hands the token back in
 * the address's fragment — so the import page reads it there and gives it to
 * this server, never through a query a log could keep. Each request carries
 * it in an `OAuth` Authorization header. A board's `lists`, its open `cards`
 * with their checklists, attachments and custom field items, its
 * `customFields`, `members` and `commentCard` actions (paged by `before`). A
 * card's id says when it was made: its first eight hex digits are the second.
 */

const authorizeBase = () => setting('TRELLO_AUTHORIZE_URL', 'https://trello.com/1/authorize')
const apiUrl = () => setting('TRELLO_API_URL', 'https://api.trello.com/1')
/** An uploaded file is fetched from trello.com itself, with the same header. */
const fileOrigin = () => setting('TRELLO_FILE_ORIGIN', 'https://trello.com')

const header = (token: string) => ({ Authorization: `OAuth oauth_consumer_key="${process.env.TRELLO_API_KEY ?? ''}", oauth_token="${token}"` })

type TrCard = {
  id: string
  name?: string
  desc?: string
  due?: string | null
  dueComplete?: boolean
  start?: string | null
  idList?: string
  idMembers?: string[]
  labels?: Array<{ name?: string; color?: string }>
  pos?: number
  checklists?: Array<{ name?: string; pos?: number; checkItems?: Array<{ name?: string; state?: string; pos?: number }> }>
  attachments?: Array<{ id: string; name?: string; url?: string; bytes?: number | null; isUpload?: boolean }>
  customFieldItems?: Array<{ idCustomField?: string; idValue?: string | null; value?: Record<string, string> | null }>
}
type TrField = { id: string; name: string; type: string; options?: Array<{ id: string; value?: { text?: string } }> }

export const TRELLO: AppDef = {
  key: 'trello',
  label: 'Trello',
  icon: '📋',
  auth: 'trello',
  env: ['TRELLO_API_KEY'],
  options: [{ key: 'columns', choices: ['statuses', 'lists'], default: 'statuses' }],
  notImported: ['Cover images, as ClickUp’s Trello import leaves them', 'Archived cards and lists', 'Power-Ups'],
  /** Where the person authorizes the application; Trello comes back to the import page with the token in the fragment. */
  authorizeUrl: (returnUrl) =>
    `${authorizeBase()}?${new URLSearchParams({
      expiration: 'never',
      name: 'Rundesk',
      scope: 'read',
      response_type: 'token',
      key: process.env.TRELLO_API_KEY ?? '',
      callback_method: 'fragment',
      return_url: returnUrl,
    }).toString()}`,
  identify: async (token: GrantToken) => {
    const http = new AppHttp('Trello', [apiUrl()], header(token.accessToken))
    const me = await http.json<{ id?: string; fullName?: string; username?: string; email?: string | null }>(`${apiUrl()}/members/me?fields=fullName,username,email`)
    return { name: me.fullName || me.username || 'Trello', email: me.email ?? null, account: { id: me.id ?? null, username: me.username ?? null } }
  },
  reader: (grant) => new TrelloReader(grant.accessToken),
}

class TrelloReader implements AppReader {
  private readonly http: AppHttp

  constructor(token: string) {
    this.http = new AppHttp('Trello', [apiUrl(), fileOrigin()], header(token))
  }

  async sources() {
    const orgs = await this.http.json<Array<{ id: string; displayName?: string; name?: string }>>(`${apiUrl()}/members/me/organizations?fields=displayName,name`)
    return [...orgs.map((o) => ({ id: o.id, name: o.displayName || o.name || o.id })), { id: 'me', name: 'Boards outside a Workspace' }]
  }

  async projects(org: string): Promise<AppProject[]> {
    const boards =
      org === 'me'
        ? (await this.http.json<Array<{ id: string; name: string; idOrganization?: string | null }>>(`${apiUrl()}/members/me/boards?filter=open&fields=name,idOrganization`)).filter((b) => !b.idOrganization)
        : await this.http.json<Array<{ id: string; name: string }>>(`${apiUrl()}/organizations/${encodeURIComponent(org)}/boards?filter=open&fields=name`)
    return boards.map((b) => ({ id: b.id, name: b.name }))
  }

  async people(_org: string, boards: string[]) {
    const seen = new Map<string, ImPerson>()
    for (const b of boards) {
      for (const m of await this.members(b)) seen.set(m.key, m)
    }
    return [...seen.values()]
  }

  private async members(board: string): Promise<ImPerson[]> {
    const rows = await this.http.json<Array<{ id: string; fullName?: string; username?: string }>>(`${apiUrl()}/boards/${encodeURIComponent(board)}/members?fields=fullName,username`)
    return rows.map((m) => person('trello', m.id, m.fullName || m.username, null))
  }

  async read(_org: string, board: AppProject, options: Record<string, string>): Promise<ImNode> {
    const b = encodeURIComponent(board.id)
    const columns = (await this.http.json<Array<{ id: string; name: string; pos?: number }>>(`${apiUrl()}/boards/${b}/lists?filter=open&fields=name,pos`)).sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0))
    const cards = await this.http.json<TrCard[]>(
      `${apiUrl()}/boards/${b}/cards/open?${new URLSearchParams({
        fields: 'name,desc,due,dueComplete,start,idList,idMembers,labels,pos',
        checklists: 'all',
        attachments: 'true',
        attachment_fields: 'name,url,bytes,isUpload',
        customFieldItems: 'true',
      }).toString()}`,
    )
    const fields = await this.http.json<TrField[]>(`${apiUrl()}/boards/${b}/customFields`)
    const people = new Map((await this.members(board.id)).map((p) => [p.key, p]))
    const comments = await this.comments(board.id)

    const fieldOf = new Map(fields.map((f) => [f.id, f]))
    const columnOf = new Map(columns.map((c) => [c.id, c]))
    const byStatus = options.columns !== 'lists'
    const task = (c: TrCard): ImTask => {
      const column = c.idList ? columnOf.get(c.idList) : undefined
      const links = (c.attachments ?? []).filter((a) => !a.isUpload && a.url)
      const description = [c.desc?.trim() ?? '', links.length ? `Links:\n${links.map((a) => `- [${a.name || a.url}](${a.url})`).join('\n')}` : ''].filter(Boolean).join('\n\n')
      return imTask(c.id, c.name ?? '', {
        description: description || null,
        status: byStatus ? column?.name ?? null : null,
        done: c.dueComplete === true || (byStatus && doneLike(column?.name)),
        due: dateOf(c.due),
        dueHasTime: !!c.due,
        start: dateOf(c.start),
        created: /^[0-9a-f]{8}/i.test(c.id) ? new Date(parseInt(c.id.slice(0, 8), 16) * 1000) : null,
        assignees: (c.idMembers ?? []).map((id) => people.get(`trello:${id}`) ?? person('trello', id, null, null)),
        tags: (c.labels ?? []).map((l) => l.name || l.color || '').filter(Boolean),
        checklists: (c.checklists ?? [])
          .sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0))
          .map((cl) => ({
            name: cl.name ?? 'Checklist',
            items: (cl.checkItems ?? []).sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0)).map((it) => ({ name: it.name ?? '', done: it.state === 'complete' })),
          })),
        fields: (c.customFieldItems ?? []).map((item) => fieldValue(item, fieldOf)).filter((v): v is ImFieldValue => !!v),
        details: async () => ({
          comments: comments.get(c.id) ?? [],
          files: (c.attachments ?? [])
            .filter((a) => a.isUpload && a.url)
            .map((a) => ({ name: a.name ?? 'file', size: a.bytes ?? null, fetch: () => this.http.file(a.url!) })),
        }),
      })
    }
    const ordered = [...cards].sort((x, y) => {
      const cx = columns.findIndex((c) => c.id === x.idList)
      const cy = columns.findIndex((c) => c.id === y.idList)
      return cx - cy || (x.pos ?? 0) - (y.pos ?? 0)
    })
    if (byStatus) {
      return {
        kind: 'folder',
        folder: {
          name: board.name,
          lists: [{ name: 'Imported from Trello', statuses: columns.map((c) => ({ name: c.name, category: doneLike(c.name) ? ('closed' as const) : ('open' as const) })), tasks: ordered.map(task) }],
        },
      }
    }
    return {
      kind: 'folder',
      folder: { name: board.name, lists: columns.map((col) => ({ name: col.name, statuses: null, tasks: ordered.filter((c) => c.idList === col.id).map(task) })) },
    }
  }

  /** The board's comments, card by card, oldest first: every page, by `before`, newest first as Trello lists them. */
  private async comments(board: string): Promise<Map<string, ImComment[]>> {
    const out = new Map<string, ImComment[]>()
    let before: string | null = null
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ filter: 'commentCard', limit: '1000', fields: 'data,date,idMemberCreator', memberCreator: 'true', memberCreator_fields: 'fullName,username' })
      if (before) q.set('before', before)
      const rows = await this.http.json<Array<{ id: string; date?: string; data?: { text?: string; card?: { id?: string } }; idMemberCreator?: string; memberCreator?: { fullName?: string; username?: string } }>>(
        `${apiUrl()}/boards/${encodeURIComponent(board)}/actions?${q.toString()}`,
      )
      for (const a of rows) {
        const card = a.data?.card?.id
        if (!card) continue
        const list = out.get(card) ?? []
        list.push({ author: a.idMemberCreator ? person('trello', a.idMemberCreator, a.memberCreator?.fullName || a.memberCreator?.username, null) : null, text: a.data?.text ?? '', at: dateOf(a.date) })
        out.set(card, list)
      }
      // To the first empty page: a server may answer fewer than the thousand asked and still have more.
      if (rows.length === 0) break
      before = rows[rows.length - 1]!.id
    }
    for (const list of out.values()) list.sort((x, y) => (x.at?.getTime() ?? 0) - (y.at?.getTime() ?? 0))
    return out
  }
}

/** A card's custom field value, as the field it is of keeps it. */
function fieldValue(item: NonNullable<TrCard['customFieldItems']>[number], fieldOf: Map<string, TrField>): ImFieldValue | null {
  const f = item.idCustomField ? fieldOf.get(item.idCustomField) : undefined
  if (!f) return null
  const v = item.value ?? {}
  switch (f.type) {
    case 'number':
      return v.number !== undefined ? { name: f.name, type: 'number', value: Number(v.number) } : null
    case 'date':
      return v.date ? { name: f.name, type: 'date', value: v.date } : null
    case 'checkbox':
      return { name: f.name, type: 'checkbox', value: v.checked === 'true' }
    case 'list': {
      const options = (f.options ?? []).map((o) => o.value?.text ?? '').filter(Boolean)
      const chosen = (f.options ?? []).find((o) => o.id === item.idValue)?.value?.text
      return chosen ? { name: f.name, type: 'dropdown', value: chosen, options } : null
    }
    default:
      return v.text ? { name: f.name, type: 'text', value: v.text } : null
  }
}
