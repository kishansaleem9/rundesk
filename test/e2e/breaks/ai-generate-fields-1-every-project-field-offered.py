# GENERATE OFFERS EVERY FIELD OF THE PROJECT, the one scoped to another list among them, and asks the
# model about it; saving its value is then refused by the field's route (`found-30-sep/ai-page-fields-checked-only-by-a-unit`).
# Reddens only where a model answers: run it on a lane with RUNDESK_LANE_MODEL set for that lane.
# Reddens: ai-generate-fields:
#   "Generate offers a box for the project’s field and the chosen list’s, each filled with the model’s suggestion, and none for the field scoped to the other list"
#   "and the model is asked about those two fields only: the other list’s field is not in its prompt"
#   "and saving makes the task in the chosen list holding those two values, none for the other list’s field, and refused nothing (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = "  const fields = fieldsOfList(fieldsQuery.data ?? [], targetListId)\n"
b = "  const fields = fieldsQuery.data ?? [] // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-generate-fields-1-every-project-field-offered: the page offers every field of the project')
