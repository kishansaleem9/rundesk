# A WORKSPACE THAT BLOCKS PUBLIC SHARING STILL HANDS ITS CLIPS TO ANYBODY (`resume-defects/resume-7`).
#
# The members-only rule asks the row's other flag, the archived one: two
# booleans side by side in the same select. An archived workspace is refused
# the line above, so the rule never holds, and a clip link from a workspace
# that promised no anonymous links plays for a stranger, and for somebody from
# any other workspace.
#
# (The first version tested `viewer === undefined`, which the compiler narrows
# to `never` for a `… | null`, and it did not compile: a patch that does not
# build proves nothing.)
#
# Reddens: clip-links: "and somebody signed out who opens it is asked to sign in, and shown nothing of the clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (row.blockPublicSharing) {\n'
b = '    if (row.workspaceArchived) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-1-the-block-is-ignored: a members-only clip plays for anybody')
