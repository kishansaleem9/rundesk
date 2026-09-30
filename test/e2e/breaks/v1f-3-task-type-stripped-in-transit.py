# The create modal offers a task type and leaves it out of the request.
#
# THE DEFECT THIS SECTION WAS WRITTEN FOR, and the suite's own comment names the
# mechanism: "The DTO ran with whitelist:true and no taskTypeId field, so it was
# stripped in transit." Nothing about the control changes — the select is there,
# the workspace's types are listed, Milestone is selectable, the value is held in
# state and rendered back — and the task is created. It is created without a
# type.
#
# `[21:36]` is "yahan pe humein woh option hi nahi deta ke hum task type ko
# select kar sakein", and the fix was the option. An option you can pick that
# does not travel is the same screen with more clicks in it — the picker
# confirms, the list shows the task, and its type is the list's default.
#
# The spread-with-guard shape is what makes this survivable in review:
# `...(taskTypeId ? { taskTypeId } : {})` reads as a conditional that exists to
# avoid sending an empty string, so deleting it looks like tidying a branch
# whose falsy case does nothing.
#
# One check. `the create modal offers a task type`, `the workspace's types are
# listed` and `creating posts to /tasks` all pass — the picker is not what
# broke, and the POST still happens. Only the one that reads the request BODY
# can tell, which is why the suite records calls rather than watching the
# screen.
#
# Reddens: video1-fast-items: "and the chosen type is in the request body"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """      ...(taskTypeId ? { taskTypeId } : {}),
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the chosen task type never leaves the browser.')
