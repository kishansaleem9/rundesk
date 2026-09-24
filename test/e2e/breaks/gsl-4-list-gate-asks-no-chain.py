# MAKING A LIST PASSES NO CHAIN: a guest given a project to edit is refused a
# list in it, since only the space is asked.
# Reddens: guest-space-level: "where only an item is shared with a guest, its level is theirs there — they comment on the shared task and in the shared list, and make a list in the shared project — and not on the task beside them"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "      within: [{ type: 'project', id: projectId }, ...(owning?.folderId ? [{ type: 'folder' as const, id: owning.folderId }] : [])],\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-4-list-gate-asks-no-chain: the list gate asks the space alone')
