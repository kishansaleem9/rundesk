# The paid download becomes the free one with a different name on the button.
# Reddens: "the board export leads with the column each card is sitting in",
#          "every row names a real board column",
#          and in list-export.mjs "an entitled plan gets a different sheet".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (opts.view === 'board') {"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (false) {"))
print('[break 4] skipped the board-shaped branch of exportListView in tasks.service.ts —')
print('          ?view=board now returns the ordinary list sheet.')
