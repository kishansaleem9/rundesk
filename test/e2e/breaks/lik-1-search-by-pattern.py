# THE WORKSPACE SEARCH MATCHES THE QUERY AS A PATTERN AGAIN.
# Reddens: like-literal: "the workspace search for “50%” finds the task with 50% in its title and not the one with 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const like = trimmed ? likeContaining(trimmed) : null\n'
b = '    const like = trimmed ? `%${trimmed}%` : null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lik-1-search-by-pattern: done')
