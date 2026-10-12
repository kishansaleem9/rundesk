# AN AI FIELD OFFERS NO GENERATE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet offers ✦ Generate on an AI field, and what the model wrote is drawn in the field and kept (read by SQL)"
#
# The ✦ Generate button is not drawn.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("              {definition.config?.ai && <AiFieldGenerate definition={definition} workspaceId={workspaceId} taskId={taskId} />}",
     "              {definition.config?.ai && definition.name.length < 0 && <AiFieldGenerate definition={definition} workspaceId={workspaceId} taskId={taskId} />}"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w2-no-generate: AN AI FIELD OFFERS NO GENERATE.')
