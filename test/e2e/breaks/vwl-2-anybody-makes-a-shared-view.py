# ANYBODY WHO READS THE LIST MAKES A VIEW EVERYBODY SHARES: making one asks no level, as it did.
# Reddens: view-writes-by-level: "neither makes a view everybody shares: one said protected, or not said, is refused in the level’s words (403) and nothing is saved"
#   or "a member at Comment is refused the same, in its words (403), and where the default is Edit a member makes, renames and defaults the list’s shared views"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (visibility !== 'private') {
      await this.assertSharedViewLevel(data.listId, actor, { kind: 'shared view', act: 'adding a' })
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-2-anybody-makes-a-shared-view: making a shared view asks no level")
