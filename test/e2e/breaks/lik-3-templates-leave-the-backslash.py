# A TEMPLATE SEARCH ESCAPES THE WILDCARDS BUT NOT THE BACKSLASH, as it did.
# Reddens: like-literal: "a template search ending in a backslash finds the template whose name ends in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const like = q ? likeContaining(q) : null\n'
b = '    const like = q ? `%${q.replace(/[%_]/g, (m) => `\\\\${m}`)}%` : null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lik-3-templates-leave-the-backslash: done')
