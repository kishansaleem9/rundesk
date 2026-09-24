# DELETING A FIELD, AND EVERY VALUE IN IT, CHECKS ONLY THE WORKSPACE, as it did.
# Reddens: custom-field-access: "a member cannot rename or delete a field of a project they are refused (404 each, the field untouched) — while they rename an open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '  async deleteDefinition(workspaceId: string, fieldId: string, reader?: ReadActor) {\n    const def = await this.getDefOwnedBy(workspaceId, fieldId)\n    await this.assertProjectOpenTo(workspaceId, def.projectId, reader)\n'
b = '  async deleteDefinition(workspaceId: string, fieldId: string, reader?: ReadActor) {\n    const def = await this.getDefOwnedBy(workspaceId, fieldId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-5-delete-skips-the-reader: applied")
