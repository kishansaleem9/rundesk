# THE FIRST ESCAPE CLEARS A TYPED NAME INSTEAD OF CLOSING THE CREATOR.
#
# The task title keeps an Escape for itself whenever it holds text — the
# "clear the field first" habit — so with a name in it one Escape closes
# nothing and the creator stays over the page; a second closes it. An empty
# title lets the key through, which is why every section that closes a
# creator it never typed into still gets out: only the one that types a name
# and presses Escape once can see it.
#
# Reddens: space-create-menu: "and ONE Escape closes the creator the space’s “+” opened"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """        data-testid="quick-create-task-title"
        placeholder={t('quickCreate.taskTitlePlaceholder')}
"""
b = """        data-testid="quick-create-task-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && title) {
            e.stopPropagation()
            setTitle('')
          }
        }}
        placeholder={t('quickCreate.taskTitlePlaceholder')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the first Escape clears a typed task name and keeps the creator open.')
