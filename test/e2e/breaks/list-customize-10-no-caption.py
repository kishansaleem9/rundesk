# The caption is removed entirely — the state the export-paywall row was in
# before this commit: the refusal exists, the padlock is on a summary that
# is off screen once the section is open, and the dialog says nothing.
# Reddens: "the open export dialog carries the plan caption, beside the button it is about" and the two after it.
#
# THE WHOLE BLOCK GOES, rather than `{false && (…)}`. The first version of
# this patch did that and DID NOT COMPILE: TypeScript runs no control-flow
# analysis through code it has decided is unreachable, so the `boardExportPlan
# ? … : …` inside stopped narrowing and `boardExportPlan.label` became
# 'possibly null'. A patch that does not compile proves nothing, and it is
# worse than no patch because it reports as a confirmation.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            {exportView === \'board\' && boardExportLocked && (\n              <p\n                data-testid="list-export-plan-note"\n                data-plan={boardExportPlan?.id ?? \'\'}\n                className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground"\n              >\n                <Zap className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />\n                {boardExportPlan\n                  ? t(\'list.export.planNote\', { plan: boardExportPlan.label })\n                  : t(\'list.export.planNoteUnknown\')}\n              </p>\n            )}\n'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('[break 10] The export dialog teaches nothing before the button is pressed.')
