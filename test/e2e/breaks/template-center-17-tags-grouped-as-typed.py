# THE TAGS FACET GROUPS EACH SPELLING APART (`ledger-rows/row-1874`).
#
# "Q3" and "q3" are one word and one filter (`tag=` matches any case), and
# grouped as typed they are two buckets with two counts, neither of them the
# number of templates the filter finds.
#
# Reddens: template-center: "Tags counts client 3, Q3 6 and Retro 1 — one word whatever the case it was tagged in, in alphabetical order"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "        group by lower(t)\n"
b = "        group by t -- BROKEN: grouped as typed\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-17-tags-grouped-as-typed: Q3 and q3 are two buckets')
