# THE SOURCE LIST CALLS SOMEBODY ELSE'S ACCOUNT CONNECTED FOR EVERYONE — and the tab then searches nothing for them.
# Reddens: unit: search.service.test.ts "lists a source as the searcher’s own, the workspace’s, or not connected"
#
# Re-aimed 12 October: somebody else's account is a mailbox now — a workspace's
# Drive answers every member — and the test was renamed with that rule. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "            : { id, provider, connected: false, heldBy: null, canConnect: true }\n"
b = "            : { id, provider, connected: true, heldBy: null, canConnect: true }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fsr-3-sources-connected-for-all: applied")
