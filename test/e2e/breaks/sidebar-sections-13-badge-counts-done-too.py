# Count every personal task instead of the OPEN ones, so the badge never falls
# as work is ticked off — a number about the past.
# Reddens: sidebar-sections: "and ticking one off takes the badge down by exactly one"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const openPersonalTasks = (personalTasksQuery.data ?? []).filter((task) => !task.done).length'
b = '  const openPersonalTasks = (personalTasksQuery.data ?? []).length'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Personal List badge counts done work too, so it never goes down.')
