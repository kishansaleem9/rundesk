# THE RAIL'S ORDER TAKES ANOTHER PERSON'S SECTION.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a section is its maker’s: a colleague is listed none of theirs, reaches none of them (404) and cannot place one in their own rail (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (named.some((id) => !ownedIn.has(id))) {\n',
     "      if (named.some((id) => !ownedIn.has(id)) && process.env.CSR_NEVER === 'yes') { // BROKEN: anybody's\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("prs-8-anybodys-section-is-ordered: anybody's section is ordered")
