# A SECTION OF ONE'S OWN OFFERS NO DELETE.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "deleting a section takes it off the rail and out of the order, and the task it held stays as it was"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                            onDelete={ownId ? () => deleteSection.mutate(ownId) : undefined}\n',
     '                            onDelete={undefined} // BROKEN: no delete\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w7-delete-is-not-offered: delete is not offered')
