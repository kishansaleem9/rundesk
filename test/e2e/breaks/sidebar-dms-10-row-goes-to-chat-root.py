# A DM row navigates to the chat page without naming the conversation, so every
# row opens whatever the page defaults to. The section looks entirely correct
# and each of its rows leads to the same place.
# Reddens: sidebar-dms "clicking it opens that conversation, by its id"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "            search={{ channel: dm.id }}\n"
b = "            // BROKEN: every row opens the same conversation.\n            search={{} as never}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: DM rows navigate to the chat page without an id.')
