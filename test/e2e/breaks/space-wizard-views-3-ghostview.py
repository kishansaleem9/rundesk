# A view offered by the server that no surface renders — the mirror defect.
#
# Reddens: space-wizard-views: "none of Map, Activity, Mind Map, Timeline or Workload is offered"
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/space-presets.ts'
s=io.open(p,encoding='utf-8').read()
a="export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team'] as const"
assert s.count(a)==1
b="export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team', 'workload'] as const"
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
