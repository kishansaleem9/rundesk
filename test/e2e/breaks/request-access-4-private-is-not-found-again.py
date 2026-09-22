# The resource guard answers 404 for a private task instead of 403.
#
# The dead end as it was: "hitting a private object was still a dead end that
# said 'Task not found.' and stopped." Everything built for §G10 is still
# present and correct — the card, the button, the endpoint, the fan-out — and
# none of it can ever render, because the card is keyed on 403 and no 403
# happens any more. The whole item becomes unreachable through one word in an
# unrelated file.
#
# It is a plausible word. 403 and 404 are a genuine design argument — leaking
# existence versus offering a way in — and "private things should look like
# they are not there" is a defensible sentence that this item deliberately
# decided against.
#
# IT STOPS THE RUN AT 6 OF 9. Checks 3, 4 and 5 fail — the status, the card,
# the button — and then the click lands on a button that is not there, which is
# a Playwright timeout rather than a check result. A patch aimed at the thing
# every later check presses cannot leave those checks running.
#
# THE FIXTURE SURVIVES IT, WHICH IT WOULD NOT HAVE LAST WEEK. The roster
# cleanup used to sit at the end of the `try`, after eight checks, so a run
# that threw here left a freshly-signed-up member in the workspace for good —
# and this file already records what an accumulating roster costs another
# suite. It is in `finally` now. A break patch that only cleans up when the
# suite passes is a fixture leak wearing a test.
#
# Reddens: request-access: "the member is refused with 403, not 404 — it exists, they cannot see it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "        throw new ForbiddenException('This task is private')"
b = "        throw new NotFoundException('Task not found')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('resource-member.guard.ts: a private task is reported as missing, so the ask never appears.')
