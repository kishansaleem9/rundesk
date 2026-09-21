# The history stops joining the editor, so every entry says what changed and
# when and not who. An audit trail with the audit removed — and the rows are
# all still there, so a check that counted entries or read their text would not
# notice.
#
# Reddens: task-menu: "and it names who replaced it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      with: { editor: PUBLIC_USER_WITH },\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: description history no longer says who replaced anything.')
