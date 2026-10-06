# A READER PUBLISHES THEIR PRIVATE VIEW: making it shared asks nothing, so it goes into everybody's strip.
# Reddens: view-writes-by-level: "a reader’s own private view stays theirs: they make it, rename it and change its layout, and delete it; it is never the list’s default, and making it shared is refused (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (existing.visibility === 'private' && nextVisibility !== 'private') {
      await this.assertSharedViewLevel(existing.listId, actor, { kind: 'shared view', act: 'adding a' })
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-3-readers-publish-their-private-views: making a private view shared asks no level')
