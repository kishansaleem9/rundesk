# A GUEST BRINGS CREDITS TO THE MONTH.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the month’s credits are the plan’s per member times its members — a guest brings none — unlimited on Enterprise, and renew on the 1st"
#   or "at 80% of the month’s credits the workspace is warned: the composer says so and how many are left"
#   or "with the month’s credits used, AI pauses: a call is refused in words with when they renew (402), written down as a refusal that cost nothing (read by SQL)"
#   or "the composer says AI is paused, until when, and that an admin can add credits — none left of the month’s"
#   or "credits bought and paid for count toward the month: the allowance grows by them and AI is no longer paused"
#   or "a purchase not yet paid for counts for nothing"
#   or "the credits card shows the month’s credits, used and bought, each day’s running total against the limit line, what each kind of AI used, and Add credits to the owner"
#
# Measured 12 October: the last 6 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Every member of the workspace is counted, guests too.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    (".where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest'))),",
     ".where(and(eq(workspaceMembers.workspaceId, workspaceId))),"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-1-a-guest-brings-credits: A GUEST BRINGS CREDITS TO THE MONTH.')
