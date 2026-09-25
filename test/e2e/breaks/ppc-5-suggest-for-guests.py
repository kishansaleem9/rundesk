# SUGGEST TASKS IS OFFERED TO A GUEST, whom the AI routes refuse.
# Reddens: project-page-controls: "a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return { edit, archive, members, statuses, suggest: membership?.role !== 'guest', lists: perList }\n"
b = "    return { edit, archive, members, statuses, suggest: membership?.role !== 'guest' || projectId !== '', lists: perList }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-5-suggest-for-guests: suggest for guests')
