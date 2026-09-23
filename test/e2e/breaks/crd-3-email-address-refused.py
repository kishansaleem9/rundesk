# NO ADDRESS FOR ANYBODY: the refusal half with no grant half.
# Reddens: credential-reads: "while a member of the workspace gets it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = "  emailAddress(@Param('taskId') taskId: string) {\n"
b = "  emailAddress(@Param('taskId') taskId: string) {\n    if (taskId) throw new BadRequestException('No address for anybody')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-3-email-address-refused: applied")
