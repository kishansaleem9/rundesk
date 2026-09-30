# A TEMPLATE KEEPS THE SAME TAG TWICE IN TWO CASES (`ledger-rows/row-1874`).
#
# Trimmed but not de-duplicated: "Q3" and "q3" are both written, two chips on
# the card for one word. The facet counts templates, so its numbers stay right,
# and only the row says so.
#
# Reddens: template-center: "a template made with \" Q3 \", \"client\" and \"q3\" carries Q3 and client, trimmed and once each (read from the database)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (seen.has(key)) continue\n"
b = "    // BROKEN: duplicates kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-21-duplicates-kept: a tag given in two cases is kept twice')
