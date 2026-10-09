# HOME HAS NO “OPEN AS A LIST”.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "“Open as a list” opens her Personal List as a list, her tasks in it"
#
# The Personal List is a list nobody can open as one.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              {personalList && (\n                <div className="flex justify-end">',
     '              {personalList && false && (\n                <div className="flex justify-end">'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-w2-no-open-as-a-list: HOME HAS NO “OPEN AS A LIST”.')
