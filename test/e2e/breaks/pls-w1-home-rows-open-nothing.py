# HOME’S PERSONAL LIST ROWS OPEN NOTHING.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "a row opens its task, in her Personal List, as any task opens"
#
# A row is a line of text, as the old card’s were: its task is opened from nowhere.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                      {personalList ? (\n                        // A task like any other',
     '                      {personalList && false ? (\n                        // A task like any other'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-w1-home-rows-open-nothing: HOME’S PERSONAL LIST ROWS OPEN NOTHING.')
