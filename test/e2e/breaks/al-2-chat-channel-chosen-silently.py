# Landing on chat picks a channel and does not put it in the address.
#
# The fallback effect keeps its own choice in local state instead of navigating.
# `selectChannel` is untouched, so every click in the sidebar and every deep
# link still writes and reads `?channel=` — only the ARRIVAL stops. The
# plausible reasoning is about history and noise: the auto-selection is not a
# navigation the person made, and `/chat` should mean "chat" rather than "chat,
# and here is a channel id you did not choose".
#
# What it costs is the screen being sendable at all on arrival. Somebody opens
# chat, reads something, copies the URL — and the recipient gets whatever
# channel THEIR fallback lands on. The effect's own comment spells out the
# failure it was written to fix ("copying the address bar gave them /chat, which
# lands in #general") and the comment survives this patch.
#
# AIMED AT THE WRONG CALL SITE THE FIRST TIME, and the run said so. The first
# version rebound `setSelectedId`, which is an alias assigned one line below
# `selectChannel` and used by the sidebar — and the fallback effect calls
# `selectChannel` DIRECTLY. It applied cleanly, changed a real line, and the
# suite came back 28 passed, 0 failed. Reading the assertion and walking
# outwards from it is the rule; reading the alias and hoping to meet the
# assertion is what this was.
#
# One check: every later part of the chat section clicks a channel explicitly,
# and those still write the address.
#
# Reddens: addressability-live: "landing on chat names the channel it chose"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """    const general = channels.find((c) => c.name === 'general') ?? channels[0]
    if (general) selectChannel(general.id)
  }, [channels, deepLink.channel])
"""
b = """    const general = channels.find((c) => c.name === 'general') ?? channels[0]
    // An auto-selection is not a navigation the person made, so it stays out of
    // the address; an explicit click still goes through `selectChannel`.
    if (general) setFallbackChannel(general.id)
  }, [channels, deepLink.channel])
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

# The local state it now keeps, and the read that has to honour it.
sel = "  const selectedId = deepLink.channel ?? null\n"
assert s.count(sel) == 1, f'selectedId anchor appears {s.count(sel)} times, expected exactly 1'
s = s.replace(
    sel,
    "  const [fallbackChannel, setFallbackChannel] = useState<string | null>(null)\n"
    "  const selectedId = deepLink.channel ?? fallbackChannel ?? null\n",
)
io.open(p, 'w', encoding='utf-8').write(s)
print('workspace-chat-page.tsx: the fallback channel is not in the address.')
