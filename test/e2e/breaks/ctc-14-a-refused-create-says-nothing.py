# A REFUSED CREATE SAYS NOTHING: the task mutation has no onError, so the button comes back as if it had not been pressed.
# Reddens: create-task-chevron: "a create the server refuses says so in the server’s words, and leaves the modal open holding what was typed"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.taskFailed')),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-14-a-refused-create-says-nothing: no onError')
