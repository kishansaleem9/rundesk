# Answering from the Replies list takes you to the chat page afterwards.
#
# The defect the suite's last check exists for, and the one it says a weaker
# suite would miss: "Checking only the first would pass for a row that
# navigated to the channel and posted there, which is the defect." Here the
# reply really does reach the right thread — the check before it stays green —
# and the page leaves /replies anyway.
#
# It is the plausible half-measure. "Take me to the conversation I just joined"
# is a reasonable-sounding thing to add, and it undoes the item entirely:
# > "ek person 90 chats mein hai, 90 groups mein hai … ab us ko har baar chat
# >  open karne ki zaroorat nahi."
# Ninety threads answered is ninety trips into a channel and back.
#
# `useNavigate` is already imported in this file for the filter chips, so the
# patch adds a hook call inside `InlineThread` and one line to `onSuccess`.
# That is two lines more than the other patches in this set, and it is the
# smallest honest version: the defect IS a navigation, and there is no
# navigation here to corrupt.
#
# Reddens: replies-inline-thread: "and it never had to open the channel to get there"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-replies-page.tsx'
a = """  const { t } = useTranslation()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [alsoToChannel, setAlsoToChannel] = useState(false)
"""
b = """  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [alsoToChannel, setAlsoToChannel] = useState(false)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

a2 = """      void qc.invalidateQueries({ queryKey: ['replies-thread', messageId] })
      onReplied()
"""
b2 = """      void qc.invalidateQueries({ queryKey: ['replies-thread', messageId] })
      onReplied()
      void navigate({ to: '/app/$workspaceId/chat', params: { workspaceId } })
"""
assert s.count(a2) == 1, f'second anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a2, b2))
print('workspace-replies-page.tsx: answering now sends you into the channel afterwards.')
