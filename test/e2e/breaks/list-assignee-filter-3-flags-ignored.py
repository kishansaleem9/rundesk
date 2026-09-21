# The three flags are accepted and ignored: all three sources are always
# queried. Every switch appears to work because all three widen the list
# by everything, always.
# Reddens: "asked for Comments alone it returns Comments alone",
#          "with all three off it finds nothing at all",
#          and the three one-at-a-time grid checks.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const comments = opts.comments\n      ? surface('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    const comments = true\n      ? surface('))
print('[break 3] The comments flag is ignored; the source runs whatever is asked.')
