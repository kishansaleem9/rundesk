# A view offered by the server that no surface renders — the mirror defect.
#
# All eleven of frame `07:10` are drawn now (`ledger-rows/row-777`), so the ghost
# is one ClickUp has and a Rundesk list does not draw as a tab: Chat.
#
# Reddens: space-wizard-views: "none of Chat, Form or Embed is offered — a list draws no such tab"
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/space-presets.ts'
s=io.open(p,encoding='utf-8').read()
a="export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team', 'activity', 'workload', 'timeline', 'mindmap', 'map'] as const"
assert s.count(a)==1
b="export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team', 'activity', 'workload', 'timeline', 'mindmap', 'map', 'chat'] as const"
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
