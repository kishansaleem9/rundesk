# AN AI FIELD’S SETTINGS ARE DROPPED: IT IS MADE A PLAIN TEXT FIELD.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the eight AI fields are made, each within the type ClickUp puts it in (read by SQL) — and a kind in the wrong type, a custom field without its instruction and a translation without its language are refused in words"
#   or "the sheet’s field picker offers the eight AI fields, asks a custom one for its instruction, and makes it as a Long Text with its settings (read by SQL)"
#   or "Generate fills the Summary: the model was asked with the task’s title, description and comments, its answer is the field’s value (read by SQL), and the use is metered to the asker"
#   or "Categorize is asked to choose among its own options and keeps the one named (read by SQL); an answer that is none of them is refused in words (502) and the value stays"
#   or "the other six fill too, each asked in its own words — Progress Updates with the comments, Translation into its language, the custom ones with their instruction — and each keeps its answer in its own type (read by SQL)"
#   or "a reader of the task is refused before any model is asked (403, nothing kept, no use recorded), as are a field that is not an AI field (400, in words) and an AI field the task has not got (404)"
#   or "a task made where a field set to fill new tasks is gets its value without anybody asking — that field’s, and no field not set to (read by SQL)"
#   or "a field set to update when the task changes is asked again after an edit — with the edited description — and once for two edits in a row, not once each (read by SQL)"
#   or "the sheet offers ✦ Generate on an AI field, and what the model wrote is drawn in the field and kept (read by SQL)"
#
# Measured 12 October: the last 8 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# The settings of a Short Text, Long Text or Dropdown are never read.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (r.ai == null) return null\n",
     "      if (r.ai == null || type.length > 0) return null\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-1-the-ai-settings-are-dropped: AN AI FIELD’S SETTINGS ARE DROPPED: IT IS MADE A PLAIN TEXT FIELD.')
