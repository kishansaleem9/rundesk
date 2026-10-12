# AN AI FIELD’S USE IS METERED TO NOBODY.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "Generate fills the Summary: the model was asked with the task’s title, description and comments, its answer is the field’s value (read by SQL), and the use is metered to the asker"
#
# The call is recorded without the person who asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const response = await this.complete(`custom_field.${kind}`, ctx, {",
     "    const response = await this.complete(`custom_field.${kind}`, { ...ctx, userId: undefined }, {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-5-metered-to-nobody: AN AI FIELD’S USE IS METERED TO NOBODY.')
