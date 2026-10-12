# TEAM VIEW SAYS NOTHING OF ITS FREE USES.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the Team View says how many of its free uses are left"
#
# The count of uses left is not drawn.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      {freeUses && (\n        <p className=\"text-[11px] text-muted-foreground\" data-testid=\"team-view-free-uses\"",
     "      {freeUses && freeUses.left < 0 && (\n        <p className=\"text-[11px] text-muted-foreground\" data-testid=\"team-view-free-uses\""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w6-no-uses-left: TEAM VIEW SAYS NOTHING OF ITS FREE USES.')
