# The query fires even with all three switches off, so the page asks the
# server a question it has just been told not to ask.
# Reddens ONLY: "nothing is asked of the server".
#
# Reddens: list-assignee-filter: "and nothing is asked of the server, because there is nothing to extend"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    enabled: !!assignedViaPerson && assignedViaAny,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    enabled: !!assignedViaPerson,'))
print('[break 7] The page fetches assigned-via with every switch off.')
