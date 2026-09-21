# The private filter dropped from the list query, so everybody's private views
# appear in everybody's strip. The NAME of a private view is part of what makes
# it private — "Q3 layoffs draft" in a colleague's list is a leak before anyone
# opens anything, and opening it still 404s, so nothing in the product says a
# mistake was made.
#
# Reddens: view-visibility: "a private view was listed to somebody who does not own it"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """          actor.role === 'super_admin'
            ? undefined
            : or(ne(taskViews.visibility, 'private'), eq(taskViews.createdById, actor.id)),
"""
b = """          undefined,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('views.service.ts: private views are listed to everybody.')
