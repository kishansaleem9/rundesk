# A SECTION'S NAME IS TAKEN AT ANY LENGTH.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a name past 60 characters, a blank one, and words for an emoji are refused, and nothing is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (name.length > SECTION_NAME_MAX) throw new BadRequestException(`A section's name is ${SECTION_NAME_MAX} characters at most`)\n",
     '    // BROKEN: any length\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-6-any-name-goes: any name goes')
