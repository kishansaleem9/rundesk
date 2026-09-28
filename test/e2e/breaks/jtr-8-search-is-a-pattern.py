# A TEAM SEARCH IS A PATTERN AGAIN: % and _ match anything.
# Reddens: job-title-rule: "a team search matches what was typed: ‘50%’ finds only the team with 50% in its name, and ‘a_b’ only the one with a_b"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s = io.open(p, encoding='utf-8').read()
a = 'ilike(workspaceGroups.name, likeContaining(opts.search))'
b = 'ilike(workspaceGroups.name, `%${opts.search}%`)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-8-search-is-a-pattern: done')
