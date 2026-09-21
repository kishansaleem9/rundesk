# The plan caption is drawn unconditionally — on an entitled plan, and on
# the free LIST export `[10:49]` says stays free. This is the caption's
# version of the gate spreading.
# Reddens: "no caption is shown to somebody whose plan already includes it",
#          "the free list download is captioned with nothing".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "            {exportView === 'board' && boardExportLocked && ("
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '            {true && ('))
print('[break 8] Every export dialog now says the download is a paid feature.')
