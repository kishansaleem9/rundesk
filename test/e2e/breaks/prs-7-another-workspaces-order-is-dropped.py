# AN ORDER SAVED FROM ONE WORKSPACE DROPS THE OTHER WORKSPACE'S SECTIONS.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "an order saved from the other workspace keeps this one’s section where it stood, and each rail draws only its own"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (railOrder && workspaceId && Array.isArray(currentPlanner.railSections)) {\n',
     "    if (railOrder && workspaceId && Array.isArray(currentPlanner.railSections) && process.env.CSR_NEVER === 'yes') { // BROKEN: no merge\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("prs-7-another-workspaces-order-is-dropped: another workspace's order is dropped")
