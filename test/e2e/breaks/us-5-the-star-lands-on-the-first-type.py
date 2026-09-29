# THE STAR LANDS ON THE FIRST TYPE: whichever row's star is pressed, the workspace's first task type becomes the default.
# Reddens: ui-sweep: "and marked it the default"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '                  onClick={() => update.mutate({ id: tt.id, patch: { isDefault: !tt.isDefault } })}\n'
b = '                  onClick={() => update.mutate({ id: types[0].id, patch: { isDefault: true } })}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('us-5-the-star-lands-on-the-first-type: every star makes the first type the default')
