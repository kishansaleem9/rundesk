# RENAMING A FIELD CHECKS ONLY THAT IT IS IN THE WORKSPACE, as it did.
# Re-aimed 25 September: the rename asks who may define fields beside the read rule now (`field-values-written-by-readers`); the patch still takes the read rule away.
# Re-aimed 5 October: that rule is asked with the field's own list now, below a comment (the review of `found-30-sep/field-definition-takes-a-foreign-list`); the patch still takes the read rule away.
# Reddens: custom-field-access: "a member cannot rename or delete a field of a project they are refused (404 each, the field untouched) — while they rename an open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    const def = await this.getDefOwnedBy(workspaceId, fieldId)\n    await this.assertProjectOpenTo(workspaceId, def.projectId, reader)\n    /*\n     * The field's own list decides, as it does when the field is made"
b = "    const def = await this.getDefOwnedBy(workspaceId, fieldId)\n    /*\n     * The field's own list decides, as it does when the field is made"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-4-rename-skips-the-reader: applied")
