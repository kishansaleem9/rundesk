# Drop the !isDm filter, so the Channels section swallows Direct Messages —
# which frame `06:25` draws as its OWN section with its own "+ New message".
# Reddens: sidebar-sections: "the section draws exactly the N public channels" /
#          "and none of the N direct messages"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const channels = (channelsQuery.data ?? []).filter((c) => !c.isDm)'
b = '  const channels = (channelsQuery.data ?? [])'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: DMs are drawn as channels again — one section for two things with two different creation gestures.')
