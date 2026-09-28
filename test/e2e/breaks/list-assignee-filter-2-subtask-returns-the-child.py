# The Subtasks source returns the CHILD's id rather than the parent row the
# list actually draws. The endpoint answers, the array is the right length,
# and the id it contains matches nothing on screen — a confident answer to
# a question nobody can act on.
# Reddens: "the Subtasks source is the PARENT of the child assigned to me, not the child",
#          "Subtasks adds the PARENT of the child assigned to me".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const subtasks = opts.subtasks\n      ? surface('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    const subtasks = opts.subtasks\n      ? ((ids: string[]) => [...ids].sort())('))
print('[break 2] The Subtasks source reports children the list never draws.')
