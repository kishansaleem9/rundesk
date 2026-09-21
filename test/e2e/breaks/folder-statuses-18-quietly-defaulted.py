# Drop the refusal, so a scope the column does not have is written verbatim
# instead of being named as wrong. The caller gets a 201 and a folder whose
# `status_scope` no reader will ever match — the stale-reason defect, where the
# only record of the mistake is a value nothing looks at.
# Reddens: folder-dialog: "a scope it does not have is refused in words"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = """    if (data.statusScope !== undefined && data.statusScope !== 'space' && data.statusScope !== 'list') {
      throw new BadRequestException(
        `statusScope must be "space" or "list", not ${JSON.stringify(data.statusScope)}`,
      )
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("folders.service.ts: statusScope: 'project' is now accepted and written — 201, and no reader matches it.")
