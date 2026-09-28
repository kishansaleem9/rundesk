# One of the three is missing from the panel — the commonest way a row of
# this shape ships "done" with two thirds of it built.
# Reddens: "the three switches are there, in the frame's order" and
#          everything that drives the missing one.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            <PanelSwitch\n              testId="list-board-show-empty-fields"'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '            <PanelSwitch\n              testId="list-board-show-empty-fields-REMOVED"'))
print('[break 13] The Show empty fields switch is no longer in the panel.')
