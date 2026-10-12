# NO PLAN EXPORTS THE GANTT AS A PICTURE.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "Export › PNG downloads the picture of the view: a PNG wider than the task names, as tall as its group and five tasks"
#   "and Export › PDF a one-page PDF holding that picture as a JPEG"
#   "on Pro, PDF and PNG open the plan’s gate naming Business and download nothing, while the CSV of the same rows stays free"
#
# Business and Enterprise lose the feature, so the gate refuses where the plan allows.
# And on Pro the gate names no plan to move to, as none has it.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.constants.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  boardExport: true,\n  ganttExport: true,\n}',
     '  boardExport: true,\n  ganttExport: false,\n}'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-18-no-plan-exports-the-picture: NO PLAN EXPORTS THE GANTT AS A PICTURE.')
