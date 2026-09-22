# The frame's Template Types rail reads Space, Folder, List — in that order.
# Shuffled here, so a rail that renders "whatever came back" stops matching the
# frame while still rendering three plausible checkboxes.
#
# Reddens: template-center: "order — Space, Folder, List"
import io
p='/home/user/rundesk/packages/db/src/schema/templates.ts'
s=io.open(p,encoding='utf-8').read()
a="export const TEMPLATE_TARGET_TYPES = ['space', 'folder', 'list'] as const"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"export const TEMPLATE_TARGET_TYPES = ['folder', 'space', 'list'] as const"))
print('BREAK 1: Template Types now come back folder, space, list — the frame says space, folder, list')
