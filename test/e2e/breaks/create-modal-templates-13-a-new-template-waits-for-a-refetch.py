# A TEMPLATE JUST SAVED IS NOT UNDER USE TEMPLATE UNTIL SOMETHING REFETCHES.
#
# The save succeeds and says so, and the menu beside it goes on listing the
# templates it had: the query is fresh for thirty seconds and nothing refetches
# on focus, so "Saved as template" is followed by a list without it.
#
# Reddens: create-modal-templates: "and Enter in the name box makes no task, leaves the form as it was, and the new template is under Use Template at once"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })\n      const name = saved?.name ?? templateName.trim()\n"
b = "      const name = saved?.name ?? templateName.trim()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-13-a-new-template-waits-for-a-refetch: no invalidation after a save')
