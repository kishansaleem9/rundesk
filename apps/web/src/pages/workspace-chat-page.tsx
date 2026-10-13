import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { PersonAvatar, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@rundesk/ui'
import { ChatSidebar } from '../components/chat/chat-sidebar'
import { ChatHeader } from '../components/chat/chat-header'
import { ChannelCall } from '../components/call/channel-call'
import { AddPeopleDialog } from '../components/chat/add-people-dialog'
import { SharePanel } from '../components/share-panel'
import { ChatComposer, ThreadReplyComposer } from '../components/chat/chat-composer'
import { EmojiPicker } from '../components/emoji/emoji-picker'
import { LoadOlder } from '../components/load-older'
import { CallCard } from '../components/call/call-card'
import { useSkillCommands } from '../lib/skills-api'
import {
  formatDateDivider,
  formatMessageTime,
  formatRelativeTime,
  shouldShowDateDivider,
  shouldShowMessageHeader,
} from '../components/chat/chat-utils'
import type { ChatSpace, ChatChannelGroup, ChatMessageEditHistory } from '../components/chat/chat-types'
import {
  Hash,
  Users,
  Smile,
  Sparkles,
  ListTodo,
  Reply,
  Forward,
  Bookmark,
  UserPlus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  X,
  Paperclip,
  FileText,
  Download,
  Search,
  Check,
  CheckCheck,
  Tag,
  Lock,
  Plus,
  MailOpen,
  ArrowDown,
  Info,
  Upload,
  MoreHorizontal,
  Clock,
  BellOff,
  Bell,
  CheckCircle2,
  Circle,
  Calendar,
  Video,
  UserRound,
  Link2,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { localDateTimeValue } from '../lib/local-date'
import type { TranslationKey } from '../lib/i18n/catalogs'
import { getRealtimeSocket, joinRooms } from '../lib/realtime'
import { useAuthStore } from '../store/auth'
import { useSidebarStore } from '../store/sidebar'
import { openPersonPanel } from '../store/person-panel'
import { ChatMessageBody } from '../components/chat/chat-message-body'
import { ChatAttachmentList } from '../components/chat/chat-attachments'
import { InlineSkeleton, ListSkeleton } from '../components/loading-skeletons'
import { useTaskSearch } from '../lib/use-task-search'

type Channel = {
  id: string
  name: string
  description?: string | null
  topic?: string | null
  icon?: string | null
  spaceId?: string | null
  archivedAt?: string | null
  isPrivate: boolean
  isDm: boolean
  createdById?: string | null
  joined: boolean
  unreadCount?: number
  lastReadAt?: string | null
  dmPeerId?: string
  dmPeerName?: string | null
  dmPeerAvatarUrl?: string | null
  dmIsGroup?: boolean
  dmPeers?: Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>
  dmLabel?: string | null
  /** Share & Permissions level when reached through a grant; 'view' is read-only. */
  accessLevel?: 'view' | 'comment' | 'edit' | 'admin'
}

type WorkspaceMember = {
  userId: string
  displayName: string
  email: string
}

type PendingInvite = {
  id: string
  email: string
  role: string
  status: 'pending'
  expiresAt: string
}

/**
 * §G11 [14:16] — the quick reactions her hover toolbar offers, before the
 * picker. Declared once because the channel row and the thread panel both draw
 * them, and they had already drifted: the thread had all three as emoji while
 * the channel had a single thumbs-up icon.
 */
const QUICK_REACTIONS = ['👍', '✅', '🔥'] as const

type Message = {
  id: string
  channelId: string
  authorId: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  /**
   * Set on a message imported from Slack whose author is nobody here
   * (`commit-log/log-601eacc-2`): `authorName` is that name, and the message is
   * kept under whoever imported it, who did not say it.
   */
  importedAuthor?: string | null
  body: string
  parentMessageId?: string | null
  /**
   * §12 — set when this message is a forward. `forwardedFrom` is null when the
   * source sits in a channel this reader cannot open: still a forward, just not
   * one they can follow.
   */
  forwardedFromId?: string | null
  forwardedFrom?: { channelId: string; channelName: string | null; authorName?: string | null; sentAt?: string | null } | null
  editedAt?: string | null
  pinnedAt?: string | null
  pinnedById?: string | null
  pinnedByName?: string | null
  deletedAt?: string | null
  createdAt: string
  replyCount?: number
  lastReplyAt?: string | null
  // Delivery indicator for the author's own messages (Plan §6.2), computed
  // server-side in listMessages: 'sent' | 'delivered' | 'seen' (or null).
  deliveryStatus?: 'sent' | 'delivered' | 'seen' | null
  // Saved-message tags (Plan §6.7) — present on rows from the Saved list.
  tags?: string[]
  /**
   * §G11 [15:36] — who has been asked to act on this message.
   *
   * On the message rather than behind the menu that created it: an assignment
   * you can only find by re-opening the control that made it is the same as
   * not having one.
   */
  assignments?: Array<{
    id: string
    assigneeId: string
    assigneeName?: string | null
    assigneeAvatarUrl?: string | null
    assignedById?: string | null
    dueAt?: string | null
    resolvedAt?: string | null
  }>
  /** §G12 [17:13] — the reader's own stance on this thread, or null. */
  threadFollowState?: 'following' | 'muted' | null
  reactions?: Array<{
    emoji: string
    count: number
    reacted: boolean
    users?: Array<{ id: string; name: string }>
  }>
  attachments?: Array<{
    id: string
    fileName: string
    contentType: string
    sizeBytes: number
    url: string
  }>
  /**
   * §2.8 gap 9 — set when this message is a call card rather than text.
   *
   * Live state rather than a snapshot: the card is read long after the call
   * started, by somebody who may or may not be in it, and has to say the right
   * one of three things without the message being rewritten.
   */
  callId?: string | null
  call?: {
    id: string
    startedAt: string
    endedAt: string | null
    recording: boolean
    startedById: string
    joinedCount: number
    presentCount: number
    youArePresent: boolean
  } | null
}

/** Root messages per page of channel history. */
const CHAT_PAGE = 100
/** How far back a deep link pages before saying the message is too far. */
const DEEP_LINK_MAX_PAGES = 50

/** One page of a channel: its messages, oldest first, and whether older ones exist. */
type MessagePage = { items: Message[]; hasOlder: boolean }

/** Edit every loaded page of a channel in one cache write. */
function editChannelPages(qc: QueryClient, channelId: string, edit: (items: Message[], page: number) => Message[]) {
  qc.setQueryData<InfiniteData<MessagePage, string | undefined>>(['chat-messages', channelId], (prev) =>
    prev ? { ...prev, pages: prev.pages.map((p, i) => ({ ...p, items: edit(p.items, i) })) } : prev,
  )
}

/** A new message goes on the end of the newest page, once. */
function appendToChannel(qc: QueryClient, msg: Message) {
  const loaded = qc.getQueryData<InfiniteData<MessagePage, string | undefined>>(['chat-messages', msg.channelId])
  if (!loaded || loaded.pages.some((p) => p.items.some((m) => m.id === msg.id))) return
  editChannelPages(qc, msg.channelId, (items, page) => (page === 0 ? [...items, msg] : items))
}

/** A task the mention picker can reference (§A3.6) — carries the ids the chat
 *  body renderer needs to unfurl it into a task card. */
type MentionTask = {
  id: string
  title: string
  listId: string
  projectId: string
  spaceId: string
  listName?: string
  projectName?: string
}

type MentionDoc = { id: string; title: string; updatedAt?: string }

/** A team the mention picker can address by handle (§A4.3). */
type MentionTeam = { id: string; name: string; alias: string | null; memberCount: number }

type PendingChatAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
}

/** Hard cap on a single chat attachment (Plan §6.8) — mirrors the API limit. */
const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * §G11 [15:19] — what a reminder field starts on: an hour from now, local.
 *
 * `datetime-local` wants "YYYY-MM-DDTHH:mm" with no zone and no seconds, in
 * the reader's own clock — so `toISOString()` is exactly wrong here, and quietly
 * so: it renders, it just shows a time in UTC.
 */
function defaultReminderWhen(from: Date = new Date()): string {
  return localDateTimeValue(new Date(from.getTime() + 60 * 60 * 1000))
}

type CustomEmoji = { id: string; shortcode: string; imageUrl: string; createdById?: string | null }

export function ChatPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/chat' })
  // §15 — the installed skills this person can type as /slug, offered in the
  // composer's command menu alongside /task and /remind.
  const { data: skillCommands = [] } = useSkillCommands(workspaceId)
  const deepLink = useSearch({ from: '/app/$workspaceId/chat' }) as {
    channel?: string
    message?: string
    thread?: string
  }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const selectedId = deepLink.channel ?? null
  /**
   * Move to a channel by changing the address. `message` and `thread` are
   * dropped on the way out: both name something inside the channel you are
   * leaving, so carrying them over would point at nothing while making the
   * URL look like it should point somewhere.
   */
  const selectChannel = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/chat',
      params: { workspaceId },
      search: { channel: id ?? undefined },
      replace: true,
    })
  const setSelectedId = selectChannel
  const [addPeopleOpen, setAddPeopleOpen] = useState(false)
  const [input, setInput] = useState('')
  // Files uploaded (to R2) and awaiting attachment to the next sent message (§6.8).
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  // Drag-and-drop over the whole conversation pane (§6.8) stages files into the composer.
  const [paneDragging, setPaneDragging] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)
  const [newSpaceId, setNewSpaceId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // Edit-channel dialog (§6.1): name / description / icon.
  const [editChannelOpen, setEditChannelOpen] = useState(false)
  const [shareChannelOpen, setShareChannelOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [startingDm, setStartingDm] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  /*
   * An open thread is a place too. Reading a long discussion and reloading
   * used to lose it — you were back in the channel hunting for the parent
   * message — and "look at this thread" could not be sent to anybody. The
   * route already carried `?message=` to point at a single message, so the
   * identifier shape was settled; only the thread had no name in the URL.
   */
  /**
   * §G11 — "Copy link", on the message itself.
   *
   * The address it produces is not new: `?channel=&message=` is the shape the
   * inbox and the search results already navigate to, and the page already
   * scrolls to and highlights whatever `message` names. What was missing was
   * any way for a PERSON to obtain one. You could be sent a link to a message
   * and follow it; you could not make one, so "have a look at what Sara said"
   * meant pasting the text and hoping.
   *
   * Built from the channel and message on the row rather than from
   * `window.location`. Copying the current address is what the channel-level
   * control does and it is right there, but for one message it would hand over
   * whatever happened to be in the URL — the wrong message, a stale thread, or
   * a bare channel — and the person pasting it has no way to tell.
   *
   * A reply carries its thread, because a link to a reply that opens the
   * channel and highlights nothing is a link that does not work. The parent is
   * what the thread panel is keyed on.
   */
  const copyMessageLink = (m: Message) => {
    const url = new URL(`/app/${workspaceId}/chat`, window.location.origin)
    url.searchParams.set('channel', m.channelId)
    url.searchParams.set('message', m.id)
    if (m.parentMessageId) url.searchParams.set('thread', m.parentMessageId)
    // Written optimistically and corrected on failure: clipboard access is
    // refused in a few real situations (an insecure origin, a browser that
    // requires the gesture to reach it directly), and claiming success there
    // sends somebody away to paste nothing.
    navigator.clipboard.writeText(url.toString()).then(
      () => toast.success(t('chat.messageLinkCopied')),
      () => toast.error(t('chat.couldNotCopyLink')),
    )
  }

  const threadParentId = deepLink.thread ?? null
  const setThreadParentId = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/chat',
      params: { workspaceId },
      search: (prev: Record<string, unknown>) => ({ ...prev, thread: id ?? undefined }),
      replace: true,
    })
  // Which face of a DM is showing. Reset when the conversation changes, or you
  // land on someone else's shared work while thinking you switched to a chat.
  const [dmTab, setDmTab] = useState<'chat' | 'calendar' | 'tasks'>('chat')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  // Edit history (§6.3): the message whose prior versions are being viewed.
  const [editHistoryFor, setEditHistoryFor] = useState<string | null>(null)
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [showSavedPanel, setShowSavedPanel] = useState(false)
  // Workspace file library (§6.8) + full message search (§6.11) side panels.
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  /**
   * §2.8 gap 9 — a call card's Join/Leave, handed to the call component.
   *
   * The pre-join dialog and the live call live inside ChannelCall; the card
   * lives in the message list. Rather than lifting the whole call into this
   * page, the card raises an intent and ChannelCall acts on it and clears it.
   */
  const [callAction, setCallAction] = useState<
    { kind: 'join' | 'leave'; callId: string } | { kind: 'start' } | null
  >(null)
  // §1.3 [10:13] — the second-level panel's own collapse, remembered per person.
  const chatPanelCollapsed = useSidebarStore((s) => s.panels.chat === true)
  const togglePanel = useSidebarStore((s) => s.togglePanel)
  // Right-click context menu (Plan §6.10) anchored at the cursor for a message.
  const [messageMenu, setMessageMenu] = useState<{ message: Message; x: number; y: number } | null>(null)
  const [emojiManagerOpen, setEmojiManagerOpen] = useState(false)
  const [newEmojiCode, setNewEmojiCode] = useState('')
  const [newEmojiUrl, setNewEmojiUrl] = useState('')
  /**
   * G11-2 [14:52] — the forward draft.
   *
   * Was a `string | null` naming a message, rendered as an inline popover of
   * `[...publicChannels, ...dmChannels].slice(0, 10)`. No search, so a
   * workspace with more than ten conversations physically could not forward to
   * the eleventh; and no confirm step, so one stray click forwarded
   * immediately and irreversibly.
   */
  const [forwardDraft, setForwardDraft] = useState<{ message: Message; to: string; note: string } | null>(null)
  const [forwardQuery, setForwardQuery] = useState('')
  /**
   * §G11 [15:36] — which message's Assign picker is open.
   *
   * The old Assign button appended `<@id>` to the composer, which is a mention,
   * not an assignment: nobody is asked, nothing is tracked, and nothing says it
   * later. This one opens a list of the people who can actually see the
   * conversation.
   */
  const [assignPickerFor, setAssignPickerFor] = useState<string | null>(null)
  /** §G11 [15:19] — "Set reminder" on a message, with the chosen moment. */
  const [remindDraft, setRemindDraft] = useState<{ message: Message; when: string; note: string } | null>(null)
  /** §G11 [14:16] — which message's `⋯` overflow is open. */
  const [overflowFor, setOverflowFor] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [channelSearch, setChannelSearch] = useState('')
  // Channel info panel + its topic field (§A3.7).
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [editTopic, setEditTopic] = useState('')
  // Where the unread divider sits in the open channel (§A3.3). Frozen when the
  // channel is opened: opening also marks it read, so reading the live cursor
  // would erase the divider before it ever rendered.
  const [unreadAnchor, setUnreadAnchor] = useState<{ channelId: string; at: string | null } | null>(null)
  // Create-task-from-message draft (§A3.5): the message, plus assignee + due
  // date, so a chat line becomes an owned action item rather than a stray task.
  const [taskDraft, setTaskDraft] = useState<{ message: Message; assigneeId: string; dueAt: string } | null>(null)
  // Action item attached to the next sent message (§A3.5).
  const [actionItem, setActionItem] = useState<{ assigneeId: string; dueAt: string } | null>(null)
  // Mention picker tab (§A3.6). '#' jumps straight to channels.
  const [mentionTab, setMentionTab] = useState<'people' | 'tasks' | 'docs' | 'channels'>('people')
  const [emojiUploading, setEmojiUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () => api<Channel[]>(`/workspaces/${workspaceId}/chat/channels`),
  })
  const channels = channelsQuery.data ?? []
  const publicChannels = channels.filter((c) => !c.isDm)
  const dmChannels = channels.filter((c) => c.isDm)
  /*
   * G11-2 — every conversation, filtered by what you typed, capped at a
   * scrollable 50.
   *
   * The cap is on the RENDER, not on what is searchable: the old `slice(0, 10)`
   * meant the eleventh conversation could not be reached at all, however
   * precisely you knew its name. Searching first and capping second is the
   * whole difference.
   */
  const forwardTargets = useMemo(() => {
    const needle = forwardQuery.trim().toLowerCase()
    const all = [...publicChannels, ...dmChannels]
    const named = (c: (typeof all)[number]) =>
      c.isDm ? (c.dmLabel ?? c.dmPeerName ?? '') : (c.name ?? '')
    return all
      .filter((c) => !needle || named(c).toLowerCase().includes(needle))
      .slice(0, 50)
  }, [publicChannels, dmChannels, forwardQuery])

  // Spaces power the channel-scope picker + sidebar grouping (§6.1). Only spaces
  // the user can see are returned by the API.
  const spacesQuery = useQuery({
    queryKey: ['chat-spaces', workspaceId],
    queryFn: () => api<ChatSpace[]>(`/spaces/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })
  const spaceOptions: ChatSpace[] = (spacesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name, icon: s.icon }))

  // Archived channels (§6.1) — only fetched while the archived section is open.
  const archivedChannelsQuery = useQuery({
    queryKey: ['chat-archived-channels', workspaceId],
    queryFn: () => api<Channel[]>(`/workspaces/${workspaceId}/chat/channels/archived`),
    enabled: !!workspaceId && showArchived,
  })
  const archivedChannels = archivedChannelsQuery.data ?? []

  // User-named channel groups (§A3.4) — the caller's own arrangement of the rail.
  const channelGroupsQuery = useQuery({
    queryKey: ['chat-channel-groups', workspaceId],
    queryFn: () => api<ChatChannelGroup[]>(`/workspaces/${workspaceId}/chat/channel-groups`),
    enabled: !!workspaceId,
  })
  const channelGroups = channelGroupsQuery.data ?? []

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  })
  const pendingInvitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => api<PendingInvite[]>(`/invitations/workspace/${workspaceId}`),
  })
  const dmCandidates = (membersQuery.data ?? []).filter((m) => m.userId !== me?.id)
  const pendingInvites = pendingInvitesQuery.data ?? []
  // The token under the caret (§A3.6): '@' opens the picker on People, '#'
  // opens it on Channels. Anchoring on the caret (not the last '@' anywhere in
  // the draft) is what lets the picker replace exactly what was typed.
  const mentionTrigger = useMemo(() => {
    const match = /(?:^|\s)([@#])([^\s@#]*)$/.exec(input)
    if (!match) return null
    return { symbol: match[1] as '@' | '#', query: match[2].toLowerCase(), start: input.length - match[2].length - 1 }
  }, [input])
  const mentionQuery = mentionTrigger?.query ?? ''
  const mentionCandidates = (membersQuery.data ?? []).filter((m) =>
    (m.displayName || m.email).toLowerCase().includes(mentionQuery),
  )
  const mentionTasksQuery = useTaskSearch<MentionTask>(workspaceId, mentionQuery, {
    key: 'chat-mention-tasks',
    enabled: !!mentionTrigger && mentionTab === 'tasks',
  })
  const mentionDocsQuery = useQuery({
    queryKey: ['chat-mention-docs', workspaceId],
    queryFn: () => api<MentionDoc[]>(`/workspaces/${workspaceId}/docs`),
    enabled: !!workspaceId && !!mentionTrigger && mentionTab === 'docs',
  })
  const taskMentionCandidates = (mentionTasksQuery.data ?? []).filter((task) =>
    `${task.title} ${task.projectName ?? ''} ${task.listName ?? ''}`.toLowerCase().includes(mentionQuery),
  )
  const docMentionCandidates = (mentionDocsQuery.data ?? []).filter((d) =>
    d.title.toLowerCase().includes(mentionQuery),
  )
  // §A4.3 — teams are mentionable by handle. Offered on the People tab because
  // "who do I address" is one question, not two, and only teams that actually
  // have a handle can be inserted.
  const mentionTeamsQuery = useQuery({
    queryKey: ['chat-mention-teams', workspaceId],
    queryFn: () => api<MentionTeam[]>(`/workspaces/${workspaceId}/groups`),
    enabled: !!workspaceId && !!mentionTrigger,
  })
  const teamMentionCandidates = (mentionTeamsQuery.data ?? []).filter(
    (g) => g.alias && `${g.alias} ${g.name}`.toLowerCase().includes(mentionQuery),
  )

  useEffect(() => {
    // Typing '#' is a request for a channel link, not a person. Switching back
    // to '@' reopens on People; picking another tab afterwards sticks, because
    // this only fires when the trigger character itself changes.
    if (mentionTrigger?.symbol === '#') setMentionTab('channels')
    else if (mentionTrigger?.symbol === '@') setMentionTab('people')
  }, [mentionTrigger?.symbol])

  /** Replace the token being typed with the picked reference (§A3.6). */
  const insertMentionToken = (token: string) => {
    if (!mentionTrigger) return
    setInput(`${input.slice(0, mentionTrigger.start)}${token} `)
  }

  /*
   * Which channel you are in comes from the URL, so it can be sent.
   *
   * `?channel=` was read on arrival and never written: the route declared it,
   * the API minted links carrying it for every chat notification, and the
   * in-app search panel wrote it — but clicking a channel in the sidebar was
   * `onSelectChannel={setSelectedId}` and touched nothing. So you could be
   * sent into #design-review and never send anyone there yourself: copying the
   * address bar gave them /chat, which lands in #general, and your own reload
   * did the same to you.
   *
   * Reading the selection from the URL also retires the "consume this deep
   * link once" ref. That existed to stop the effect fighting the state it had
   * just set; with one source of truth there is nothing to fight.
   */
  useEffect(() => {
    if (channels.length === 0) return
    if (deepLink.channel && channels.some((c) => c.id === deepLink.channel)) return
    // No channel named, or one that is not in this workspace: fall back, and
    // put the fallback in the address so it is shareable like any other.
    const general = channels.find((c) => c.name === 'general') ?? channels[0]
    if (general) selectChannel(general.id)
  }, [channels, deepLink.channel])

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  )
  // Calendar and Tasks take over the pane. The stream and composer are hidden
  // rather than unmounted, so stepping over to "what are we both on?" and back
  // does not throw away an unsent draft or the scroll position in a long DM.
  const dmSharedOpen = Boolean(selectedChannel?.isDm && selectedChannel.dmPeerId && dmTab !== 'chat')
  const channelMembersQuery = useQuery({
    queryKey: ['chat-channel-members', selectedId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/chat/channels/${selectedId}/members`),
    enabled: !!selectedId && !selectedChannel?.isDm,
  })
  const receiptsQuery = useQuery({
    queryKey: ['chat-receipts', selectedId],
    queryFn: () =>
      api<Array<{ userId: string; displayName: string; lastReadAt: string | null; lastDeliveredAt: string | null }>>(
        `/chat/channels/${selectedId}/receipts`,
      ),
    enabled: !!selectedId,
    refetchInterval: 20000,
  })
  const customEmojiQuery = useQuery({
    queryKey: ['chat-custom-emoji', workspaceId],
    queryFn: () => api<CustomEmoji[]>(`/chat/workspaces/${workspaceId}/custom-emoji`),
  })
  const customEmoji = customEmojiQuery.data ?? []
  const emojiByCode = useMemo(() => new Map(customEmoji.map((e) => [e.shortcode, e.imageUrl])), [customEmoji])

  /*
   * A channel's history, a page at a time — the newest page first, older ones
   * as you scroll up, as ClickUp's chat does.
   *
   * It read the newest 100 root messages and nothing else. The server's
   * `before` cursor had no client, so everything older was unreachable, and a
   * link to an older message opened a channel that did not contain it and did
   * nothing at all. Each page asks for one message more than it shows: whether
   * that one came back is whether there is an older page — kept on the page,
   * because live messages lengthen the newest page after it has loaded.
   */
  const messagesQuery = useInfiniteQuery({
    queryKey: ['chat-messages', selectedId],
    enabled: !!selectedId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      const rows = await api<Message[]>(
        `/chat/channels/${selectedId}/messages?limit=${CHAT_PAGE + 1}${pageParam ? `&before=${pageParam}` : ''}`,
      )
      const hasOlder = rows.length > CHAT_PAGE
      return { items: hasOlder ? rows.slice(1) : rows, hasOlder }
    },
    getNextPageParam: (last) => (last.hasOlder ? last.items[0]?.id : undefined),
  })
  const messages = useMemo(() => {
    const seen = new Set<string>()
    const out: Message[] = []
    for (const page of [...(messagesQuery.data?.pages ?? [])].reverse()) {
      for (const m of page.items) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        out.push(m)
      }
    }
    return out
  }, [messagesQuery.data])

  /*
   * A deep link to a message that is not loaded pages BACK until it is — the
   * same pages a scroll up would load — rather than doing nothing. Bounded,
   * and said out loud when the bound or the start of the channel is reached
   * without it.
   */
  const deepLinkSettled = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLink.message || !deepLink.channel) return
    if (selectedId !== deepLink.channel || messagesQuery.isPending) return
    if (deepLinkSettled.current === deepLink.message) return
    if (messages.some((m) => m.id === deepLink.message)) {
      deepLinkSettled.current = deepLink.message
      setHighlightedMessageId(deepLink.message)
      return
    }
    if (messagesQuery.isFetchingNextPage) return
    const pages = messagesQuery.data?.pages.length ?? 0
    if (messagesQuery.hasNextPage && pages < DEEP_LINK_MAX_PAGES) {
      void messagesQuery.fetchNextPage()
      return
    }
    deepLinkSettled.current = deepLink.message
    toast.error(
      messagesQuery.hasNextPage
        ? t('chat.linkedMessageTooFar', { count: pages * CHAT_PAGE })
        : t('chat.linkedMessageMissing'),
    )
  }, [deepLink.message, deepLink.channel, selectedId, messages, messagesQuery, t])

  // Read receipts (Plan §6): who has seen the latest message. A member has seen
  // it when their lastReadAt is at/after that message's timestamp.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const seenByNames = useMemo(() => {
    if (!lastMessage) return [] as string[]
    return (receiptsQuery.data ?? [])
      .filter(
        (r) =>
          r.userId !== me?.id &&
          r.userId !== lastMessage.authorId &&
          r.lastReadAt &&
          new Date(r.lastReadAt).getTime() >= new Date(lastMessage.createdAt).getTime(),
      )
      .map((r) => r.displayName)
      .filter(Boolean)
  }, [lastMessage, receiptsQuery.data, me?.id])

  // Per-message delivery indicator for the caller's own messages (Plan §6.2).
  // Computed live from the polling receipts query so it updates as members read,
  // falling back to the server-computed status until receipts load. Mirrors the
  // server: 'seen' if any other member read it, else 'delivered' if any other
  // member's client received it, else 'sent'. Seen supersedes Delivered.
  const deliveryStatusFor = (message: Message): 'sent' | 'delivered' | 'seen' | null => {
    if (message.authorId !== me?.id) return null
    const others = (receiptsQuery.data ?? []).filter((r) => r.userId !== me?.id)
    if (others.length === 0) return message.deliveryStatus ?? null
    const at = new Date(message.createdAt).getTime()
    let delivered = false
    for (const r of others) {
      if (r.lastReadAt && new Date(r.lastReadAt).getTime() >= at) return 'seen'
      if (r.lastDeliveredAt && new Date(r.lastDeliveredAt).getTime() >= at) delivered = true
    }
    return delivered ? 'delivered' : message.deliveryStatus ?? 'sent'
  }

  const pinnedQuery = useQuery({
    queryKey: ['chat-pinned', selectedId],
    queryFn: () => api<Message[]>(`/chat/channels/${selectedId}/pinned`),
    enabled: !!selectedId && showPinnedPanel,
  })
  const pinnedMessages = pinnedQuery.data ?? []
  const savedQuery = useQuery({
    queryKey: ['chat-saved', workspaceId],
    queryFn: () =>
      api<Array<Message & { channelName?: string; savedAt?: string }>>(
        `/workspaces/${workspaceId}/chat/saved`,
      ),
    enabled: !!workspaceId,
  })
  const savedMessages = savedQuery.data ?? []
  const savedIds = useMemo(() => new Set(savedMessages.map((m) => m.id)), [savedMessages])
  const rootMessages = useMemo(() => messages.filter((m) => !m.parentMessageId), [messages])
  // First message the user hasn't read in the open channel (§A3.3) — the divider
  // anchors above it and the jump pill scrolls to it.
  const firstUnreadId = useMemo(() => {
    if (!selectedId || unreadAnchor?.channelId !== selectedId) return null
    const at = unreadAnchor.at ? new Date(unreadAnchor.at).getTime() : 0
    return rootMessages.find((m) => m.authorId !== me?.id && new Date(m.createdAt).getTime() > at)?.id ?? null
  }, [rootMessages, unreadAnchor, selectedId, me?.id])
  const unreadCount = useMemo(() => {
    if (!firstUnreadId) return 0
    const from = rootMessages.findIndex((m) => m.id === firstUnreadId)
    return from < 0 ? 0 : rootMessages.length - from
  }, [rootMessages, firstUnreadId])
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const message of messages) {
      if (!message.parentMessageId) continue
      const arr = map.get(message.parentMessageId) ?? []
      arr.push(message)
      map.set(message.parentMessageId, arr)
    }
    return map
  }, [messages])
  // The thread's replies are NOT in the channel query (that one returns root
  // messages only), so the panel has to fetch them (§A3.2). Live replies that
  // arrive over the socket are merged on top.
  // Newest replies first from the server, older ones a page at a time: a
  // thread past a hundred replies used to show its first hundred and never
  // the ones being written now.
  const threadQuery = useInfiniteQuery({
    queryKey: ['chat-thread', threadParentId],
    enabled: !!threadParentId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<{ parent: Message; replies: Message[]; hasOlder?: boolean }>(
        `/chat/messages/${threadParentId}/thread${pageParam ? `?before=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => (last.hasOlder ? last.replies[0]?.id : undefined),
  })
  const threadParent = threadParentId
    ? messages.find((m) => m.id === threadParentId) ?? threadQuery.data?.pages[0]?.parent ?? null
    : null
  const threadReplies = useMemo(() => {
    if (!threadParentId) return [] as Message[]
    const byId = new Map<string, Message>()
    for (const page of threadQuery.data?.pages ?? []) for (const reply of page.replies) byId.set(reply.id, reply)
    for (const reply of repliesByParent.get(threadParentId) ?? []) byId.set(reply.id, reply)
    return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [threadParentId, threadQuery.data, repliesByParent])
  /**
   * §G11 [15:36] — who can be assigned a message in this conversation.
   *
   * Exactly who the server will accept, which is who can READ the channel —
   * not who has a membership row. Those differ, and the difference is the
   * common case: a public channel is readable by the whole workspace, and
   * plenty of people read one without ever pressing Join. Offering only the
   * joined list there would hide most of the team behind a distinction they
   * have never seen.
   *
   * A private channel narrows to its members, and a DM to the people in it,
   * because that is where the two sets genuinely diverge: assigning somebody
   * who cannot open the channel would notify them with a quote from it and a
   * link to a screen that refuses them. The server rejects that, and offering
   * it would be an invitation to the refusal.
   */
  const assignCandidates = useMemo(() => {
    if (selectedChannel?.isDm) {
      const peers = selectedChannel.dmPeers?.length
        ? selectedChannel.dmPeers.map((p) => ({
            userId: p.userId,
            displayName: p.displayName ?? '',
            email: '',
          }))
        : selectedChannel.dmPeerId
          ? [{ userId: selectedChannel.dmPeerId, displayName: selectedChannel.dmPeerName ?? '', email: '' }]
          : []
      const withMe = me?.id
        ? [{ userId: me.id, displayName: me.displayName ?? '', email: me.email ?? '' }, ...peers]
        : peers
      // De-dupe: a DM's peer list may already include the reader.
      return [...new Map(withMe.map((p) => [p.userId, p])).values()]
    }
    if (selectedChannel?.isPrivate) return channelMembersQuery.data ?? []
    return membersQuery.data ?? []
  }, [selectedChannel, channelMembersQuery.data, membersQuery.data, me])

  const namesById = useMemo(
    () => Object.fromEntries((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email])),
    [membersQuery.data],
  )
  // Mentioning someone who isn't in the channel is a dead end unless we say so
  // (§A3.6) — offer to add them instead of silently notifying nobody.
  const mentionedNonMembers = useMemo(() => {
    if (!selectedChannel || selectedChannel.isDm) return [] as Array<{ userId: string; name: string }>
    const memberIds = new Set((channelMembersQuery.data ?? []).map((m) => m.userId))
    if (memberIds.size === 0) return []
    const ids = [...new Set([...input.matchAll(/<@([0-9a-fA-F-]{36})>/g)].map((m) => m[1]))]
    return ids
      .filter((id) => !memberIds.has(id))
      .map((id) => ({ userId: id, name: namesById[id] ?? t('chat.unknownUser') }))
  }, [input, selectedChannel, channelMembersQuery.data, namesById, t])

  const addChannelMembersMutation = useMutation({
    mutationFn: ({ channelId, userIds }: { channelId: string; userIds: string[] }) =>
      api(`/chat/channels/${channelId}/members`, { method: 'POST', body: JSON.stringify({ userIds }) }),
    onSuccess: async (_, { channelId }) => {
      await qc.invalidateQueries({ queryKey: ['chat-channel-members', channelId] })
      toast.success(t('chat.memberAdded'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotAddMember')),
  })


  useEffect(() => {
    const socket = getRealtimeSocket()
    // Once the server holds the room, what was said in it meanwhile is read afresh: what its events below refresh.
    joinRooms(socket, [`workspace:${workspaceId}`], () => {
      for (const queryKey of [['chat-messages'], ['chat-thread'], ['chat-channel-members'], ['chat-channels', workspaceId], ['chat-archived-channels', workspaceId]]) {
        void qc.invalidateQueries({ queryKey })
      }
    })
    const onEvent = (event: {
      type: string
      workspaceId?: string
      channelId?: string
      message?: Message
      messageId?: string
      patch?: Partial<Message>
    }) => {
      if (event.workspaceId && event.workspaceId !== workspaceId) return
      if (event.type === 'chat.message.created' && event.message) {
        const msg = event.message
        appendToChannel(qc, msg)
        // Delivery receipt (Plan §6.2): a message from someone else reached this
        // client — mark it delivered even if the channel isn't open, so the
        // sender can see "Delivered" before it's actually read.
        if (msg.authorId !== me?.id) {
          void api(`/chat/channels/${msg.channelId}/delivered`, { method: 'POST' }).catch(() => undefined)
        }
      }
      if (event.type === 'chat.message.updated' && event.channelId && event.messageId) {
        // Whichever page holds it: an edit to a message three pages back is as
        // live as one to the newest.
        editChannelPages(qc, event.channelId, (items) =>
          items.map((m) => (m.id === event.messageId ? { ...m, ...(event.patch ?? {}) } : m)),
        )
      }
      if (event.type === 'chat.message.deleted' && event.channelId && event.messageId) {
        editChannelPages(qc, event.channelId, (items) => items.filter((m) => m.id !== event.messageId))
      }
      if (event.type === 'chat.channel.created') {
        // Reused for channel edits + archive/unarchive too (§6.1): refetch both lists.
        qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
        qc.invalidateQueries({ queryKey: ['chat-archived-channels', workspaceId] })
      }
      if (event.type === 'chat.channel.members.updated' && event.channelId) {
        qc.invalidateQueries({ queryKey: ['chat-channel-members', event.channelId] })
      }
      if (event.type === 'chat.reaction.toggled' && event.channelId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', event.channelId] })
        // The thread panel holds its own copy of the replies (§A3.2).
        qc.invalidateQueries({ queryKey: ['chat-thread'] })
      }
      /*
       * §2.8 gap 9 — a call card reads live, so it has to be refetched when the
       * call changes under it. Without this the card that said "Join the
       * SyncUp" goes on saying it after the call has ended, and its button
       * drops people into a room that closed twenty minutes ago.
       *
       * Signalling and reactions are excluded deliberately: those fire many
       * times a second during a call and none of them change the card.
       */
      if (
        event.type.startsWith('call.') &&
        event.type !== 'call.signal' &&
        event.type !== 'call.reaction'
      ) {
        /*
         * Scoped to the channel the call is in.
         *
         * Call events go to the whole workspace, so an unscoped invalidation
         * made every join, leave and recording toggle re-hydrate a hundred
         * messages for every person online — including people who cannot see
         * the channel the call is in. A six-person call in a private channel
         * did that a dozen times to two hundred people.
         *
         * Without a channelId there is nothing to scope to, and refetching
         * everything would be worse than refetching nothing — but note what
         * that costs, because the earlier version of this comment claimed the
         * card "is refreshed by its own poll a moment later either way" and
         * there is no such poll. `chat-messages` has no `refetchInterval`; the
         * 20s one on this page is on RECEIPTS. A call event with no channelId
         * leaves an open channel showing nothing until something else
         * invalidates, which for the call card is the explicit
         * `chat.message.created` emit in `announce()`.
         *
         * So the card has TWO independent delivery paths — that emit, and this
         * invalidation — and neither can be removed on its own without the
         * other covering for it. `sl-3-call-card-not-broadcast` found that by
         * running green twice.
         */
        if (event.channelId) {
          qc.invalidateQueries({ queryKey: ['chat-messages', event.channelId] })
        }
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [workspaceId, qc])

  /*
   * TO THE BOTTOM WHEN THE NEWEST MESSAGE CHANGES — not when the count does.
   * Older pages arrive at the TOP, and keyed on the length this jumped the
   * reader to the bottom every time they scrolled up far enough to load one.
   * Loading older keeps them where they were instead (below).
   */
  const newestId = messages[messages.length - 1]?.id
  const oldestId = messages[0]?.id
  const [bottomedFor, setBottomedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    if (newestId) setBottomedFor(selectedId)
  }, [newestId, selectedId])
  const olderScroll = useRef<{ height: number; top: number } | null>(null)
  const rememberScroll = () => {
    const el = scrollRef.current
    if (el) olderScroll.current = { height: el.scrollHeight, top: el.scrollTop }
  }
  useLayoutEffect(() => {
    const el = scrollRef.current
    const before = olderScroll.current
    if (!el || !before) return
    el.scrollTop = before.top + (el.scrollHeight - before.height)
    olderScroll.current = null
  }, [oldestId])

  // Freeze the read cursor the moment a channel is opened (§A3.3) so the divider
  // has something to sit on after the mark-read below moves the real cursor.
  useEffect(() => {
    if (!selectedId) return
    setUnreadAnchor((prev) =>
      prev?.channelId === selectedId ? prev : { channelId: selectedId, at: selectedChannel?.lastReadAt ?? null },
    )
  }, [selectedId, selectedChannel?.lastReadAt])

  // Mark the open channel read once its messages load (and whenever new ones
  // arrive while it's open), then refresh the channel list to clear its badge.
  // Keyed on the NEWEST message: loading older history is not something new.
  useEffect(() => {
    if (!selectedId || !newestId) return
    let cancelled = false
    // Opening a channel implies both delivery and read (Plan §6.2). Mark
    // delivered first so senders never see "Seen" without "Delivered".
    void api(`/chat/channels/${selectedId}/delivered`, { method: 'POST' }).catch(() => undefined)
    void api(`/chat/channels/${selectedId}/read`, { method: 'POST' })
      .then(() => {
        if (!cancelled) {
          void qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
          void qc.invalidateQueries({ queryKey: ['chat-unread', workspaceId] })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedId, newestId, workspaceId, qc])

  useEffect(() => {
    if (!highlightedMessageId) return
    const target = messageRefs.current[highlightedMessageId]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightedMessageId((prev) => (prev === highlightedMessageId ? null : prev)), 1800)
    return () => clearTimeout(timer)
  }, [highlightedMessageId, messages, selectedId])

  const sendMutation = useMutation({
    mutationFn: ({ body, parentMessageId, attachmentIds }: { body: string; parentMessageId?: string; attachmentIds?: string[] }) =>
      api<Message>(`/chat/channels/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, parentMessageId, attachmentIds: attachmentIds?.length ? attachmentIds : undefined }),
      }),
    onSuccess: (msg) => {
      appendToChannel(qc, msg)
      if (msg.parentMessageId) {
        void qc.invalidateQueries({ queryKey: ['chat-thread', msg.parentMessageId] })
        void qc.invalidateQueries({ queryKey: ['chat-messages', msg.channelId] })
      }
      // The composer's action item (§A3.5) applies to the message it was armed
      // for, so it is spent here and cleared whatever the task call does.
      if (actionItem && !msg.parentMessageId) {
        createTaskFromMessage.mutate({
          messageId: msg.id,
          assigneeId: actionItem.assigneeId || undefined,
          dueAt: actionItem.dueAt || undefined,
        })
        setActionItem(null)
      }
      setInput('')
      setReplyTo(null)
      setPendingAttachments([])
    },
  })

  // Upload picked files to R2 (presign → PUT → record) and queue them for the
  // next sent message (Plan §6.8). Runs sequentially; a failure is surfaced but
  // doesn't drop already-uploaded files.
  const uploadFiles = async (files: File[]) => {
    if (!selectedId) return
    setUploadingFiles(true)
    try {
      for (const file of files) {
        if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
          toast.error(t('chat.fileExceedsLimit', { name: file.name, limit: MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024) }))
          continue
        }
        const contentType = file.type || 'application/octet-stream'
        try {
          const presign = await api<{ uploadUrl: string; storageKey: string }>(
            `/chat/channels/${selectedId}/attachments/presign`,
            { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size } },
          )
          const putRes = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
          })
          if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
          const rec = await api<PendingChatAttachment>(`/chat/channels/${selectedId}/attachments`, {
            method: 'POST',
            body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
          })
          setPendingAttachments((prev) => [...prev, rec])
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : t('chat.couldNotUploadFile', { name: file.name }))
        }
      }
    } finally {
      setUploadingFiles(false)
    }
  }

  // Upload a custom emoji image (§A3.8) through the same presign → PUT → record
  // shape as chat attachments, so emoji no longer have to live on someone
  // else's CDN.
  const uploadEmojiImage = async (file: File) => {
    const code = newEmojiCode.trim().toLowerCase().replace(/:/g, '')
    if (!code) {
      toast.error(t('chat.emojiNeedsShortcode'))
      return
    }
    setEmojiUploading(true)
    try {
      const contentType = file.type || 'image/png'
      const presign = await api<{ uploadUrl: string; storageKey: string }>(
        `/chat/workspaces/${workspaceId}/custom-emoji/presign`,
        { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size } },
      )
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
      addCustomEmojiMutation.mutate({ shortcode: code, storageKey: presign.storageKey })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUploadFile', { name: file.name }))
    } finally {
      setEmojiUploading(false)
    }
  }

  const createChannelMutation = useMutation({
    mutationFn: (data: { name: string; isPrivate: boolean; spaceId?: string | null }) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (channel) => {
      qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setCreating(false)
      setNewName('')
      setNewPrivate(false)
      setNewSpaceId('')
    },
  })

  // Edit a channel's name / description / icon (§6.1). Moderator-gated server-side.
  const updateChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      patch,
    }: {
      channelId: string
      patch: { name?: string; topic?: string | null; description?: string | null; icon?: string | null }
    }) =>
      api<Channel>(`/chat/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setEditChannelOpen(false)
      toast.success(t('chat.channelUpdated'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateChannel')),
  })

  // Archive / unarchive a channel (§6.1).
  const setChannelArchivedMutation = useMutation({
    mutationFn: ({ channelId, archived }: { channelId: string; archived: boolean }) =>
      api<Channel>(`/chat/channels/${channelId}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
    onSuccess: async (_, { channelId, archived }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['chat-archived-channels', workspaceId] }),
      ])
      toast.success(archived ? t('chat.channelArchived') : t('chat.channelUnarchived'))
      if (archived && selectedId === channelId) setSelectedId(null)
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotArchiveChannel')),
  })

  const createDmMutation = useMutation({
    mutationFn: (peerUserId: string) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/dms`, {
        method: 'POST',
        body: JSON.stringify({ peerUserId }),
      }),
    onSuccess: async (channel) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setStartingDm(false)
    },
  })

  // Group DM (§6.2): 2+ peers → a shared DM channel. Reuses the same success
  // path as the 1:1 DM (select the channel, close the composer).
  const createGroupDmMutation = useMutation({
    mutationFn: (peerUserIds: string[]) =>
      api<Channel>(`/workspaces/${workspaceId}/chat/group-dms`, {
        method: 'POST',
        body: JSON.stringify({ peerUserIds }),
      }),
    onSuccess: async (channel) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      setSelectedId(channel.id)
      setStartingDm(false)
    },
  })

  // One entry point for the sidebar composer: 1 peer → 1:1 DM, 2+ → group DM.
  const startDm = (userIds: string[]) => {
    if (userIds.length === 0) return
    if (userIds.length === 1) createDmMutation.mutate(userIds[0])
    else createGroupDmMutation.mutate(userIds)
  }

  const toggleReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api(`/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      }
      if (threadParentId) qc.invalidateQueries({ queryKey: ['chat-thread', threadParentId] })
    },
  })

  const addCustomEmojiMutation = useMutation({
    mutationFn: ({ shortcode, imageUrl, storageKey }: { shortcode: string; imageUrl?: string; storageKey?: string }) =>
      api(`/chat/workspaces/${workspaceId}/custom-emoji`, {
        method: 'POST',
        body: JSON.stringify({ shortcode, imageUrl, storageKey }),
      }),
    onSuccess: () => {
      setNewEmojiCode('')
      setNewEmojiUrl('')
      qc.invalidateQueries({ queryKey: ['chat-custom-emoji', workspaceId] })
      toast.success(t('chat.customEmojiAdded'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotAddEmoji')),
  })

  const deleteCustomEmojiMutation = useMutation({
    mutationFn: (emojiId: string) => api(`/chat/custom-emoji/${emojiId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-custom-emoji', workspaceId] }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotRemoveEmoji')),
  })

  /**
   * §12 [15:00] — "aap 'View Message' dekhoge to aap us group mein chale jaoge."
   *
   * This used to post the body text and nothing else, which is a copy-paste
   * rather than a forward: the recipient saw a message indistinguishable from
   * one somebody typed, with no route back to where it came from. It now
   * carries the source id, and the server resolves the link per reader.
   */
  const forwardMutation = useMutation({
    mutationFn: ({ channelId, body, sourceId }: { channelId: string; body: string; sourceId: string }) =>
      api<Message>(`/chat/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, forwardedFromId: sourceId }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', vars.channelId] })
      setForwardDraft(null)
      setForwardQuery('')
    },
  })

  const createTaskFromMessage = useMutation({
    mutationFn: async ({
      messageId,
      assigneeId,
      dueAt,
    }: { messageId: string; assigneeId?: string; dueAt?: string }) =>
      // The server chooses the list: the person's default for new tasks, as
      // `/task` does. This picked the first list of the first project of the
      // first space itself, so that default never applied.
      api(`/chat/messages/${messageId}/create-task`, {
        method: 'POST',
        body: { assigneeId: assigneeId || undefined, dueAt: dueAt || undefined },
      }),
    onSuccess: () => {
      setTaskDraft(null)
      toast.success(t('chat.taskCreatedFromMessage'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /**
   * §G11 [15:36] — assign the message, for real this time.
   *
   * Deliberately separate from createTaskFromMessage, which is a different
   * promise sitting one button along: that one makes a task somewhere else,
   * this one asks one person about this line and leaves both where they are.
   */
  const assignMessageMutation = useMutation({
    mutationFn: ({ messageId, assigneeId, dueAt }: { messageId: string; assigneeId: string; dueAt?: string }) =>
      api(`/chat/messages/${messageId}/assign`, {
        method: 'POST',
        body: { assigneeId, dueAt: dueAt || undefined },
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-assigned-to-me', workspaceId] })
      setAssignPickerFor(null)
      toast.success(t('chat.assignedToast', { name: namesById[vars.assigneeId] ?? t('chat.unknownUser') }))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  const unassignMessageMutation = useMutation({
    mutationFn: ({ messageId, assigneeId }: { messageId: string; assigneeId: string }) =>
      api(`/chat/messages/${messageId}/assign/${assigneeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-assigned-to-me', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /** Done, or not done after all — the same control both ways. */
  const resolveAssignmentMutation = useMutation({
    mutationFn: ({ messageId, assigneeId, resolved }: { messageId: string; assigneeId: string; resolved: boolean }) =>
      api(`/chat/messages/${messageId}/assign/${assigneeId}`, { method: 'PATCH', body: { resolved } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-assigned-to-me', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /** §G11 [15:19] — a reminder that points at the message, not at a stand-in task. */
  const remindAboutMessageMutation = useMutation({
    mutationFn: ({ messageId, remindAt, note }: { messageId: string; remindAt: string; note?: string }) =>
      api(`/chat/messages/${messageId}/remind`, { method: 'POST', body: { remindAt, note: note || undefined } }),
    onSuccess: () => {
      setRemindDraft(null)
      toast.success(t('chat.reminderSetToast'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /**
   * §G12 [17:13] — mute or follow one thread.
   *
   * `null` is a real value here, not an absence: it puts you back on the
   * default rather than freezing today's answer to what the default means.
   */
  const threadFollowMutation = useMutation({
    mutationFn: ({ messageId, state }: { messageId: string; state: 'following' | 'muted' | null }) =>
      api(`/chat/messages/${messageId}/thread-follow`, { method: 'PUT', body: { state } }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      toast.success(
        vars.state === 'muted'
          ? t('chat.threadMutedToast')
          : vars.state === 'following'
            ? t('chat.threadFollowedToast')
            : t('chat.threadDefaultToast'),
      )
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  // Mark a channel (or one message) unread again (§A3.3). The response carries
  // the rewound cursor, which re-arms the divider without a refetch race.
  const markUnreadMutation = useMutation({
    mutationFn: ({ channelId, messageId }: { channelId: string; messageId?: string }) =>
      api<{ lastReadAt: string | null }>(`/chat/channels/${channelId}/unread`, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      }),
    onSuccess: (res, { channelId }) => {
      setUnreadAnchor({ channelId, at: res?.lastReadAt ?? null })
      void qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      void qc.invalidateQueries({ queryKey: ['chat-unread', workspaceId] })
      toast.success(t('chat.markedUnread'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotMarkUnread')),
  })

  // Channel groups (§A3.4). Every mutation just refetches the group list — it is
  // one small row set and the sidebar renders straight off it.
  const invalidateGroups = () => qc.invalidateQueries({ queryKey: ['chat-channel-groups', workspaceId] })
  const createGroupMutation = useMutation({
    mutationFn: (name: string) =>
      api<ChatChannelGroup>(`/workspaces/${workspaceId}/chat/channel-groups`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => void invalidateGroups(),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateGroup')),
  })
  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, patch }: { groupId: string; patch: { name?: string; isCollapsed?: boolean } }) =>
      api(`/chat/channel-groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => void invalidateGroups(),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateGroup')),
  })
  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => api(`/chat/channel-groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateGroups(),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateGroup')),
  })
  const groupChannelMutation = useMutation({
    mutationFn: ({ groupId, channelId, remove }: { groupId: string; channelId: string; remove?: boolean }) =>
      remove
        ? api(`/chat/channel-groups/${groupId}/channels/${channelId}`, { method: 'DELETE' })
        : api(`/chat/channel-groups/${groupId}/channels`, { method: 'POST', body: JSON.stringify({ channelId }) }),
    onSuccess: () => void invalidateGroups(),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateGroup')),
  })

  // Dismiss the right-click message menu (Plan §6.10) on Escape.
  useEffect(() => {
    if (!messageMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMessageMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messageMenu])

  const setPinnedMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      api<Message>(`/chat/messages/${messageId}/pin`, {
        method: pinned ? 'POST' : 'DELETE',
      }),
    onSuccess: () => {
      // The server also emits chat.message.updated, but invalidate so the
      // acting user sees the pin state flip immediately.
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
        qc.invalidateQueries({ queryKey: ['chat-pinned', selectedId] })
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdatePin'))
    },
  })

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      api(`/chat/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditingBody('')
      if (selectedId) qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotEditMessage')),
  })

  // Edit history (§6.3): prior versions of a message, fetched on demand.
  const editHistoryQuery = useQuery({
    queryKey: ['chat-message-edits', editHistoryFor],
    queryFn: () => api<ChatMessageEditHistory>(`/chat/messages/${editHistoryFor}/edits`),
    enabled: !!editHistoryFor,
  })

  // Slash commands (§6.3): /task and /remind run server-side, which posts a
  // confirmation message (delivered via realtime) instead of the literal command.
  const runCommandMutation = useMutation({
    // `command` is a free string now: §15 skills are reached by their own
    // slugged name, so the set is not fixed at compile time.
    mutationFn: ({ command, text }: { command: string; text: string }) =>
      api<{ kind: 'task' | 'remind' | 'skill' }>(`/chat/channels/${selectedId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ command, text }),
      }),
    onSuccess: (res) => {
      setInput('')
      setPendingAttachments([])
      if (selectedId) qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
      // A skill posts its own question and answer into the channel, so a toast
      // saying "task created" would be plainly wrong and one saying "done"
      // would be noise on top of a visible reply.
      if (res?.kind === 'skill') return
      toast.success(res?.kind === 'remind' ? t('chat.reminderCreated') : t('chat.taskCreatedFromMessage'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotRunCommand')),
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => api(`/chat/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] })
        qc.invalidateQueries({ queryKey: ['chat-pinned', selectedId] })
      }
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('chat.couldNotDeleteMessage')),
  })

  const setSavedMutation = useMutation({
    mutationFn: ({ messageId, saved }: { messageId: string; saved: boolean }) =>
      api(`/chat/messages/${messageId}/save`, { method: saved ? 'POST' : 'DELETE' }),
    onSuccess: (_data, { saved }) => {
      qc.invalidateQueries({ queryKey: ['chat-saved', workspaceId] })
      // Says WHERE it went. "Saved" on its own leaves you hunting for the place.
      toast.success(saved ? t('chat.savedToLaterToast') : t('chat.removedFromSaved'))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateSaved'))
    },
  })

  // Update the tags on a saved message (Plan §6.7).
  const updateSavedTagsMutation = useMutation({
    mutationFn: ({ messageId, tags }: { messageId: string; tags: string[] }) =>
      api(`/chat/saves/${messageId}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-saved', workspaceId] })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateSaved'))
    },
  })

  const leaveChannelMutation = useMutation({
    mutationFn: (channelId: string) =>
      api(`/chat/channels/${channelId}/leave`, { method: 'POST' }),
    onSuccess: async (_, channelId) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      toast.success(t('chat.youLeftChannel'))
      if (selectedId === channelId) setSelectedId(null)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotLeaveChannel'))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      api(`/chat/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async (_, { channelId }) => {
      await qc.invalidateQueries({ queryKey: ['chat-channel-members', channelId] })
      toast.success(t('chat.memberRemoved'))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotRemoveMember'))
    },
  })

  const setNotificationLevel = useMutation({
    mutationFn: ({ channelId, level }: { channelId: string; level: 'all' | 'mentions' | 'none' }) =>
      api(`/chat/channels/${channelId}/notifications`, { method: 'PATCH', body: { level } }),
    onSuccess: async (_, { level }) => {
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      toast.success(level === 'none' ? t('chat.channelMuted') : level === 'mentions' ? t('chat.notifyingMentionsOnly') : t('chat.notifyingAll'))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('chat.couldNotUpdateNotifications'))
    },
  })

  const handleSend = () => {
    const body = input.trim()
    if (!selectedId) return
    // Allow sending with text OR at least one uploaded attachment (§6.8).
    if (!body && pendingAttachments.length === 0) return
    if (uploadingFiles) return
    // Slash commands (§6.3): a leading /task or /remind runs server-side instead
    // of posting a literal message. Only for fresh top-level sends (not replies /
    // attachment posts), so normal messages are untouched.
    // §15 — the set of commands now includes this person's installed skills,
    // so match any leading /word and let the SERVER decide whether it knows it.
    // Matching only names the client knows about would mean a skill installed
    // in another tab is typed and posted as literal text until a refresh.
    const slash = /^\/([\w-]+)\b\s*([\s\S]*)$/i.exec(body)
    const command = slash?.[1]?.toLowerCase()
    const known =
      command === 'task' ||
      command === 'remind' ||
      skillCommands.some((sc) => sc.slug === command)
    if (slash && known && !replyTo && pendingAttachments.length === 0) {
      if (runCommandMutation.isPending) return
      runCommandMutation.mutate({ command: command!, text: slash[2] ?? '' })
      return
    }
    sendMutation.mutate({
      body,
      parentMessageId: replyTo?.id ?? undefined,
      attachmentIds: pendingAttachments.map((a) => a.id),
    })
  }

  const handleThreadReply = (body: string, alsoSendToChannel: boolean) => {
    const trimmed = body.trim()
    if (!trimmed || !threadParentId) return
    // Slash commands work in a thread too (§A3.2); the command runs against the
    // channel, so its confirmation lands in the stream rather than the thread.
    const slash = /^\/(task|remind)\b\s*([\s\S]*)$/i.exec(trimmed)
    if (slash) {
      if (runCommandMutation.isPending) return
      runCommandMutation.mutate({ command: slash[1].toLowerCase() as 'task' | 'remind', text: slash[2] ?? '' })
      return
    }
    sendMutation.mutate({ body: trimmed, parentMessageId: threadParentId })
    if (alsoSendToChannel) sendMutation.mutate({ body: trimmed })
  }


  useEffect(() => { setDmTab('chat') }, [selectedId])

  const channelLabel = selectedChannel?.isDm
    ? selectedChannel.dmLabel ?? selectedChannel.dmPeerName ?? t('chat.dm')
    : selectedChannel
      ? `#${selectedChannel.name}`
      : ''

  return (
    <div className="h-full flex bg-background">
      <ChatSidebar
        // §1.3 [10:13] — the channel list collapses too, on the screen where
        // "double navigation" actually costs the space she was complaining
        // about: 288px of sidebar against 272px of this.
        isCollapsed={chatPanelCollapsed}
        onToggleCollapsed={() => togglePanel('chat')}
        channels={publicChannels}
        dmChannels={dmChannels}
        workspaceId={workspaceId}
        selectedId={selectedId}
        onSelectChannel={setSelectedId}
        channelSearch={channelSearch}
        onChannelSearchChange={setChannelSearch}
        creating={creating}
        onToggleCreate={() => setCreating((v) => !v)}
        newName={newName}
        onNewNameChange={setNewName}
        newPrivate={newPrivate}
        onNewPrivateChange={setNewPrivate}
        spaces={spaceOptions}
        newSpaceId={newSpaceId}
        onNewSpaceIdChange={setNewSpaceId}
        onCreateChannel={() => {
          if (!newName.trim()) return
          createChannelMutation.mutate({ name: newName.trim(), isPrivate: newPrivate, spaceId: newSpaceId || null })
        }}
        createPending={createChannelMutation.isPending}
        archivedChannels={archivedChannels}
        showArchived={showArchived}
        onToggleShowArchived={() => setShowArchived((v) => !v)}
        onUnarchiveChannel={(id) => setChannelArchivedMutation.mutate({ channelId: id, archived: false })}
        startingDm={startingDm}
        onToggleStartDm={() => setStartingDm((v) => !v)}
        dmCandidates={dmCandidates}
        onStartDm={startDm}
        startDmPending={createDmMutation.isPending || createGroupDmMutation.isPending}
        pendingInvites={pendingInvites}
        channelsLoading={channelsQuery.isLoading}
        channelGroups={channelGroups}
        onCreateGroup={(name) => createGroupMutation.mutate(name)}
        onRenameGroup={(groupId, name) => updateGroupMutation.mutate({ groupId, patch: { name } })}
        onDeleteGroup={(groupId) => deleteGroupMutation.mutate(groupId)}
        onToggleGroupCollapsed={(groupId, isCollapsed) => updateGroupMutation.mutate({ groupId, patch: { isCollapsed } })}
        onAssignChannelToGroup={(groupId, channelId) => groupChannelMutation.mutate({ groupId, channelId })}
        onRemoveChannelFromGroup={(groupId, channelId) =>
          groupChannelMutation.mutate({ groupId, channelId, remove: true })
        }
      />

      <div className="flex-1 flex bg-white dark:bg-[#0f1114] min-w-0">
        <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          channel={selectedChannel}
          workspaceId={workspaceId}
          callControl={
            <ChannelCall
              workspaceId={workspaceId}
              channelId={selectedId}
              // Recording is an admin-shaped act: it produces a lasting record
              // of colleagues, so it is not offered to everyone by default.
              // Recording produces a lasting record of colleagues, so it is
              // offered where inviting people already is: to whoever can manage
              // this channel's membership.
              canRecord={!!selectedChannel && !selectedChannel.isDm}
              action={callAction}
              onActionHandled={() => setCallAction(null)}
            />
          }
          memberCount={
            selectedChannel?.isDm ? membersQuery.data?.length ?? 0 : channelMembersQuery.data?.length ?? 0
          }
          members={selectedChannel?.isDm ? membersQuery.data ?? [] : channelMembersQuery.data ?? []}
          showPinnedPanel={showPinnedPanel}
          onTogglePinned={() => {
            setShowPinnedPanel((v) => !v)
            setShowSavedPanel(false)
            setShowFilesPanel(false)
            setShowSearchPanel(false)
            setShowInfoPanel(false)
          }}
          showSavedPanel={showSavedPanel}
          onToggleSaved={() => {
            setShowSavedPanel((v) => !v)
            setShowPinnedPanel(false)
            setShowFilesPanel(false)
            setShowSearchPanel(false)
            setShowInfoPanel(false)
          }}
          showFilesPanel={showFilesPanel}
          onToggleFiles={() => {
            setShowFilesPanel((v) => !v)
            setShowPinnedPanel(false)
            setShowSavedPanel(false)
            setShowSearchPanel(false)
            setShowInfoPanel(false)
          }}
          showSearchPanel={showSearchPanel}
          onToggleSearch={() => {
            setShowSearchPanel((v) => !v)
            setShowPinnedPanel(false)
            setShowSavedPanel(false)
            setShowFilesPanel(false)
            setShowInfoPanel(false)
          }}
          showInfoPanel={showInfoPanel}
          onToggleInfo={() => {
            setShowInfoPanel((v) => !v)
            setShowPinnedPanel(false)
            setShowSavedPanel(false)
            setShowFilesPanel(false)
            setShowSearchPanel(false)
          }}
          onMarkUnread={selectedId ? () => markUnreadMutation.mutate({ channelId: selectedId }) : undefined}
          onLeaveChannel={() => {
            if (selectedId) leaveChannelMutation.mutate(selectedId)
          }}
          onAddPeople={selectedChannel && !selectedChannel.isDm ? () => setAddPeopleOpen(true) : undefined}
          onSetNotificationLevel={
            selectedId ? (level) => setNotificationLevel.mutate({ channelId: selectedId, level }) : undefined
          }
          currentUserId={me?.id}
          onRemoveMember={selectedId ? (userId) => removeMemberMutation.mutate({ channelId: selectedId, userId }) : undefined}
          onEditChannel={
            selectedChannel && !selectedChannel.isDm
              ? () => {
                  setEditName(selectedChannel.name)
                  setEditTopic(selectedChannel.topic ?? '')
                  setEditDescription(selectedChannel.description ?? '')
                  setEditIcon(selectedChannel.icon ?? '')
                  setEditChannelOpen(true)
                }
              : undefined
          }
          onArchiveChannel={
            selectedChannel && !selectedChannel.isDm
              ? () => setChannelArchivedMutation.mutate({ channelId: selectedChannel.id, archived: true })
              : undefined
          }
          onShareChannel={
            selectedChannel && !selectedChannel.isDm ? () => setShareChannelOpen(true) : undefined
          }
        />

        {/* §A3.9 — a DM is the one place "what are we both on?" is the real
            question, so it gets Chat / Calendar / Tasks rather than only a
            stream. Channels keep the stream alone; the question does not apply. */}
        {selectedChannel?.isDm && selectedChannel.dmPeerId && (
          <div className="flex items-center gap-1 border-b border-border px-4 py-1.5">
            {(['chat', 'calendar', 'tasks'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={dmTab === tab}
                onClick={() => setDmTab(tab)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[13px] transition-colors',
                  dmTab === tab
                    ? 'bg-accent/15 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {t(DM_TAB_KEY[tab])}
              </button>
            ))}
          </div>
        )}

        {dmSharedOpen && selectedChannel?.dmPeerId && dmTab !== 'chat' && (
          <DmSharedPanel
            workspaceId={workspaceId}
            peerId={selectedChannel.dmPeerId}
            peerName={selectedChannel.dmLabel ?? selectedChannel.dmPeerName ?? t('chat.teammate')}
            mode={dmTab}
          />
        )}

        {selectedChannel && !selectedChannel.isDm && (
          <SharePanel
            open={shareChannelOpen}
            onOpenChange={setShareChannelOpen}
            objectType="channel"
            objectId={selectedChannel.id}
            objectName={selectedChannel.name}
          />
        )}

        {selectedChannel && !selectedChannel.isDm && (
          <AddPeopleDialog
            channelId={selectedChannel.id}
            workspaceId={workspaceId}
            channelName={selectedChannel.name}
            open={addPeopleOpen}
            onOpenChange={setAddPeopleOpen}
          />
        )}

        {editChannelOpen && selectedChannel && !selectedChannel.isDm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEditChannelOpen(false)}
          >
            <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{t('chat.editChannel')}</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditChannelOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.channelName')}
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.channelTopic')}
                  <input
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                    maxLength={250}
                    placeholder={t('chat.channelTopicPlaceholder')}
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.channelIcon')}
                  <input
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    maxLength={8}
                    placeholder={t('chat.channelIconPlaceholder')}
                    className="mt-0.5 w-24 h-8 rounded border border-border bg-background px-2 text-base text-foreground"
                  />
                </label>
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.channelDescription')}
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    placeholder={t('chat.channelDescriptionPlaceholder')}
                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground resize-none"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditChannelOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={!editName.trim() || updateChannelMutation.isPending}
                  onClick={() =>
                    updateChannelMutation.mutate({
                      channelId: selectedChannel.id,
                      patch: {
                        name: editName.trim(),
                        topic: editTopic.trim(),
                        description: editDescription.trim(),
                        icon: editIcon.trim(),
                      },
                    })
                  }
                >
                  {updateChannelMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {emojiManagerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEmojiManagerOpen(false)}
          >
            <Card className="w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{t('chat.customEmoji')}</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEmojiManagerOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex-1 text-[11px] text-muted-foreground">
                  {t('chat.shortcode')}
                  <input
                    value={newEmojiCode}
                    onChange={(e) => setNewEmojiCode(e.target.value)}
                    placeholder="partyparrot"
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="flex-[1.4] text-[11px] text-muted-foreground">
                  {t('chat.imageUrl')}
                  <input
                    value={newEmojiUrl}
                    onChange={(e) => setNewEmojiUrl(e.target.value)}
                    placeholder="https://…/emoji.png"
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <Button
                  size="sm"
                  disabled={!newEmojiCode.trim() || !newEmojiUrl.trim() || addCustomEmojiMutation.isPending}
                  onClick={() => addCustomEmojiMutation.mutate({ shortcode: newEmojiCode.trim(), imageUrl: newEmojiUrl.trim() })}
                >
                  {t('chat.add')}
                </Button>
              </div>
              {/* Upload path (§A3.8) — same presign flow as chat attachments, so
                  an emoji no longer has to be hosted somewhere else first. */}
              <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                <Upload className="h-3.5 w-3.5" />
                {emojiUploading ? t('chat.uploading') : t('chat.uploadEmojiImage')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={emojiUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void uploadEmojiImage(file)
                  }}
                />
              </label>
              <div className="mt-4 max-h-64 overflow-y-auto space-y-1">
                {customEmoji.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    {t('chat.noCustomEmojiPre')} <code>:shortcode:</code> {t('chat.noCustomEmojiPost')}
                  </div>
                ) : (
                  customEmoji.map((ce) => (
                    <div key={ce.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40">
                      <img src={ce.imageUrl} alt={ce.shortcode} className="h-6 w-6 object-contain" />
                      <span className="flex-1 text-sm">:{ce.shortcode}:</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-red-500"
                        title={t('chat.removeEmoji')}
                        onClick={() => deleteCustomEmojiMutation.mutate(ce.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Right-click message context menu (Plan §6.10). A full-screen backdrop
            handles click-away and swallows a second right-click. */}
        {messageMenu && (
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMessageMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMessageMenu(null)
            }}
          >
            <div
              className="absolute min-w-[208px] rounded-lg border border-border bg-card shadow-lg p-1"
              style={{
                top: Math.min(messageMenu.y, window.innerHeight - 120),
                left: Math.min(messageMenu.x, window.innerWidth - 224),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setTaskDraft({ message: messageMenu.message, assigneeId: '', dueAt: '' })
                  setMessageMenu(null)
                }}
              >
                <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                {t('chat.createTaskFromMessage')}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  markUnreadMutation.mutate({
                    channelId: messageMenu.message.channelId,
                    messageId: messageMenu.message.id,
                  })
                  setMessageMenu(null)
                }}
              >
                <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
                {t('chat.markUnreadFromHere')}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setReplyTo(messageMenu.message)
                  setThreadParentId(messageMenu.message.id)
                  setMessageMenu(null)
                }}
              >
                <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                {t('chat.reply')}
              </button>
            </div>
          </div>
        )}

        {/*
          G11-2 [14:52] — "Forward this message", as a modal.
        
          The old control was an inline popover of the first ten conversations.
          Three things were wrong with it and only one is cosmetic: a workspace
          with more than ten conversations could not forward to the eleventh at
          all; there was nowhere to say WHY you were forwarding; and a single
          click sent it, with no confirm and no undo.
        */}
        {forwardDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setForwardDraft(null)}
          >
            <Card
              className="w-full max-w-md p-4"
              data-testid="forward-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('chat.forwardTitle')}</h3>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('common.cancel')}
                  onClick={() => setForwardDraft(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* What you are about to send, so you can see you picked the
                  right message before it leaves. */}
              <p
                className="mb-3 line-clamp-3 rounded border border-border/70 bg-muted/30 px-2 py-1.5 text-[12px] text-muted-foreground"
                data-testid="forward-preview"
              >
                {forwardDraft.message.body}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] text-muted-foreground">
                    {t('chat.forwardTo')}
                  </label>
                  <Input
                    autoFocus
                    value={forwardQuery}
                    data-testid="forward-search"
                    placeholder={t('chat.forwardSearchPlaceholder')}
                    onChange={(e) => setForwardQuery(e.target.value)}
                  />
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border/60">
                    {forwardTargets.length === 0 && (
                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground" data-testid="forward-no-match">
                        {t('chat.forwardNoMatch')}
                      </p>
                    )}
                    {forwardTargets.map((channel) => (
                      <button
                        key={`fwd-${channel.id}`}
                        type="button"
                        data-testid={`forward-target-${channel.id}`}
                        onClick={() => setForwardDraft((d) => (d ? { ...d, to: channel.id } : d))}
                        className={cn(
                          'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]',
                          forwardDraft.to === channel.id
                            ? 'bg-accent/15 text-foreground'
                            : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                        )}
                      >
                        {channel.isDm
                          ? channel.dmLabel ?? channel.dmPeerName ?? t('chat.directMessage')
                          : `#${channel.name}`}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.forwardNote')}
                  <Input
                    value={forwardDraft.note}
                    data-testid="forward-note"
                    placeholder={t('chat.forwardNotePlaceholder')}
                    onChange={(e) => setForwardDraft((d) => (d ? { ...d, note: e.target.value } : d))}
                    className="mt-0.5"
                  />
                </label>

                <div className="flex gap-2">
                  <Button
                    data-testid="forward-confirm"
                    // Disabled until somebody is chosen: the old control sent on
                    // the click that picked the recipient, so a stray click was
                    // an irreversible forward.
                    disabled={!forwardDraft.to || forwardMutation.isPending}
                    onClick={() =>
                      forwardMutation.mutate({
                        channelId: forwardDraft.to,
                        // The note goes ahead of the quoted body. No
                        // "Forwarded message:" prefix — the message says so
                        // itself, and the prefix became part of the text the
                        // moment anyone forwarded it onward again.
                        body: forwardDraft.note.trim()
                          ? `${forwardDraft.note.trim()}\n\n${forwardDraft.message.body}`
                          : forwardDraft.message.body,
                        sourceId: forwardDraft.message.id,
                      })
                    }
                  >
                    {forwardMutation.isPending ? t('common.saving') : t('chat.forward')}
                  </Button>
                  <Button variant="outline" onClick={() => setForwardDraft(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {taskDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setTaskDraft(null)}
          >
            <Card className="w-full max-w-md p-4" data-testid="chat-task-draft" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('chat.createTaskFromMessage')}</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setTaskDraft(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 line-clamp-3 rounded border border-border/70 bg-muted/30 px-2 py-1.5 text-[12px] text-muted-foreground">
                {taskDraft.message.body}
              </p>
              <div className="space-y-3">
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.assignee')}
                  <select
                    value={taskDraft.assigneeId}
                    data-testid="chat-task-draft-assignee"
                    onChange={(e) => setTaskDraft((prev) => (prev ? { ...prev, assigneeId: e.target.value } : prev))}
                    className="mt-0.5 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">{t('chat.unassigned')}</option>
                    {(membersQuery.data ?? []).map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName || m.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.dueDate')}
                  <input
                    type="date"
                    value={taskDraft.dueAt}
                    onChange={(e) => setTaskDraft((prev) => (prev ? { ...prev, dueAt: e.target.value } : prev))}
                    className="mt-0.5 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setTaskDraft(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={createTaskFromMessage.isPending}
                  onClick={() =>
                    createTaskFromMessage.mutate({
                      messageId: taskDraft.message.id,
                      assigneeId: taskDraft.assigneeId || undefined,
                      dueAt: taskDraft.dueAt || undefined,
                    })
                  }
                >
                  {createTaskFromMessage.isPending ? t('common.saving') : t('chat.createTask')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/*
          * §G11 [15:19] — "Set reminder" on a message.
          *
          * The reminder points at the message, so when it fires it takes you
          * back to the line you wanted to remember. Before this it could not
          * exist: `reminders.task_id` was NOT NULL, so a reminder could only be
          * about a task, and the /remind command had to invent one.
          */}
        {remindDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setRemindDraft(null)}
          >
            <Card className="w-full max-w-md p-4" data-testid="remind-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('chat.setReminder')}</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setRemindDraft(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 line-clamp-3 rounded border border-border/70 bg-muted/30 px-2 py-1.5 text-[12px] text-muted-foreground">
                {remindDraft.message.body}
              </p>
              <div className="space-y-3">
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.remindMeAt')}
                  <input
                    type="datetime-local"
                    data-testid="remind-when"
                    value={remindDraft.when}
                    onChange={(e) => setRemindDraft((prev) => (prev ? { ...prev, when: e.target.value } : prev))}
                    className="mt-0.5 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-[12px] text-muted-foreground">
                  {t('chat.reminderNote')}
                  <input
                    value={remindDraft.note}
                    placeholder={t('chat.reminderNotePlaceholder')}
                    onChange={(e) => setRemindDraft((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                    className="mt-0.5 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setRemindDraft(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  data-testid="remind-confirm"
                  disabled={!remindDraft.when || remindAboutMessageMutation.isPending}
                  onClick={() =>
                    remindAboutMessageMutation.mutate({
                      messageId: remindDraft.message.id,
                      // The field is local wall-clock; the API wants an instant.
                      remindAt: new Date(remindDraft.when).toISOString(),
                      note: remindDraft.note,
                    })
                  }
                >
                  {remindAboutMessageMutation.isPending ? t('common.saving') : t('chat.setReminder')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {editHistoryFor && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEditHistoryFor(null)}
          >
            <Card className="w-full max-w-lg p-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{t('chat.editHistory')}</h3>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditHistoryFor(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5">
                {editHistoryQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
                ) : (editHistoryQuery.data?.edits.length ?? 0) === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('chat.noEditHistory')}</div>
                ) : (
                  <>
                    <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
                      <div className="text-[11px] font-medium text-violet-600 dark:text-violet-300 mb-1">
                        {t('chat.currentVersion')}
                        {editHistoryQuery.data?.current.editedAt
                          ? ` · ${formatRelativeTime(editHistoryQuery.data.current.editedAt)}`
                          : ''}
                      </div>
                      <ChatMessageBody
                        text={editHistoryQuery.data?.current.body ?? ''}
                        namesById={namesById}
                        className="text-[13px]"
                        linkPreviews={false}
                        customEmoji={emojiByCode}
                      />
                    </div>
                    {editHistoryQuery.data?.edits.map((e) => (
                      <div key={e.id} className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">
                          {t('chat.previousVersion')} · {formatRelativeTime(e.editedAt)}
                        </div>
                        <ChatMessageBody text={e.previousBody} namesById={namesById} className="text-[13px] opacity-80" linkPreviews={false} customEmoji={emojiByCode} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Card>
          </div>
        )}

        <div
          ref={scrollRef}
          className={cn('flex-1 overflow-y-auto px-5 py-4', dmSharedOpen && 'hidden')}
          // The browser's own scroll anchoring would ALSO shift this when older
          // messages land above; the layout effect that keeps the reader in
          // place is the one rule, so the browser's is switched off.
          style={{ overflowAnchor: 'none' }}
          onDragOver={(e) => {
            if (!selectedId || !Array.from(e.dataTransfer.types).includes('Files')) return
            e.preventDefault()
            setPaneDragging(true)
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setPaneDragging(false)
          }}
          onDrop={(e) => {
            if (!selectedId || !Array.from(e.dataTransfer.types).includes('Files')) return
            e.preventDefault()
            setPaneDragging(false)
            const files = Array.from(e.dataTransfer.files ?? [])
            if (files.length > 0) void uploadFiles(files)
          }}
        >
          {firstUnreadId && (
            <button
              type="button"
              onClick={() => messageRefs.current[firstUnreadId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="sticky top-1 z-20 mx-auto flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[12px] font-medium text-rose-600 shadow-sm backdrop-blur-[1px] dark:text-rose-300"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {t('chat.jumpToUnread', { count: unreadCount })}
            </button>
          )}
          {paneDragging && (
            <div className="pointer-events-none sticky top-1 z-20 mx-auto flex max-w-3xl items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-500/60 bg-violet-500/10 py-3 text-[13px] font-medium text-violet-700 backdrop-blur-[1px] dark:text-violet-200">
              <Paperclip className="h-4 w-4" /> {t('chat.dropToShare')}
            </div>
          )}
          {/* "This is the start of the conversation" is a claim about the
              channel, so it waits for the channel's answer: shapes while the
              first page loads, and a failure said as one — both used to
              render as an empty channel. */}
          {selectedId && messagesQuery.isPending ? (
            <div className="max-w-3xl mx-auto" data-testid="chat-messages-loading">
              <ListSkeleton rows={6} rowClassName="h-12" />
            </div>
          ) : messagesQuery.isError && rootMessages.length === 0 ? (
            <div className="py-16 text-center space-y-2" data-testid="chat-load-failed">
              <p className="text-sm text-destructive">{t('chat.loadFailed')}</p>
              <button
                type="button"
                onClick={() => void messagesQuery.refetch()}
                className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : rootMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                {selectedChannel?.isDm ? (
                  <Users className="h-7 w-7 text-violet-600 dark:text-violet-300" />
                ) : (
                  <Hash className="h-7 w-7 text-violet-600 dark:text-violet-300" />
                )}
              </div>
              <h3 className="text-[18px] font-semibold text-foreground mb-1">
                {selectedChannel?.isDm
                  ? t('chat.messageSomeone', { name: selectedChannel.dmLabel ?? selectedChannel.dmPeerName ?? t('chat.teammate') })
                  : t('chat.welcomeToChannel', { name: selectedChannel?.name ?? t('chat.channelFallback') })}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                {t('chat.conversationStart')}
              </p>
              {/*
                * §G11 [14:16] — an empty channel offers something to do.
                *
                * A headline and a sentence tell somebody the room is empty,
                * which they can see. These are the four things people actually
                * open a new channel to do, each landing on the surface that
                * already does it. A DM gets the two that make sense in one:
                * there is nobody to add and no channel to track tasks against.
                *
                * "Import from Slack" is in the frames and is NOT here: no
                * Slack import exists anywhere in this codebase, and a card
                * that opens nothing is worse than a card that is absent.
                */}
              <div className="mt-6 grid w-full grid-cols-2 gap-2" data-testid="channel-empty-actions">
                {!selectedChannel?.isDm && (
                  <button
                    type="button"
                    data-testid="empty-add-people"
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:border-violet-500/50 hover:bg-muted/50"
                    onClick={() => setAddPeopleOpen(true)}
                  >
                    <UserPlus className="h-4 w-4 shrink-0 text-violet-500" />
                    {t('chat.emptyAddPeople')}
                  </button>
                )}
                {!selectedChannel?.isDm && (
                  <button
                    type="button"
                    data-testid="empty-track-tasks"
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:border-violet-500/50 hover:bg-muted/50"
                    // Home, not a /tasks route — there isn't one. Home is where
                    // "Assigned to me" and today's work already live.
                    onClick={() => navigate({ to: '/app/$workspaceId', params: { workspaceId } })}
                  >
                    <ListTodo className="h-4 w-4 shrink-0 text-violet-500" />
                    {t('chat.emptyTrackTasks')}
                  </button>
                )}
                {selectedChannel?.isDm && (
                  <button
                    type="button"
                    data-testid="empty-view-calendar"
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:border-violet-500/50 hover:bg-muted/50"
                    onClick={() => setDmTab('calendar')}
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-violet-500" />
                    {t('chat.emptyViewCalendar')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="empty-add-doc"
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:border-violet-500/50 hover:bg-muted/50"
                  onClick={() => navigate({ to: '/app/$workspaceId/docs', params: { workspaceId } })}
                >
                  <FileText className="h-4 w-4 shrink-0 text-violet-500" />
                  {t('chat.emptyAddDoc')}
                </button>
                <button
                  type="button"
                  data-testid="empty-start-syncup"
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:border-violet-500/50 hover:bg-muted/50"
                  onClick={() => setCallAction({ kind: 'start' })}
                >
                  <Video className="h-4 w-4 shrink-0 text-violet-500" />
                  {t('chat.emptyStartSyncup')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0 max-w-3xl mx-auto">
              {/* Older history, on scroll-up. Offered only once the channel has
                  been scrolled to its bottom, so opening one does not page back
                  on its own while the view is still at the top. */}
              {messagesQuery.hasNextPage && bottomedFor === selectedId && (
                <LoadOlder
                  query={messagesQuery}
                  testId="chat-load-older"
                  label={t('chat.loadOlderMessages')}
                  failedLabel={t('chat.loadOlderMessagesFailed')}
                  onBeforeLoad={rememberScroll}
                />
              )}
              {rootMessages.map((m, i) => {
                const showAuthor = shouldShowMessageHeader(rootMessages, i)
                const showDate = shouldShowDateDivider(rootMessages, i)
                // An imported message is not its importer's own words, whoever it is kept under.
                const mine = m.authorId === me?.id && !m.importedAuthor
                // Prefer the larger of the server's thread stats (§6.4) and any
                // replies already loaded client-side (thread open / realtime).
                const localReplies = repliesByParent.get(m.id) ?? []
                const replyCount = Math.max(m.replyCount ?? 0, localReplies.length)
                const localLastReplyMs = localReplies.reduce(
                  (max, r) => Math.max(max, new Date(r.createdAt).getTime()),
                  0,
                )
                const serverLastReplyMs = m.lastReplyAt ? new Date(m.lastReplyAt).getTime() : 0
                const lastReplyMs = Math.max(localLastReplyMs, serverLastReplyMs)
                return (
                  <div key={m.id} className="contents">
                    {/* Where you left off (§A3.3). */}
                    {firstUnreadId === m.id && (
                      <div className="flex items-center gap-3 py-2">
                        <div className="h-px flex-1 bg-rose-500/50" />
                        <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                          {t('chat.unreadMessages')}
                        </span>
                        <div className="h-px flex-1 bg-rose-500/50" />
                      </div>
                    )}
                    {showDate && (
                      <div className="flex items-center gap-3 py-4">
                        <div className="h-px flex-1 bg-border/80" />
                        <span className="text-[11px] font-medium text-muted-foreground px-2">
                          {formatDateDivider(m.createdAt)}
                        </span>
                        <div className="h-px flex-1 bg-border/80" />
                      </div>
                    )}
                  <div
                    key={`${m.id}-row`}
                    ref={(el) => {
                      messageRefs.current[m.id] = el
                    }}
                    data-testid={`message-row-${m.id}`}
                    /*
                     * The highlight, as a fact rather than as a colour. It is
                     * what tells you a link to a message actually arrived, and
                     * it was only ever expressed as two Tailwind classes — so
                     * the one thing worth asserting about the permalink could
                     * not be asserted without matching on a ring shade.
                     */
                    data-highlighted={highlightedMessageId === m.id ? 'true' : 'false'}
                    className={cn(
                      'relative flex gap-3 group rounded-md px-2 py-0.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors',
                      highlightedMessageId === m.id && 'ring-1 ring-violet-500/40 bg-violet-500/5',
                    )}
                    onContextMenu={(e) => {
                      // Right-click → message actions (Plan §6.10). Suppress the
                      // browser's own menu and anchor ours at the cursor.
                      if (m.deletedAt || editingMessageId === m.id) return
                      e.preventDefault()
                      setMessageMenu({ message: m, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <div className="w-9 shrink-0">
                      {showAuthor && (
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center hover:brightness-110"
                          // §G06 [05:43] — one profile panel, everywhere. The
                          // card this used to open is `hidden xl:flex`, so
                          // below 1280px clicking a name did nothing at all.
                          onClick={() => openPersonPanel(m.authorId)}
                        >
                          {(m.authorName ?? '?')[0]?.toUpperCase()}
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showAuthor && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {m.importedAuthor ? (
                            // Somebody who is not a member here: their name, and that it was imported — no person to open.
                            <span className="text-[14px] font-semibold text-foreground" data-testid="chat-message-imported-author">
                              {m.authorName ?? m.importedAuthor}
                              <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground" data-testid="chat-message-imported">
                                {t('chat.importedTag')}
                              </span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={cn('text-[14px] font-semibold hover:underline', mine ? 'text-violet-600 dark:text-violet-300' : 'text-foreground')}
                              onClick={() => openPersonPanel(m.authorId)}
                            >
                              {m.authorName ?? t('chat.unknownUser')}
                            </button>
                          )}
                          <span className="text-[10px] text-muted-foreground/90 tabular-nums">
                            {formatMessageTime(m.createdAt)}
                          </span>
                        </div>
                      )}
                      {m.pinnedAt && !m.deletedAt && (
                        <div className="flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-300 mb-0.5">
                          <Pin className="h-2.5 w-2.5" />
                          {t('chat.pinned')}{m.pinnedByName ? ` ${t('chat.pinnedBy', { name: m.pinnedByName })}` : ''}
                          {m.pinnedAt ? ` · ${formatMessageTime(m.pinnedAt)}` : ''}
                        </div>
                      )}
                      {/*
                        §G11 [15:11] — saving a message left no trace. The
                        bookmark tinted, but the whole action bar is hover-
                        revealed, so the moment the pointer left there was
                        nothing saying this message was in Later. Pinned already
                        had a persistent row badge; saved gets the same, because
                        "did that work?" should not require re-hovering.
                      */}
                      {savedIds.has(m.id) && !m.deletedAt && (
                        <div
                          data-testid={`message-saved-badge-${m.id}`}
                          className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-300 mb-0.5"
                        >
                          <Bookmark className="h-2.5 w-2.5" />
                          {t('chat.savedToLater')}
                        </div>
                      )}
                      {m.deletedAt ? (
                        <div className="text-[13px] italic text-muted-foreground/80">{t('chat.messageDeleted')}</div>
                      ) : editingMessageId === m.id ? (
                        <div className="mt-0.5">
                          <textarea
                            autoFocus
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                if (editingBody.trim()) editMessageMutation.mutate({ messageId: m.id, body: editingBody.trim() })
                              }
                              if (e.key === 'Escape') {
                                setEditingMessageId(null)
                                setEditingBody('')
                              }
                            }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-ring"
                            rows={2}
                          />
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <button
                              type="button"
                              className="text-violet-600 dark:text-violet-300 hover:underline"
                              onClick={() => editingBody.trim() && editMessageMutation.mutate({ messageId: m.id, body: editingBody.trim() })}
                            >
                              {t('common.save')}
                            </button>
                            <button
                              type="button"
                              className="hover:underline"
                              onClick={() => {
                                setEditingMessageId(null)
                                setEditingBody('')
                              }}
                            >
                              {t('common.cancel')}
                            </button>
                            <span>· {t('chat.editHint')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[14px] whitespace-pre-wrap break-words leading-[1.45] text-foreground/90">
                          {/*
                            §12 [15:00] — a forward says it is one, and offers
                            the way back: "aap 'View Message' dekhoge to aap us
                            group mein chale jaoge." No link when the source
                            sits somewhere this reader cannot open — still
                            labelled, because that part is true either way.
                          */}
                          {m.forwardedFromId && (
                            <div
                              className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"
                              data-testid={`forwarded-${m.id}`}
                            >
                              <Forward className="h-3 w-3 shrink-0" />
                              {/*
                                §G11-1 — "Forwarded" on its own is a quote with
                                the attribution torn off. The channel, the
                                author and the time were already on the wire;
                                only the render was missing. Each part degrades
                                on its own, because a deleted author or an
                                unreachable channel must not blank the line.
                              */}
                              <span>
                                {m.forwardedFrom?.channelName
                                  ? t('chat.forwardedFrom', { channel: m.forwardedFrom.channelName })
                                  : t('chat.forwarded')}
                              </span>
                              {m.forwardedFrom?.authorName && (
                                <span data-testid={`forwarded-author-${m.id}`}>
                                  · {m.forwardedFrom.authorName}
                                </span>
                              )}
                              {m.forwardedFrom?.sentAt && (
                                <span data-testid={`forwarded-when-${m.id}`}>
                                  ·{' '}
                                  {new Date(m.forwardedFrom.sentAt).toLocaleString(undefined, {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                              {m.forwardedFrom && (
                                <button
                                  type="button"
                                  data-testid={`forwarded-view-${m.id}`}
                                  onClick={() =>
                                    navigate({
                                      to: '/app/$workspaceId/chat',
                                      params: { workspaceId },
                                      search: {
                                        channel: m.forwardedFrom!.channelId,
                                        message: m.forwardedFromId!,
                                      },
                                    })
                                  }
                                  className="underline underline-offset-2 hover:text-foreground"
                                >
                                  {t('chat.viewMessage')}
                                </button>
                              )}
                            </div>
                          )}
                          {/*
                            §2.8 gap 9 — a message that points at a call renders
                            as the card. The plain-words body stays underneath
                            nothing: it exists for clients that do not know what
                            a call card is (a digest email, a search result), so
                            showing both here would say it twice.
                          */}
                          {m.call ? (
                            <CallCard
                              call={m.call}
                              onJoin={() => setCallAction({ kind: 'join', callId: m.call!.id })}
                              onLeave={() => setCallAction({ kind: 'leave', callId: m.call!.id })}
                            />
                          ) : (
                            m.body && <ChatMessageBody text={m.body} namesById={namesById} customEmoji={emojiByCode} />
                          )}
                          {m.editedAt && (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground ml-1 hover:text-foreground hover:underline"
                              title={t('chat.viewEditHistory')}
                              onClick={() => setEditHistoryFor(m.id)}
                            >
                              {t('chat.edited')}
                            </button>
                          )}
                          {!m.deletedAt && m.attachments && m.attachments.length > 0 && (
                            <ChatAttachmentList attachments={m.attachments} />
                          )}
                        </div>
                      )}
                      {!m.deletedAt && editingMessageId !== m.id && (
                      <div className="absolute right-3 -top-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                        <div className="relative rounded-lg border border-border/80 bg-background shadow-md px-1 py-0.5 flex items-center gap-0.5">
                          <button
                            type="button"
                            title={t('chat.react')}
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setReactionPickerFor((prev) => (prev === m.id ? null : m.id))}
                          >
                            <Smile className="h-3 w-3" />
                          </button>
                          {/* §2.8 gap 7 — reacting opens the whole library, the
                              same one the composer opens. Six emoji and a link
                              to a settings screen was the old answer.

                              Portalled, not absolutely positioned. As a child
                              of the message scroller it was clipped by
                              `overflow-y-auto` for every message below the top
                              third — the category strip and most of the grid
                              simply cut off. The composer's picker never had
                              this because it goes through Popover, so this one
                              does now, and gets collision handling with it. */}
                          {reactionPickerFor === m.id && (
                            <Popover open onOpenChange={(o) => !o && setReactionPickerFor(null)}>
                              <PopoverAnchor asChild>
                                <span className="absolute right-0 top-8 h-0 w-0" aria-hidden />
                              </PopoverAnchor>
                              <PopoverContent align="end" side="bottom" className="w-auto p-0">
                                <EmojiPicker
                                  onSelect={(emoji) => {
                                    toggleReactionMutation.mutate({ messageId: m.id, emoji })
                                    setReactionPickerFor(null)
                                  }}
                                  onSelectCustom={(shortcode) => {
                                    toggleReactionMutation.mutate({ messageId: m.id, emoji: `:${shortcode}:` })
                                    setReactionPickerFor(null)
                                  }}
                                  customEmoji={customEmoji}
                                  onAddCustom={() => {
                                    setEmojiManagerOpen(true)
                                    setReactionPickerFor(null)
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          )}
                          {/* §G11 [14:16] — the bar ends in `⋯`.
                              It used to show up to twelve icons at once, with a
                              right-click menu holding three of them. That put
                              the crowded surface in front of everyone and the
                              short one behind a gesture nobody tries. What
                              stays inline is what gets used on almost every
                              message; the tail moved into the overflow. */}
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          {/*
                            §G11 [14:16]–[14:21] — hovering a message reveals
                            quick reactions "👍 ✅ 🔥", as the emoji themselves.
                            This was one ThumbsUp ICON: a picture of a reaction
                            rather than the reaction, and only one of the three.
                            The thread panel already did it this way, so the
                            same message offered different reactions depending
                            on which surface you hovered it in.
                          */}
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={`${m.id}-quick-${emoji}`}
                              type="button"
                              data-testid={`message-quick-${emoji}-${m.id}`}
                              title={t('chat.react')}
                              className={cn(
                                'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center text-[12px]',
                                m.reactions?.some((r) => r.emoji === emoji && r.reacted)
                                  ? 'bg-accent/20'
                                  : '',
                              )}
                              onClick={() => toggleReactionMutation.mutate({ messageId: m.id, emoji })}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            title={t('chat.reply')}
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => {
                              setReplyTo(m)
                              setThreadParentId(m.id)
                            }}
                          >
                            <Reply className="h-3 w-3" />
                          </button>
                          {/* §G11 [15:36] — Assign. Now assigns.
                              The old one appended `<@id>` to the composer,
                              which is a mention: nobody is asked, nothing is
                              tracked, and nothing says so afterwards. */}
                          <button
                            type="button"
                            data-testid={`message-assign-${m.id}`}
                            title={t('chat.assignMessage')}
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center',
                              m.assignments?.some((a) => !a.resolvedAt)
                                ? 'text-violet-600 dark:text-violet-300'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => setAssignPickerFor((prev) => (prev === m.id ? null : m.id))}
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                          {assignPickerFor === m.id && (
                            <Popover open onOpenChange={(o) => !o && setAssignPickerFor(null)}>
                              <PopoverAnchor asChild>
                                <span className="absolute right-0 top-8 h-0 w-0" aria-hidden />
                              </PopoverAnchor>
                              <PopoverContent align="end" side="bottom" className="w-60 p-1.5">
                                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {t('chat.assignMessageTo')}
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-0.5">
                                  {assignCandidates.length === 0 ? (
                                    <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                                      {t('chat.noOneToAssign')}
                                    </div>
                                  ) : (
                                    assignCandidates.map((person) => {
                                      const already = m.assignments?.find((a) => a.assigneeId === person.userId)
                                      return (
                                        <button
                                          key={`assign-${m.id}-${person.userId}`}
                                          type="button"
                                          data-testid={`assign-option-${person.userId}`}
                                          disabled={assignMessageMutation.isPending}
                                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                                          onClick={() =>
                                            already
                                              ? unassignMessageMutation.mutate({ messageId: m.id, assigneeId: person.userId })
                                              : assignMessageMutation.mutate({ messageId: m.id, assigneeId: person.userId })
                                          }
                                        >
                                          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="flex-1 truncate">{person.displayName || person.email}</span>
                                          {already && <Check className="h-3.5 w-3.5 text-violet-500" />}
                                        </button>
                                      )
                                    })
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                          <button
                            type="button"
                            title={savedIds.has(m.id) ? t('chat.removeFromSaved') : t('chat.saveMessage')}
                            disabled={setSavedMutation.isPending}
                            className={cn(
                              'h-[22px] w-[22px] rounded hover:bg-muted flex items-center justify-center disabled:opacity-50',
                              savedIds.has(m.id) ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => setSavedMutation.mutate({ messageId: m.id, saved: !savedIds.has(m.id) })}
                          >
                            <Bookmark className="h-3 w-3" />
                          </button>
                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            data-testid={`message-overflow-${m.id}`}
                            title={t('chat.moreActions')}
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setOverflowFor((prev) => (prev === m.id ? null : m.id))}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                          {overflowFor === m.id && (
                            <Popover open onOpenChange={(o) => !o && setOverflowFor(null)}>
                              <PopoverAnchor asChild>
                                <span className="absolute right-0 top-8 h-0 w-0" aria-hidden />
                              </PopoverAnchor>
                              <PopoverContent align="end" side="bottom" className="w-56 p-1" data-testid="message-overflow-menu">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setInput((prev) => `${prev ? `${prev}\n` : ''}/ai summarize: ${m.body.slice(0, 120)}`)
                                    setOverflowFor(null)
                                  }}
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.askAi')}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setTaskDraft({ message: m, assigneeId: '', dueAt: '' })
                                    setOverflowFor(null)
                                  }}
                                >
                                  <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.createTaskFromMessage')}
                                </button>
                                {/* §G11 [15:19] — "Set reminder", on the message
                                    itself. It used to be impossible: a reminder
                                    could only hang off a task. */}
                                <button
                                  type="button"
                                  data-testid={`message-remind-${m.id}`}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setRemindDraft({ message: m, when: defaultReminderWhen(), note: '' })
                                    setOverflowFor(null)
                                  }}
                                >
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.setReminder')}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    markUnreadMutation.mutate({ channelId: m.channelId, messageId: m.id })
                                    setOverflowFor(null)
                                  }}
                                >
                                  <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.markUnreadFromHere')}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setForwardDraft({ message: m, to: '', note: '' })
                                    setForwardQuery('')
                                    setOverflowFor(null)
                                  }}
                                >
                                  <Forward className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.forward')}
                                </button>
                                {/* §G11 — beside Forward, because they answer the
                                    same question: this message needs to reach
                                    somebody who is not looking at it. */}
                                <button
                                  type="button"
                                  data-testid={`message-copy-link-${m.id}`}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    copyMessageLink(m)
                                    setOverflowFor(null)
                                  }}
                                >
                                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.copyLink')}
                                </button>
                                <button
                                  type="button"
                                  disabled={setPinnedMutation.isPending}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                                  onClick={() => {
                                    setPinnedMutation.mutate({ messageId: m.id, pinned: !m.pinnedAt })
                                    setOverflowFor(null)
                                  }}
                                >
                                  {m.pinnedAt ? (
                                    <PinOff className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  {m.pinnedAt ? t('chat.unpinFromChannel') : t('chat.pinToChannel')}
                                </button>
                                {/* §G12 [17:13] — mute or follow this one thread.
                                    Offered once a thread exists: there is
                                    nothing to be noisy about before that. */}
                                {replyCount > 0 && (
                                  <>
                                    <div className="my-1 h-px bg-border/70" />
                                    <button
                                      type="button"
                                      data-testid={`thread-mute-${m.id}`}
                                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                      onClick={() => {
                                        threadFollowMutation.mutate({
                                          messageId: m.id,
                                          state: m.threadFollowState === 'muted' ? null : 'muted',
                                        })
                                        setOverflowFor(null)
                                      }}
                                    >
                                      <BellOff
                                        className={cn(
                                          'h-3.5 w-3.5',
                                          m.threadFollowState === 'muted' ? 'text-violet-500' : 'text-muted-foreground',
                                        )}
                                      />
                                      {m.threadFollowState === 'muted' ? t('chat.unmuteThread') : t('chat.muteThread')}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`thread-follow-${m.id}`}
                                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                      onClick={() => {
                                        threadFollowMutation.mutate({
                                          messageId: m.id,
                                          state: m.threadFollowState === 'following' ? null : 'following',
                                        })
                                        setOverflowFor(null)
                                      }}
                                    >
                                      <Bell
                                        className={cn(
                                          'h-3.5 w-3.5',
                                          m.threadFollowState === 'following' ? 'text-violet-500' : 'text-muted-foreground',
                                        )}
                                      />
                                      {m.threadFollowState === 'following' ? t('chat.unfollowThread') : t('chat.followThread')}
                                    </button>
                                  </>
                                )}
                                {mine && (
                                  <>
                                    <div className="my-1 h-px bg-border/70" />
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                      onClick={() => {
                                        setEditingMessageId(m.id)
                                        setEditingBody(m.body)
                                        setOverflowFor(null)
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                      {t('chat.editMessage')}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deleteMessageMutation.isPending}
                                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                                      onClick={() => {
                                        if (window.confirm(t('chat.deleteMessageConfirm'))) deleteMessageMutation.mutate(m.id)
                                        setOverflowFor(null)
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      {t('chat.deleteMessage')}
                                    </button>
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}

                        </div>
                      </div>
                      )}
                      {/* §G11 [15:36] — the assignment, on the message.
                          Anyone in the channel can see who was asked; only the
                          assignee or whoever asked would think to press the
                          tick, and both are allowed to. */}
                      {!!m.assignments?.length && (
                        <div className="mt-1 flex flex-wrap items-center gap-1" data-testid={`message-assignments-${m.id}`}>
                          {m.assignments.map((a) => (
                            <span
                              key={a.id}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                                a.resolvedAt
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                  : 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
                              )}
                            >
                              <button
                                type="button"
                                title={a.resolvedAt ? t('chat.reopenAssignment') : t('chat.markAssignmentDone')}
                                data-testid={`assignment-resolve-${a.assigneeId}`}
                                disabled={resolveAssignmentMutation.isPending}
                                className="disabled:opacity-50"
                                onClick={() =>
                                  resolveAssignmentMutation.mutate({
                                    messageId: m.id,
                                    assigneeId: a.assigneeId,
                                    resolved: !a.resolvedAt,
                                  })
                                }
                              >
                                {a.resolvedAt ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                              </button>
                              <span>
                                {t('chat.assignedTo', {
                                  name:
                                    a.assigneeId === me?.id
                                      ? t('chat.you')
                                      : a.assigneeName || namesById[a.assigneeId] || t('chat.unknownUser'),
                                })}
                              </span>
                              {a.dueAt && (
                                <span className="opacity-80">· {new Date(a.dueAt).toLocaleDateString()}</span>
                              )}
                              <button
                                type="button"
                                title={t('chat.removeAssignment')}
                                className="opacity-60 hover:opacity-100"
                                onClick={() =>
                                  unassignMessageMutation.mutate({ messageId: m.id, assigneeId: a.assigneeId })
                                }
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {!!m.reactions?.length && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {m.reactions.map((r) => {
                            const code = /^:([a-z0-9_]+):$/.exec(r.emoji)?.[1]
                            const customUrl = code ? emojiByCode.get(code) : undefined
                            const emojiLabel = code ? `:${code}:` : r.emoji
                            // Who reacted (§6.5): name the reactors in the tooltip,
                            // showing the current user as "You".
                            const reactorNames = (r.users ?? []).map((u) => (u.id === me?.id ? t('chat.you') : u.name))
                            const shownNames =
                              reactorNames.length <= 6
                                ? reactorNames.join(', ')
                                : `${reactorNames.slice(0, 6).join(', ')} +${reactorNames.length - 6}`
                            const reactionTitle = reactorNames.length
                              ? t('chat.reactedWith', { names: shownNames, emoji: emojiLabel })
                              : emojiLabel
                            return (
                              <button
                                key={`${m.id}-${r.emoji}`}
                                type="button"
                                className={cn(
                                  'text-[10px] rounded-full border px-1.5 py-0.5 transition-colors flex items-center gap-1',
                                  r.reacted ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border/70',
                                )}
                                onClick={() => toggleReactionMutation.mutate({ messageId: m.id, emoji: r.emoji })}
                                title={reactionTitle}
                              >
                                {customUrl ? (
                                  <img src={customUrl} alt={code} className="h-3.5 w-3.5 object-contain" />
                                ) : (
                                  <span>{r.emoji}</span>
                                )}
                                {r.count}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {replyCount > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                            data-testid={`view-thread-${m.id}`}
                            onClick={() => setThreadParentId(m.id)}
                          >
                            {t('chat.viewThread', { count: replyCount })}
                          </button>
                          {lastReplyMs > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              {t('chat.lastReply', { time: formatRelativeTime(new Date(lastReplyMs).toISOString()) })}
                            </span>
                          )}
                        </div>
                      )}
                      {mine && !m.deletedAt && (() => {
                        // Subtle Delivered/Seen indicator on my own messages
                        // (Plan §6.2). Seen supersedes Delivered; 'sent' shows
                        // nothing to avoid clutter.
                        const status = deliveryStatusFor(m)
                        if (status !== 'delivered' && status !== 'seen') return null
                        return (
                          <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-muted-foreground">
                            {status === 'seen' ? (
                              <CheckCheck className="h-3 w-3 text-violet-500" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            <span>{status === 'seen' ? t('chat.seen') : t('chat.delivered')}</span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {seenByNames.length > 0 && !dmSharedOpen && (
          <div className="px-5 pb-1 text-right text-[10px] text-muted-foreground">
            {t('chat.seenBy')}{' '}
            {seenByNames.length <= 3
              ? seenByNames.join(', ')
              : `${seenByNames.slice(0, 2).join(', ')} +${seenByNames.length - 2}`}
          </div>
        )}

        {/* A view-only visitor can read the conversation but not write into it,
            so say why the box is dead rather than leaving it mysteriously inert. */}
        {selectedChannel?.accessLevel === 'view' && !dmSharedOpen && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>{t('share.viewOnlyChannel')}</span>
          </div>
        )}

        {mentionedNonMembers.length > 0 && selectedChannel && !dmSharedOpen && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              {t('chat.mentionNoAccess', { names: mentionedNonMembers.map((m) => m.name).join(', ') })}
            </span>
            <button
              type="button"
              className="shrink-0 font-medium hover:underline"
              disabled={addChannelMembersMutation.isPending}
              onClick={() =>
                addChannelMembersMutation.mutate({
                  channelId: selectedChannel.id,
                  userIds: mentionedNonMembers.map((m) => m.userId),
                })
              }
            >
              {t('chat.addToChannel')}
            </button>
          </div>
        )}

        {actionItem && !dmSharedOpen && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-[12px] text-violet-700 dark:text-violet-300">
            <ListTodo className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              {t('chat.actionItemArmed', {
                name: actionItem.assigneeId ? namesById[actionItem.assigneeId] ?? t('chat.unknownUser') : t('chat.unassigned'),
              })}
              {actionItem.dueAt ? ` · ${t('chat.taskDue', { date: new Date(actionItem.dueAt).toLocaleDateString() })}` : ''}
            </span>
            <button type="button" className="shrink-0 hover:underline" onClick={() => setActionItem(null)}>
              {t('common.cancel')}
            </button>
          </div>
        )}

        <div className={cn(dmSharedOpen && 'hidden')}>
        <ChatComposer
            workspaceId={workspaceId}
          skillCommands={skillCommands}
          channelLabel={channelLabel}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={!selectedId || selectedChannel?.accessLevel === 'view'}
          sending={sendMutation.isPending}
          replyTo={replyTo}
          replyNamesById={namesById}
          onCancelReply={() => setReplyTo(null)}
          attachments={pendingAttachments}
          onFilesSelected={(files) => void uploadFiles(files)}
          onRemoveAttachment={(id) => setPendingAttachments((prev) => prev.filter((a) => a.id !== id))}
          uploading={uploadingFiles}
          customEmoji={customEmoji}
          onManageEmoji={() => setEmojiManagerOpen(true)}
          leadingTools={
            <>
              {/* Insert row (§A3.5): drop a task or doc reference into the draft.
                  A task URL is unfurled into a card by the message renderer. */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t('chat.insertReference')}
                    disabled={!selectedId}
                    className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0">
                  <InsertReferencePicker
                    workspaceId={workspaceId}
                    onInsertTask={(task) =>
                      setInput((prev) =>
                        `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}/app/${workspaceId}/${task.spaceId}/${task.projectId}/${task.listId}?task=${task.id} `,
                      )
                    }
                    onInsertDoc={(doc) =>
                      setInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${t('chat.docPrefix')}${doc.title} `)
                    }
                  />
                </PopoverContent>
              </Popover>
              {/* Assign-as-action-item (§A3.5): the next message also becomes a
                  task with this owner and date. */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t('chat.assignActionItem')}
                    disabled={!selectedId}
                    className={cn(
                      'h-8 w-8 rounded-md flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-50',
                      actionItem ? 'text-violet-600 dark:text-violet-300' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ListTodo className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3 space-y-2">
                  <div className="text-[12px] font-semibold text-foreground">{t('chat.assignActionItem')}</div>
                  <select
                    value={actionItem?.assigneeId ?? ''}
                    onChange={(e) =>
                      setActionItem((prev) => ({ assigneeId: e.target.value, dueAt: prev?.dueAt ?? '' }))
                    }
                    className="h-8 w-full rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
                  >
                    <option value="">{t('chat.unassigned')}</option>
                    {(membersQuery.data ?? []).map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName || m.email}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={actionItem?.dueAt ?? ''}
                    onChange={(e) => setActionItem((prev) => ({ assigneeId: prev?.assigneeId ?? '', dueAt: e.target.value }))}
                    className="h-8 w-full rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('chat.actionItemHint')}</p>
                  {actionItem && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setActionItem(null)}
                    >
                      {t('chat.clearActionItem')}
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </>
          }
          mentionMenu={(() => {
            if (!mentionTrigger) return undefined
            // @here / @channel broadcast mentions (§6.9) — offered in real
            // (non-DM) channels; insert the literal token the server parses.
            const specials =
              mentionTrigger.symbol === '@' && selectedChannel && !selectedChannel.isDm
                ? (['here', 'channel'] as const).filter((s) => s.startsWith(mentionQuery))
                : []
            const channelMatches = publicChannels.filter((c) => c.name.toLowerCase().includes(mentionQuery))
            const rowClass = 'w-full px-3 py-2 text-left text-[13px] hover:bg-violet-500/8'
            return (
              <div className="mb-2 rounded-lg border border-border/80 bg-background shadow-sm">
                <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1">
                  {([
                    ['people', t('chat.mentionPeople')],
                    ['tasks', t('chat.mentionTasks')],
                    ['docs', t('chat.mentionDocs')],
                    ['channels', t('chat.mentionChannels')],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMentionTab(id)}
                      className={cn(
                        'rounded px-2 py-1 text-[11px]',
                        mentionTab === id ? 'bg-accent/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="max-h-44 overflow-auto">
                  {mentionTab === 'people' && (
                    <>
                      {specials.map((s) => (
                        <button
                          key={`special-${s}`}
                          type="button"
                          className={rowClass}
                          onClick={() => insertMentionToken(`@${s}`)}
                        >
                          <span className="font-medium text-accent">@{s}</span>
                          <span className="ml-2 text-muted-foreground">
                            {s === 'here' ? t('chat.mentionHereDesc') : t('chat.mentionChannelDesc')}
                          </span>
                        </button>
                      ))}
                      {teamMentionCandidates.slice(0, 4).map((team) => (
                        <button
                          key={`team-${team.id}`}
                          type="button"
                          className={rowClass}
                          onClick={() => insertMentionToken(`@${team.alias}`)}
                        >
                          <span className="font-medium text-accent">@{team.alias}</span>
                          <span className="ml-2 text-muted-foreground">
                            {t('chat.mentionTeamDesc', { name: team.name, count: team.memberCount })}
                          </span>
                        </button>
                      ))}
                      {mentionCandidates.length === 0 &&
                      specials.length === 0 &&
                      teamMentionCandidates.length === 0 ? (
                        <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingPeople')}</div>
                      ) : (
                        mentionCandidates.slice(0, 6).map((member) => (
                          <button
                            key={member.userId}
                            type="button"
                            className={rowClass}
                            onClick={() => insertMentionToken(`<@${member.userId}>`)}
                          >
                            <span className="font-medium text-foreground">{member.displayName || member.email}</span>
                            <span className="ml-2 text-muted-foreground">{member.email}</span>
                          </button>
                        ))
                      )}
                    </>
                  )}
                  {mentionTab === 'tasks' &&
                    (taskMentionCandidates.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingTasks')}</div>
                    ) : (
                      taskMentionCandidates.slice(0, 6).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={rowClass}
                          onClick={() =>
                            insertMentionToken(
                              `/app/${workspaceId}/${task.spaceId}/${task.projectId}/${task.listId}?task=${task.id}`,
                            )
                          }
                        >
                          <div className="truncate font-medium text-foreground">{task.title}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {task.projectName ?? task.listName ?? ''}
                          </div>
                        </button>
                      ))
                    ))}
                  {mentionTab === 'docs' &&
                    (docMentionCandidates.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingDocs')}</div>
                    ) : (
                      docMentionCandidates.slice(0, 6).map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          className={rowClass}
                          onClick={() => insertMentionToken(`${t('chat.docPrefix')}${doc.title}`)}
                        >
                          <div className="truncate font-medium text-foreground">{doc.title}</div>
                        </button>
                      ))
                    ))}
                  {mentionTab === 'channels' &&
                    (channelMatches.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingChannels')}</div>
                    ) : (
                      channelMatches.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={rowClass}
                          onClick={() => insertMentionToken(`[#${c.name}](/app/${workspaceId}/chat?channel=${c.id})`)}
                        >
                          <span className="font-medium text-foreground">#{c.name}</span>
                          {c.isPrivate && <Lock className="ml-2 inline h-3 w-3 text-muted-foreground" />}
                        </button>
                      ))
                    ))}
                </div>
              </div>
            )
          })()}
        />
        </div>
        </div>
        {threadParent && (
          <>
            {/*
              The scrim belongs to the drawer layout only. At xl the panel is a
              column in the flow and dimming the conversation beside it would be
              wrong; below xl it covers the conversation, so there has to be
              somewhere to click that means "put this away".
            */}
            <div
              data-testid="thread-scrim"
              className="fixed inset-0 z-40 bg-black/50 xl:hidden"
              onClick={() => setThreadParentId(null)}
            />
          </>
        )}
        {threadParent && (
          <ThreadPanel
            workspaceId={workspaceId}
            parent={threadParent}
            replies={threadReplies}
            loading={threadQuery.isLoading}
            olderReplies={threadQuery.hasNextPage ? threadQuery : null}
            channelLabel={channelLabel}
            currentUserId={me?.id}
            onClose={() => setThreadParentId(null)}
            onReply={handleThreadReply}
            onToggleReaction={(messageId, emoji) => toggleReactionMutation.mutate({ messageId, emoji })}
            onMarkUnread={(messageId) =>
              markUnreadMutation.mutate({ channelId: threadParent.channelId, messageId })
            }
            onSetFollowState={(state) =>
              threadFollowMutation.mutate({ messageId: threadParent.id, state })
            }
            onCreateTask={(message, assigneeId) => setTaskDraft({ message, assigneeId, dueAt: '' })}
            members={membersQuery.data ?? []}
            pending={sendMutation.isPending}
            namesById={namesById}
            customEmoji={customEmoji}
            onManageEmoji={() => setEmojiManagerOpen(true)}
            emojiByCode={emojiByCode}
          />
        )}
        {/* §G06 [05:43] — the member card that used to live here is gone.
            It was `hidden xl:flex`, so below 1280px clicking a name did
            nothing at all, and it was reachable from exactly one place.
            <PersonPanel> in the app shell replaced it: same information,
            more of it, at every width, from everywhere a name appears. */}
        {showPinnedPanel && (
          <PinnedPanel
            messages={pinnedMessages}
            loading={pinnedQuery.isLoading}
            namesById={namesById}
            emojiByCode={emojiByCode}
            onClose={() => setShowPinnedPanel(false)}
            onOpenThread={(id) => setThreadParentId(id)}
          />
        )}
        {showSavedPanel && (
          <SavedPanel
            messages={savedMessages}
            loading={savedQuery.isLoading}
            namesById={namesById}
            emojiByCode={emojiByCode}
            onClose={() => setShowSavedPanel(false)}
            onOpenThread={(id, channelId) => {
              // A saved message may live in another channel — switch to it first.
              if (channelId && channelId !== selectedId) setSelectedId(channelId)
              setThreadParentId(id)
              setShowSavedPanel(false)
            }}
            onUnsave={(id) => setSavedMutation.mutate({ messageId: id, saved: false })}
            onUpdateTags={(messageId, tags) => updateSavedTagsMutation.mutate({ messageId, tags })}
          />
        )}
        {showInfoPanel && selectedChannel && !selectedChannel.isDm && (
          <ChannelInfoPanel
            channel={selectedChannel}
            members={channelMembersQuery.data ?? []}
            spaceName={spaceOptions.find((sp) => sp.id === selectedChannel.spaceId)?.name ?? null}
            canEdit={selectedChannel.createdById === me?.id}
            onEdit={() => {
              setEditName(selectedChannel.name)
              setEditTopic(selectedChannel.topic ?? '')
              setEditDescription(selectedChannel.description ?? '')
              setEditIcon(selectedChannel.icon ?? '')
              setEditChannelOpen(true)
            }}
            onAddPeople={() => setAddPeopleOpen(true)}
            onOpenFiles={() => {
              setShowInfoPanel(false)
              setShowFilesPanel(true)
            }}
            onClose={() => setShowInfoPanel(false)}
          />
        )}
        {showFilesPanel && (
          <FilesPanel
            workspaceId={workspaceId}
            channelId={selectedChannel?.id}
            channelLabel={channelLabel}
            onClose={() => setShowFilesPanel(false)}
          />
        )}
        {showSearchPanel && (
          <SearchPanel
            workspaceId={workspaceId}
            channels={channels}
            members={membersQuery.data ?? []}
            defaultChannelId={selectedChannel && !selectedChannel.isDm ? selectedChannel.id : undefined}
            onClose={() => setShowSearchPanel(false)}
            onSelectResult={(r) => {
              // Reuse the app's existing ?channel=&message= deep-link so the
              // linked channel opens and the message scrolls + highlights (§6.11).
              navigate({
                to: '/app/$workspaceId/chat',
                params: { workspaceId },
                search: { channel: r.channelId, message: r.id } as any,
              })
              if (r.channelId !== selectedId) setSelectedId(r.channelId)
              setHighlightedMessageId(r.id)
            }}
          />
        )}
      </div>
    </div>
  )
}

function PinnedPanel({
  messages,
  loading,
  namesById,
  emojiByCode,
  onClose,
  onOpenThread,
}: {
  messages: Message[]
  loading?: boolean
  namesById: Record<string, string>
  emojiByCode: Map<string, string>
  onClose: () => void
  onOpenThread: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{t('chat.pinned')}</div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('chat.noPinnedMessages')}</div>
        ) : (
          messages.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="text-xs text-muted-foreground">{m.authorName ?? t('chat.unknownUser')}</div>
              <ChatMessageBody text={m.body} namesById={namesById} customEmoji={emojiByCode} className="text-sm mt-1" />
              {(m.pinnedByName || m.pinnedAt) && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Pin className="h-2.5 w-2.5" />
                  {t('chat.pinned')}{m.pinnedByName ? ` ${t('chat.pinnedBy', { name: m.pinnedByName })}` : ''}
                  {m.pinnedAt ? ` · ${formatMessageTime(m.pinnedAt)}` : ''}
                </div>
              )}
              <button className="mt-2 text-[11px] text-accent hover:underline" onClick={() => onOpenThread(m.id)}>
                {t('chat.openThread')}
              </button>
            </Card>
          ))
        )}
      </div>
    </aside>
  )
}

type SavedMessage = Message & { channelName?: string; savedAt?: string }

function SavedPanel({
  messages,
  loading,
  namesById,
  emojiByCode,
  onClose,
  onOpenThread,
  onUnsave,
  onUpdateTags,
}: {
  messages: SavedMessage[]
  loading?: boolean
  namesById: Record<string, string>
  emojiByCode: Map<string, string>
  onClose: () => void
  onOpenThread: (id: string, channelId: string) => void
  onUnsave: (id: string) => void
  onUpdateTags: (messageId: string, tags: string[]) => void
}) {
  const { t } = useTranslation()
  // Search + tag filter (Plan §6.7) — applied client-side over the loaded saves.
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const m of messages) for (const tag of m.tags ?? []) set.add(tag)
    return [...set].sort()
  }, [messages])
  const q = search.trim().toLowerCase()
  const filtered = messages.filter((m) => {
    if (activeTag && !(m.tags ?? []).includes(activeTag)) return false
    if (q && !m.body.toLowerCase().includes(q)) return false
    return true
  })
  const chip = (active: boolean) =>
    cn(
      'text-[10px] rounded-full px-2 py-0.5 border transition-colors',
      active
        ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300'
        : 'border-border text-muted-foreground hover:text-foreground',
    )
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" /> {t('chat.saved')}
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="border-b border-border px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('chat.searchSaved')}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button type="button" className={chip(!activeTag)} onClick={() => setActiveTag(null)}>
              {t('chat.allTags')}
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={chip(activeTag === tag)}
                onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('chat.noSavedMessages')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('chat.noSavedMatch')}</div>
        ) : (
          filtered.map((m) => (
            <SavedMessageCard
              key={m.id}
              m={m}
              namesById={namesById}
              emojiByCode={emojiByCode}
              onOpenThread={onOpenThread}
              onUnsave={onUnsave}
              onUpdateTags={onUpdateTags}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function SavedMessageCard({
  m,
  namesById,
  emojiByCode,
  onOpenThread,
  onUnsave,
  onUpdateTags,
}: {
  m: SavedMessage
  namesById: Record<string, string>
  emojiByCode: Map<string, string>
  onOpenThread: (id: string, channelId: string) => void
  onUnsave: (id: string) => void
  onUpdateTags: (messageId: string, tags: string[]) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const tags = m.tags ?? []
  const commitTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) onUpdateTags(m.id, [...tags, tag])
    setTagInput('')
    setAdding(false)
  }
  const removeTag = (tag: string) => onUpdateTags(m.id, tags.filter((x) => x !== tag))
  return (
    <Card className="p-3 group">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground truncate">
          {m.authorName ?? t('chat.unknownUser')}
          {m.channelName ? <span className="opacity-70"> · #{m.channelName}</span> : null}
        </div>
        <button
          className="text-[11px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onUnsave(m.id)}
          title={t('chat.removeFromSaved')}
        >
          {t('chat.remove')}
        </button>
      </div>
      <ChatMessageBody text={m.body} namesById={namesById} customEmoji={emojiByCode} className="text-sm mt-1" />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-300"
          >
            {tag}
            <button type="button" className="hover:text-destructive" onClick={() => removeTag(tag)} title={t('chat.removeTag')}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTag()
              }
              if (e.key === 'Escape') {
                setTagInput('')
                setAdding(false)
              }
            }}
            onBlur={commitTag}
            placeholder={t('chat.addTagPlaceholder')}
            className="h-5 w-24 rounded border border-border bg-background px-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setAdding(true)}
          >
            <Tag className="h-2.5 w-2.5" /> {t('chat.addTag')}
          </button>
        )}
      </div>
      <button className="mt-2 text-[11px] text-accent hover:underline" onClick={() => onOpenThread(m.id, m.channelId)}>
        {t('chat.openThread')}
      </button>
    </Card>
  )
}

type ChatFile = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  channelId: string
  channelName: string
  messageId: string
  uploadedById: string | null
  uploaderName: string | null
  createdAt: string
  url: string
}

type ChatSearchResult = {
  id: string
  channelId: string
  channelName: string
  parentMessageId: string | null
  authorId: string
  authorName: string | null
  body: string
  createdAt: string
}

/**
 * Workspace file library (Plan §6.8): every file shared in a channel the user
 * can read, with filename search + a coarse content-type filter. Mirrors the
 * Pinned / Saved side panels. Files carry fresh signed download URLs.
 */
function FilesPanel({
  workspaceId,
  channelId,
  channelLabel,
  onClose,
}: {
  workspaceId: string
  channelId?: string
  channelLabel: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  // Opens on the channel you're reading (§A3.7); the whole workspace library is
  // one click away.
  const [thisChannelOnly, setThisChannelOnly] = useState(true)
  const scopedChannelId = thisChannelOnly ? channelId : undefined
  const filesQuery = useQuery({
    queryKey: ['chat-files', workspaceId, q, type, scopedChannelId ?? ''],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (type) params.set('type', type)
      if (scopedChannelId) params.set('channelId', scopedChannelId)
      return api<ChatFile[]>(`/workspaces/${workspaceId}/chat/files?${params.toString()}`)
    },
    enabled: !!workspaceId,
  })
  const files = filesQuery.data ?? []
  const selectClass = 'h-8 w-full rounded border border-border bg-background px-2 text-[13px] text-foreground'
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> {t('chat.files')}
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="border-b border-border p-2.5 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chat.searchFiles')}
            className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-[13px] text-foreground"
          />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
          <option value="">{t('chat.allFileTypes')}</option>
          <option value="image">{t('chat.fileTypeImages')}</option>
          <option value="pdf">{t('chat.fileTypePdfs')}</option>
          <option value="video">{t('chat.fileTypeVideos')}</option>
          <option value="audio">{t('chat.fileTypeAudio')}</option>
        </select>
        {channelId && (
          <div className="flex items-center gap-1">
            {([
              [true, channelLabel || t('chat.thisChannel')],
              [false, t('chat.allChannels')],
            ] as const).map(([scoped, label]) => (
              <button
                key={String(scoped)}
                type="button"
                onClick={() => setThisChannelOnly(scoped)}
                className={cn(
                  'truncate rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  thisChannelOnly === scoped
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-300'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filesQuery.isLoading ? (
          <div className="p-1 text-xs text-muted-foreground"><InlineSkeleton /></div>
        ) : files.length === 0 ? (
          <div className="p-1 text-xs text-muted-foreground">{t('chat.noFilesShared')}</div>
        ) : (
          files.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              download={f.fileName}
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 hover:bg-muted/40"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground/90">{f.fileName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.uploaderName ? t('chat.uploadedBy', { name: f.uploaderName }) : ''}
                  {f.channelName ? ` · #${f.channelName}` : ''}
                  {` · ${formatRelativeTime(f.createdAt)}`}
                </div>
              </div>
              <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          ))
        )}
      </div>
    </aside>
  )
}

/**
 * Full message search with filters (Plan §6.11): query + channel / sender /
 * date-range / has-file(type). Hits the server search endpoint (scoped to
 * accessible channels) and deep-links each hit back into the conversation.
 */
function SearchPanel({
  workspaceId,
  channels,
  members,
  defaultChannelId,
  onClose,
  onSelectResult,
}: {
  workspaceId: string
  channels: Channel[]
  members: WorkspaceMember[]
  /** Search opens scoped to the channel being read (§A3.7). */
  defaultChannelId?: string
  onClose: () => void
  onSelectResult: (r: ChatSearchResult) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [channelId, setChannelId] = useState(defaultChannelId ?? '')
  const [senderId, setSenderId] = useState('')
  const [after, setAfter] = useState('')
  const [before, setBefore] = useState('')
  const [fileType, setFileType] = useState('')
  const hasCriteria = !!(q.trim() || channelId || senderId || after || before || fileType)
  const searchQuery = useQuery({
    queryKey: ['chat-search', workspaceId, q, channelId, senderId, after, before, fileType],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (channelId) params.set('channelId', channelId)
      if (senderId) params.set('senderId', senderId)
      if (after) params.set('after', after)
      if (before) params.set('before', before)
      if (fileType) params.set('fileType', fileType)
      return api<ChatSearchResult[]>(`/workspaces/${workspaceId}/chat/search?${params.toString()}`)
    },
    enabled: !!workspaceId && hasCriteria,
  })
  const results = hasCriteria ? searchQuery.data ?? [] : []
  const clear = () => {
    setQ('')
    setChannelId('')
    setSenderId('')
    setAfter('')
    setBefore('')
    setFileType('')
  }
  const selectClass = 'h-8 w-full rounded border border-border bg-background px-1.5 text-[12px] text-foreground'
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" /> {t('chat.searchAndFilter')}
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="border-b border-border p-2.5 space-y-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder={t('chat.searchMessages')}
          className="h-8 w-full rounded border border-border bg-background px-2 text-[13px] text-foreground"
        />
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={selectClass}>
          <option value="">{t('chat.allChannels')}</option>
          {channels
            .filter((c) => !c.isDm)
            .map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
        </select>
        <select value={senderId} onChange={(e) => setSenderId(e.target.value)} className={selectClass}>
          <option value="">{t('chat.anyone')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <label className="flex-1 text-[10px] text-muted-foreground">
            {t('chat.after')}
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="mt-0.5 h-8 w-full rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
            />
          </label>
          <label className="flex-1 text-[10px] text-muted-foreground">
            {t('chat.before')}
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="mt-0.5 h-8 w-full rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
            />
          </label>
        </div>
        <select value={fileType} onChange={(e) => setFileType(e.target.value)} className={selectClass}>
          <option value="">{t('chat.allFileTypes')}</option>
          <option value="any">{t('chat.anyFile')}</option>
          <option value="image">{t('chat.fileTypeImages')}</option>
          <option value="pdf">{t('chat.fileTypePdfs')}</option>
          <option value="video">{t('chat.fileTypeVideos')}</option>
          <option value="audio">{t('chat.fileTypeAudio')}</option>
        </select>
        {hasCriteria && (
          <button type="button" onClick={clear} className="text-[11px] text-muted-foreground hover:text-foreground">
            {t('chat.clearFilters')}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!hasCriteria ? (
          <div className="p-1 text-xs text-muted-foreground">{t('chat.searchPrompt')}</div>
        ) : searchQuery.isLoading ? (
          <div className="p-1 text-xs text-muted-foreground"><InlineSkeleton /></div>
        ) : results.length === 0 ? (
          <div className="p-1 text-xs text-muted-foreground">{t('chat.noSearchResults')}</div>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectResult(r)}
              className="block w-full rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left hover:bg-muted/40"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{r.authorName ?? t('chat.unknownUser')}</span>
                <span>· #{r.channelName}</span>
                {r.parentMessageId && (
                  <span className="rounded bg-muted px-1 py-0.5 text-[9px]">{t('chat.threadReply')}</span>
                )}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[13px] text-foreground/90">{r.body}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{formatRelativeTime(r.createdAt)}</div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}

const DM_TAB_KEY: Record<'chat' | 'calendar' | 'tasks', TranslationKey> = {
  chat: 'chat.dmTabChat',
  calendar: 'chat.dmTabCalendar',
  tasks: 'chat.dmTabTasks',
}

/**
 * The Calendar and Tasks faces of a DM: what these two people share.
 *
 * Both come from one endpoint because they answer the same question from one
 * pair of joins — meetings they both attended, and open tasks either is
 * assigned to. Splitting them into two requests would double the round trips
 * to render two halves of a single answer.
 */
function DmSharedPanel({
  workspaceId,
  peerId,
  peerName,
  mode,
}: {
  workspaceId: string
  peerId: string
  peerName: string
  mode: 'calendar' | 'tasks'
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['dm-shared', workspaceId, peerId],
    queryFn: () =>
      api<{
        meetings: Array<{ id: string; title: string; startsAt: string | null; provider: string }>
        tasks: Array<{ id: string; title: string; status: string; dueDate: string | null; priority: string }>
      }>(`/workspaces/${workspaceId}/people/${peerId}/shared`),
    enabled: Boolean(workspaceId && peerId),
  })

  const rows = mode === 'calendar' ? data?.meetings ?? [] : data?.tasks ?? []

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t(mode === 'calendar' ? 'chat.dmSharedMeetings' : 'chat.dmSharedTasks', { name: peerName })}
      </p>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground"><InlineSkeleton /></p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {t(mode === 'calendar' ? 'chat.dmNoMeetings' : 'chat.dmNoTasks', { name: peerName })}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 truncate text-[13px]">{row.title}</span>
              {mode === 'calendar' ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {'startsAt' in row && row.startsAt
                    ? new Date(row.startsAt).toLocaleDateString()
                    : t('chat.dmNoDate')}
                </span>
              ) : (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {'status' in row ? row.status : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThreadPanel({
  workspaceId,
  parent,
  replies,
  loading,
  olderReplies,
  channelLabel,
  currentUserId,
  onClose,
  onReply,
  onToggleReaction,
  onMarkUnread,
  onSetFollowState,
  onCreateTask,
  members,
  pending,
  namesById,
  customEmoji,
  onManageEmoji,
  emojiByCode,
}: {
  workspaceId: string
  parent: Message
  replies: Message[]
  loading: boolean
  /** The thread's pages when there are earlier replies to load. */
  olderReplies: {
    fetchNextPage: () => Promise<unknown>
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
  } | null
  channelLabel: string
  currentUserId?: string
  onClose: () => void
  onReply: (body: string, alsoSendToChannel: boolean) => void
  onToggleReaction: (messageId: string, emoji: string) => void
  onMarkUnread: (messageId: string) => void
  /** §G12 [17:13] — mute or follow this thread, or clear back to the default. */
  onSetFollowState: (state: 'following' | 'muted' | null) => void
  /**
   * G11-9 / G12-10 [14:37–14:48], [16:50] — turn the conversation into work
   * without leaving the panel. Opens the same draft the per-message menu does;
   * an assignee, when one is picked, is pre-filled rather than a second step.
   */
  onCreateTask: (message: Message, assigneeId: string) => void
  members: WorkspaceMember[]
  pending: boolean
  namesById: Record<string, string>
  customEmoji?: CustomEmoji[]
  onManageEmoji?: () => void
  emojiByCode: Map<string, string>
}) {
  const [draft, setDraft] = useState('')
  // "Also send to #channel" resets after each reply so a one-off broadcast
  // doesn't quietly repeat on the next one.
  const [alsoSend, setAlsoSend] = useState(false)
  const { t, tCount } = useTranslation()

  // Followers are the people already in the conversation — the author and
  // everyone who replied (§A3.2).
  const followers = useMemo(() => {
    const byId = new Map<string, string>()
    for (const message of [parent, ...replies]) {
      byId.set(message.authorId, message.authorName ?? namesById[message.authorId] ?? t('chat.unknownUser'))
    }
    return [...byId.entries()].map(([userId, name]) => ({ userId, name }))
  }, [parent, replies, namesById, t])

  const reactionRow = (message: Message) =>
    !!message.reactions?.length && (
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {message.reactions.map((r) => {
          const code = /^:([a-z0-9_]+):$/.exec(r.emoji)?.[1]
          const customUrl = code ? emojiByCode.get(code) : undefined
          return (
            <button
              key={`${message.id}-${r.emoji}`}
              type="button"
              onClick={() => onToggleReaction(message.id, r.emoji)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
                r.reacted ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border/70',
              )}
            >
              {customUrl ? <img src={customUrl} alt={code} className="h-3.5 w-3.5 object-contain" /> : <span>{r.emoji}</span>}
              {r.count}
            </button>
          )
        })}
      </div>
    )

  const quickReact = (message: Message) => (
    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
      {/* The three she names at [20:24] — "👍 ✅ 🔥" — as the emoji themselves,
          not icons standing in for them. The picker beside them is the rest. */}
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={`${message.id}-quick-${emoji}`}
          type="button"
          title={t('chat.react')}
          className="h-5 w-5 rounded text-[11px] hover:bg-muted"
          onClick={() => onToggleReaction(message.id, emoji)}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        title={t('chat.markUnreadFromHere')}
        className="h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center"
        onClick={() => onMarkUnread(message.id)}
      >
        <MailOpen className="h-3 w-3" />
      </button>
    </div>
  )

  return (
    <aside
      data-testid="chat-thread-panel"
      /*
       * Two layouts, one component.
       *
       * This used to be `hidden xl:flex`, and it is rendered exactly once — so
       * below 1280px all six controls that set threadParentId did nothing at
       * all, while the "N replies" link went on advertising a thread. Measured
       * at 1680/1279/1200 before the change: the link was visible at every
       * width and the panel opened only at 1680.
       *
       * At xl and above it stays the inline column it was. Below that it is a
       * right-hand drawer over the conversation, which is the same shape the
       * shell already uses for nav below lg — rather than a second thread
       * surface, which is how two implementations of one thing start drifting.
       */
      className={cn(
        /*
         * The drawer sits BELOW this page's dialog layer, not above it.
         *
         * It first shipped at z-[65] over a z-[60] scrim, which put it above
         * every `fixed inset-0 z-50` modal on this page — so "Create task" from
         * the thread header opened a modal underneath the scrim and could not
         * be clicked. Measured at 1200px: `COVERED by thread-scrim`.
         *
         * Raising those seven modals instead would have fixed today and left
         * the next one to rediscover it. The drawer is chrome; a dialog is the
         * top layer by definition, so the chrome goes under it. Nothing else on
         * this page uses 30–49, so the scrim/panel pair has that range to
         * itself and still covers the conversation.
         */
        'fixed inset-y-0 right-0 z-[45] flex w-full max-w-[420px] flex-col border-l border-border/80 bg-[#fbfbfc] dark:bg-[#16181d]',
        'xl:relative xl:inset-auto xl:z-50 xl:w-[360px] xl:max-w-none xl:shrink-0',
      )}
    >
      <div className="shrink-0 border-b border-border/80 px-4 py-2 flex items-start justify-between bg-background">
        <div className="min-w-0">
          {/*
            G12-10 [16:50] — "Hamda's Thread", not "Thread".
            Her frame 274 names the panel after whoever started it. With two
            threads open in a day the generic title tells you nothing about
            which conversation you are looking at, and the parent author is
            already the first thing rendered below.
          */}
          <div className="truncate text-[14px] font-semibold text-foreground" data-testid="thread-panel-title">
            {parent.authorName
              ? t('chat.threadOf', { name: parent.authorName })
              : t('chat.thread')}
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={followers.map((f) => f.name).join(', ')}>
            {tCount('chat.threadFollowers', followers.length)}
          </div>
          {/*
            G11-9 [14:37–14:48] — "Assign to" and "Create Task", directly under
            the title.

            Both actions already existed and were reachable only from a
            per-message hover menu, which is the wrong place for a decision
            about the whole conversation: by the time you have read a thread
            and concluded somebody should do something, you are looking at the
            panel, not hovering a row.
          */}
          <div className="mt-1 flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="thread-assign-to"
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-border/70 px-2 text-[11px] text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                >
                  <UserPlus className="h-3 w-3" />
                  {t('chat.threadAssignTo')}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <div className="max-h-56 overflow-y-auto">
                  {members.length === 0 && (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      {t('chat.threadAssignNobody')}
                    </p>
                  )}
                  {members.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      data-testid={`thread-assign-${m.userId}`}
                      onClick={() => onCreateTask(parent, m.userId)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                    >
                      <PersonAvatar name={m.displayName || m.email} size="xs" />
                      <span className="truncate">{m.displayName || m.email}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              data-testid="thread-create-task"
              onClick={() => onCreateTask(parent, '')}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-border/70 px-2 text-[11px] text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            >
              <ListTodo className="h-3 w-3" />
              {t('chat.createTask')}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/*
            * §G12 [17:13] — the bell and the bookmark she pointed at, here in
            * the thread header (frames 277/282).
            *
            * Channel-wide mute was the only control before this, and it is the
            * wrong size: silencing a channel to escape one noisy thread also
            * silences the messages you are in it for. Pressing the lit one
            * again clears back to the default rather than flipping to the
            * opposite — "not muted" and "followed" are different answers.
            */}
          <button
            type="button"
            data-testid="thread-panel-mute"
            title={parent.threadFollowState === 'muted' ? t('chat.unmuteThread') : t('chat.muteThread')}
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
              parent.threadFollowState === 'muted' ? 'text-violet-600 dark:text-violet-300' : 'text-muted-foreground',
            )}
            onClick={() => onSetFollowState(parent.threadFollowState === 'muted' ? null : 'muted')}
          >
            <BellOff className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="thread-panel-follow"
            title={parent.threadFollowState === 'following' ? t('chat.unfollowThread') : t('chat.followThread')}
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
              parent.threadFollowState === 'following' ? 'text-violet-600 dark:text-violet-300' : 'text-muted-foreground',
            )}
            onClick={() => onSetFollowState(parent.threadFollowState === 'following' ? null : 'following')}
          >
            <Bell className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-[#0f1114]">
        <div className="group/msg rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">{parent.authorName ?? t('chat.unknownUser')}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatMessageTime(parent.createdAt)}</span>
          </div>
          <ChatMessageBody text={parent.body} namesById={namesById} customEmoji={emojiByCode} className="text-[14px] leading-relaxed" />
          {reactionRow(parent)}
          {quickReact(parent)}
        </div>
        {olderReplies && (
          <LoadOlder
            query={olderReplies}
            testId="thread-load-older"
            label={t('chat.loadEarlierReplies')}
            failedLabel={t('chat.loadEarlierRepliesFailed')}
            auto={false}
          />
        )}
        {replies.map((reply) => (
          <div key={reply.id} className="group/msg rounded-lg border border-border/70 bg-background p-3">
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-[12px] font-semibold text-foreground">
                {reply.authorName ?? namesById[reply.authorId] ?? t('chat.unknownUser')}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{formatMessageTime(reply.createdAt)}</span>
              {reply.authorId === currentUserId && <span className="text-[10px] text-muted-foreground">· {t('chat.you')}</span>}
            </div>
            <ChatMessageBody text={reply.body} namesById={namesById} customEmoji={emojiByCode} className="text-[14px] leading-relaxed" />
            {reactionRow(reply)}
            {quickReact(reply)}
          </div>
        ))}
        {loading && replies.length === 0 && (
          <p className="py-6 text-center text-[12px] text-muted-foreground"><InlineSkeleton /></p>
        )}
        {!loading && replies.length === 0 && (
          <p className="py-6 text-center text-[12px] text-muted-foreground">{t('chat.noRepliesYet')}</p>
        )}
      </div>
      <div className="shrink-0 border-t border-border/80 p-3 bg-[#fbfbfc] dark:bg-[#16181d] space-y-2">
        <ThreadReplyComposer
          workspaceId={workspaceId}
          value={draft}
          onChange={setDraft}
          onSend={() => {
            const body = draft.trim()
            if (!body) return
            onReply(body, alsoSend)
            setDraft('')
            setAlsoSend(false)
          }}
          disabled={false}
          sending={pending}
          customEmoji={customEmoji}
          onManageEmoji={onManageEmoji}
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoSend}
            onChange={(e) => setAlsoSend(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          {t('chat.alsoSendToChannel', { channel: channelLabel })}
        </label>
      </div>
    </aside>
  )
}

function InsertReferencePicker({
  workspaceId,
  onInsertTask,
  onInsertDoc,
}: {
  workspaceId: string
  onInsertTask: (task: MentionTask) => void
  onInsertDoc: (doc: MentionDoc) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'tasks' | 'docs'>('tasks')
  const [q, setQ] = useState('')
  const tasksQuery = useTaskSearch<MentionTask>(workspaceId, q, { key: 'chat-insert-tasks', enabled: tab === 'tasks' })
  const docsQuery = useQuery({
    queryKey: ['chat-insert-docs', workspaceId],
    queryFn: () => api<MentionDoc[]>(`/workspaces/${workspaceId}/docs`),
    enabled: !!workspaceId && tab === 'docs',
  })
  const needle = q.trim().toLowerCase()
  const tasks = (tasksQuery.data ?? []).filter((task) =>
    `${task.title} ${task.projectName ?? ''} ${task.listName ?? ''}`.toLowerCase().includes(needle),
  )
  const docs = (docsQuery.data ?? []).filter((doc) => doc.title.toLowerCase().includes(needle))
  const rowClass = 'w-full px-3 py-2 text-left text-[13px] hover:bg-violet-500/8'
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        {([
          ['tasks', t('chat.insertTask')],
          ['docs', t('chat.insertDoc')],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'rounded px-2 py-1 text-[11px]',
              tab === id ? 'bg-accent/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('chat.insertSearchPlaceholder')}
          className="h-8 w-full rounded border border-border bg-background px-2 text-[13px] text-foreground"
        />
      </div>
      <div className="max-h-56 overflow-y-auto pb-1">
        {tab === 'tasks' &&
          (tasksQuery.isLoading ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground"><InlineSkeleton /></div>
          ) : tasks.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingTasks')}</div>
          ) : (
            tasks.slice(0, 20).map((task) => (
              <button key={task.id} type="button" className={rowClass} onClick={() => onInsertTask(task)}>
                <div className="truncate font-medium text-foreground">{task.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {task.projectName ?? task.listName ?? ''}
                </div>
              </button>
            ))
          ))}
        {tab === 'docs' &&
          (docsQuery.isLoading ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground"><InlineSkeleton /></div>
          ) : docs.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('chat.noMatchingDocs')}</div>
          ) : (
            docs.slice(0, 20).map((doc) => (
              <button key={doc.id} type="button" className={rowClass} onClick={() => onInsertDoc(doc)}>
                <div className="truncate font-medium text-foreground">{doc.title}</div>
              </button>
            ))
          ))}
      </div>
    </div>
  )
}

/**
 * Channel info panel (§A3.7): topic, description, access and the people in the
 * channel, in one place. The edit modal used to be the only home for any of
 * this, which meant you had to open a form to read a description.
 */
function ChannelInfoPanel({
  channel,
  members,
  spaceName,
  canEdit,
  onEdit,
  onAddPeople,
  onOpenFiles,
  onClose,
}: {
  channel: Channel
  members: WorkspaceMember[]
  spaceName?: string | null
  canEdit: boolean
  onEdit?: () => void
  onAddPeople?: () => void
  onOpenFiles: () => void
  onClose: () => void
}) {
  const { t, tCount } = useTranslation()
  return (
    <aside className="hidden xl:flex w-80 border-l border-border flex-col">
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" /> {t('chat.channelInfo')}
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
            {channel.icon ? <span className="text-[17px] leading-none">{channel.icon}</span> : <Hash className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">#{channel.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {channel.isPrivate ? t('chat.privateChannel') : t('chat.publicChannel')}
              {spaceName ? ` · ${spaceName}` : ''}
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-border/70 bg-background p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('chat.channelTopic')}</div>
          <p className="mt-1 text-[13px] text-foreground/90">{channel.topic || t('chat.noTopicYet')}</p>
        </section>

        <section className="rounded-lg border border-border/70 bg-background p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('chat.channelDescription')}</div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground/90">
            {channel.description || t('chat.noDescriptionYet')}
          </p>
        </section>

        <section className="rounded-lg border border-border/70 bg-background p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('chat.members')}</div>
            <span className="text-[11px] text-muted-foreground">{tCount('chat.memberCount', members.length)}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {members.slice(0, 8).map((member) => (
              <div key={member.userId} className="truncate text-[12px] text-foreground/90">
                {member.displayName || member.email}
              </div>
            ))}
            {members.length > 8 && (
              <div className="text-[11px] text-muted-foreground">
                {t('chat.andMore', { count: members.length - 8 })}
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {canEdit && onEdit && (
            <Button size="sm" variant="secondary" onClick={onEdit}>
              {t('chat.editChannel')}
            </Button>
          )}
          {onAddPeople && (
            <Button size="sm" variant="secondary" onClick={onAddPeople}>
              {t('chat.addPeople')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onOpenFiles}>
            {t('chat.files')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
