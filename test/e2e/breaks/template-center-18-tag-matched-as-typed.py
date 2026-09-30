# `tag=` MATCHES ONLY THE SPELLING SENT (`ledger-rows/row-1874`).
#
# The facet counts one bucket per word whatever its case, and the filter finds
# only the templates tagged in the bucket's own spelling: "Q3 (6)" narrows the
# grid to four.
#
# Reddens: template-center: "choosing Q3 leaves exactly the six templates tagged with it, in either case"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "      selected.push(sql`exists (select 1 from unnest(${projectTemplates.tags}) as t where lower(t) = lower(${tag}))`)\n"
b = "      selected.push(sql`exists (select 1 from unnest(${projectTemplates.tags}) as t where t = ${tag} /* BROKEN: case-sensitive */)`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-18-tag-matched-as-typed: tag= matches one spelling only')
