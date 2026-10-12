# A PURCHASE NOT YET PAID FOR COUNTS.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "a purchase not yet paid for counts for nothing"
#   or "the credits card shows the month’s credits, used and bought, each day’s running total against the limit line, what each kind of AI used, and Add credits to the owner"
#
# Measured 12 October: the last 1 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Purchases are counted from when they were made, paid or not.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    (".where(and(eq(aiCreditPurchases.workspaceId, workspaceId), eq(aiCreditPurchases.status, 'paid'), gte(aiCreditPurchases.paidAt, month.start))),",
     ".where(and(eq(aiCreditPurchases.workspaceId, workspaceId), gte(aiCreditPurchases.createdAt, month.start))),"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-8-pending-counts: A PURCHASE NOT YET PAID FOR COUNTS.')
