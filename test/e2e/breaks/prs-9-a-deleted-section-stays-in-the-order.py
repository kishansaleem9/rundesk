# A DELETED SECTION STAYS IN THE RAIL'S ORDER.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "deleting a section takes it off the rail and out of the order, and the task it held stays as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (Array.isArray(settings.railSections) && settings.railSections.includes(sectionKey(sectionId))) {\n',
     "      if (Array.isArray(settings.railSections) && settings.railSections.includes(sectionKey(sectionId)) && process.env.CSR_NEVER === 'yes') { // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-9-a-deleted-section-stays-in-the-order: a deleted section stays in the order')
