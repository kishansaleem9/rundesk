# Landing on chat picks a channel and does not put it in the address.
#
# `selectChannel` still navigates, so every click in the sidebar still writes
# `channel=` — this only stops the AUTO-SELECT on arrival from doing it, by
# routing that one call through local state. The plausible reasoning is about
# history: the auto-selection is not a navigation the person made, so writing
# it to the URL is noise, and `/chat` should mean "chat" rather than "chat, and
# here is a channel id you did not choose".
#
# What it costs is the screen being sendable at all on arrival. Somebody opens
# chat, reads something, copies the URL — and the recipient gets whatever
# channel THEIR auto-select lands on. The two of them are then talking about
# different rooms with the same link in front of them.
#
# One check: every later part of the chat section clicks a channel explicitly,
# and those still write the address.
#
# Reddens: addressability-live: "landing on chat names the channel it chose"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """  const setSelectedId = selectChannel
"""
b = """  // An auto-selection is not a navigation the person made, so it stays out of
  // the address; an explicit click still goes through `selectChannel`.
  const [autoSelected, setAutoSelected] = useState<string | null>(null)
  const setSelectedId = (id: string | null) => setAutoSelected(id)
  void autoSelected
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: the auto-selected channel is not in the address.')
