# A PRIVATE VIEW THE LIST WAS LEFT ON AS ITS DEFAULT KEEPS IT, beside the first shared view: two defaults.
# Reddens: view-writes-by-level: "a private view the list was left on as its default gives the default up to the list’s first shared view, so the list holds one, and its maker may rename it again"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """      if (isDefault) {
        await tx
          .update(taskViews)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(taskViews.listId, data.listId), eq(taskViews.isDefault, true)))
      }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-35-a-private-default-kept: a private view the list was left on as its default keeps it")
