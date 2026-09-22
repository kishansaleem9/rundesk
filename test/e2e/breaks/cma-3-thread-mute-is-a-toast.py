# Muting a thread shows the toast and stores nothing.
#
# A TOAST IS NOT STATE, which is the suite's own phrasing one line above the
# check. The menu item is there, the bell icon is there, the click closes the
# overflow, and "Thread muted" appears in the corner — every signal a person
# gets from the act is unchanged. The query invalidation is still there too, so
# the list refetches; it just refetches the same unmuted thread.
#
# The plausible route is an optimistic-update rewrite that never finished: the
# local state change is the visible half and the PUT is the half nobody sees, so
# a commit that reorders `onSuccess` around `mutationFn` and drops the request
# reads as noise in a diff full of cache handling.
#
# The failure is only visible LATER, which is what makes muting a bad place for
# it. You mute a noisy thread, you are told it is muted, and you keep being
# notified — and the menu says "Mute this thread" again next time you open it,
# which reads as you having failed to click rather than the app having failed to
# store.
#
# One check: `a thread offers "Mute this thread"` still passes, because the item
# is what it always was. Only the one that reloads first can tell, and the
# suite reloads for exactly that reason.
#
# Reddens: chat-message-actions: "the mute survives a reload"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """  const threadFollowMutation = useMutation({
    mutationFn: ({ messageId, state }: { messageId: string; state: 'following' | 'muted' | null }) =>
      api(`/chat/messages/${messageId}/thread-follow`, { method: 'PUT', body: { state } }),
"""
b = """  const threadFollowMutation = useMutation({
    mutationFn: async ({ state }: { messageId: string; state: 'following' | 'muted' | null }) => state,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: muting a thread toasts and writes nothing.')
