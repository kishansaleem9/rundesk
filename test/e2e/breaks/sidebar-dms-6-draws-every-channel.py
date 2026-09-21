# The section drops its `isDm` filter and renders everything the endpoint
# returned. It still "has direct messages in it", which is why the count is
# asserted against the SERVER's own split rather than against "at least one".
# Reddens: sidebar-dms "the section draws exactly the N direct message(s) the server returns"
#      and sidebar-dms "and none of the N public channels, which have their own section"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "  const dms = (channelsQuery.data ?? []).filter((c) => c.isDm)\n"
b = "  // BROKEN: renders everything it was handed.\n  const dms = channelsQuery.data ?? []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Direct Messages section lists the public channels too.')
