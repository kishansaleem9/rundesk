# Compare names verbatim instead of case-insensitively, so "CLIENTS" gets in
# beside "Clients" — a rule that enforces something nobody means.
# Reddens: folder-create: "and case does not get around it"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "          sql`lower(${folders.name}) = lower(${trimmed})`,"
b = "          eq(folders.name, trimmed),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folders.service.ts: the name check is now case-SENSITIVE, so "CLIENTS" sits beside "Clients".')
