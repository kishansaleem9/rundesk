# ANY `section:` KEY IS READ AS A SECTION'S, an id or not.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: unit: planner-sections.service.test.ts "a section’s key names its id, and nothing else is one"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  typeof key === 'string' && key.startsWith(SECTION_KEY_PREFIX) && isUuid(key.slice(SECTION_KEY_PREFIX.length))\n",
     "  typeof key === 'string' && key.startsWith(SECTION_KEY_PREFIX) // BROKEN: any key\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("prs-13-any-key-is-a-section-unit: ANY `section:` KEY IS READ AS A SECTION'S, an id or not.")
