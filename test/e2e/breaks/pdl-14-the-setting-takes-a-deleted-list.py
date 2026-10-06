# THE PLANNER'S SETTINGS SAVE A LIST IN THE TRASH AS THE DEFAULT LIST. (`found-6-oct/default-list-setting-takes-a-deleted-list`)
# Reddens: planner-default-list: "a list in the trash is not saved as the Default list: refused, 409, in the create gate’s words — the admin who deleted it told to restore it, the member to ask — and the admin’s setting stays as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        if (err instanceof ListInTrashException || !(err instanceof HttpException)) throw err\n'
b = '        if (!(err instanceof HttpException)) throw err\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdl-14-the-setting-takes-a-deleted-list: the settings take a list in the trash')
