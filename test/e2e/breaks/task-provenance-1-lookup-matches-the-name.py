# `taskTypeIdForOrigin` looks the type up by its NAME instead of its `origin`
# marker.
#
# This is the build the design exists to rule out, and the file says so in its
# own words: "Looked up by the `origin` marker rather than by name, because the
# vocabulary belongs to the workspace: renaming 'Form Response' to 'Enquiry',
# or running in Urdu, must not quietly stop the stamping."
#
# It is also the version somebody writes first. The seed data spells the name
# right there in `DEFAULT_TASK_TYPES`, matching on it needs no extra column,
# and it works perfectly until the day a workspace renames the type — at which
# point submissions stop being stamped and nothing anywhere says so.
#
# EXACTLY ONE CHECK REDDENS, and it is the last one. The first submission is
# stamped correctly, because the type is still called "Form Response" when it
# arrives; the hand-made task is still left alone; the rename still succeeds.
# Only the submission AFTER the rename comes back untyped. A suite that
# asserted the type's name rather than its `origin` would have gone through
# this patch green from end to end.
#
# Reddens: task-provenance: "a submission after the rename is still stamped"
import io
p = '/home/user/rundesk/apps/api/src/common/task-types/origin.ts'
a = "    .where(and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.origin, origin)))"
b = """    .where(
      and(
        eq(taskTypes.workspaceId, workspaceId),
        eq(taskTypes.name, origin === 'form' ? 'Form Response' : 'Meeting Note'),
      ),
    )"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('origin.ts: the provenance type is now found by name, so a rename stops the stamping.')
