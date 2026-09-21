# The Channels section stops filtering DMs out, so every conversation appears
# under BOTH headings. The two sections become one list with two titles — and
# `+ Add Channel` becomes the button sitting under a direct message.
# Reddens: sidebar-dms "and the Channels section still holds none of the direct messages"
#      and sidebar-sections "and none of the N direct messages, which frame `06:25` puts in its own section"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "  const channels = (channelsQuery.data ?? []).filter((c) => !c.isDm)\n"
b = "  // BROKEN: Channels lists the direct messages as well.\n  const channels = channelsQuery.data ?? []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Channels section lists direct messages again.')
