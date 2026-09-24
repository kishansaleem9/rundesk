# A GUEST MAKES A DOC OF NO SPACE, the workspace's.
# Reddens: doc-write-levels: "a guest makes no workspace-wide doc (403, none made) — a member makes one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!spaceId) {\n      if (guest) throw new ForbiddenException('Guests cannot create docs here')\n      return\n    }\n"
b = '    if (!spaceId) {\n      return\n    }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-5-guests-make-loose-docs: applied")
