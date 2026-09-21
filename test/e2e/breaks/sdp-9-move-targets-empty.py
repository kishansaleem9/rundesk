# The Move picker's filter set to refuse everything, so the destination tree is
# empty for every member. The "not offered" assertion passes on this — an empty
# answer satisfies "the view-only space is absent" just as well as a filtered
# one does — which is why the suite asserts the `edit` space SURVIVES as well.
# Reddens: space-default-permission:
#   "while the `edit` space still is — the filter is the permission, not an empty answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = """    return rows.filter((row) => {
      const resolved = levels.get(row.id)
      return !resolved || spaceLevelReaches(resolved.level, 'edit')
    })
"""
b = """    return rows.filter(() => false)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: narrowToWritable now drops every space, so the Move picker is empty rather than filtered.')
