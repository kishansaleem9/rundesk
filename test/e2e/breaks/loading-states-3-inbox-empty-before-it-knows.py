# The inbox goes back to rendering "You're all caught up" while the request that
# would tell it otherwise is still in flight.
#
# THE CONFIDENT ZERO, and the exact one this suite was written for. `notifs` is
# `notifsQuery.data ?? []`, so before the response lands it is genuinely an
# empty array — and an empty array taken at face value is an assertion that your
# inbox is empty. Removing the `isPending` branch deletes a ternary and one
# component, which reads as simplification: the empty state is right for an
# empty inbox, and the code no longer says the same thing twice.
#
# It is indistinguishable from a true empty inbox from the outside, which is
# what makes it survive. On a fast connection you never see it. The suite holds
# `/notifications?` for three seconds and looks while it is outstanding, which
# is the only way to tell "nothing" from "not yet".
#
# Two checks, and they are two rather than one on purpose: the rows not being
# drawn is the missing wait, and the words "caught up" being on screen is the
# lie. A build that drew no skeleton but also said nothing would fail the first
# and pass the second.
#
# Reddens: loading-states: "and it does not claim the inbox is empty before it knows"
#   and "rows are drawn while the list loads"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = """          {notifsQuery.isPending ? (
            // Until the request lands, `notifs` is [] — and rendering the empty
            // state here would assert there is nothing in your inbox before we
            // know that. Skeleton rows say "still looking" instead.
            <ListSkeleton rows={7} rowClassName="h-14" />
          ) : notifs.length === 0 && savedMessages.length === 0 && savedComments.length === 0 ? (
"""
b = """          {notifs.length === 0 && savedMessages.length === 0 && savedComments.length === 0 ? (
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("workspace-inbox-page.tsx: an in-flight inbox renders the empty state.")
