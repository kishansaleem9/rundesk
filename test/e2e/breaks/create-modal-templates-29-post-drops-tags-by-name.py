# `POST /tasks` DROPS THE TAGS NAMED WITH IT (`found-30-sep/refused-create-leaves-tags`): the
# handler builds its argument field by field, and `labelsByName` is not named there.
#
# Reddens: create-modal-templates: "POST /tasks takes tags by name — the one the workspace holds found whatever its case, the other made — and a create refused for its task type (400) makes none (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      labelsByName: body.labelsByName,\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('create-modal-templates-29-post-drops-tags-by-name: POST /tasks forwards no tags by name')
