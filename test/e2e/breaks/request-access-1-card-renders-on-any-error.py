# The card stops distinguishing 403 from every other failure and renders on
# any `ApiError`.
#
# Which includes 404 — and a "Request access" button on a 404 confirms that the
# object exists to somebody who was never told about it. The component's own
# comment says why the distinction is there: "the resource guard throws 403 for
# an object that exists and 404 for one that does not, so a request button on a
# 404 would confirm the existence of things the caller was never told about —
# the reverse of what the private flag is for."
#
# This is the card as first written, restored. The suite's last-but-one check
# exists because of it: "Checked because the first version of the card keyed
# off 'any error at all' and this run never exercised a 404, so nothing caught
# it."
#
# EXACTLY ONE CHECK, AND IT IS THE ONE THAT NAVIGATES TO A TASK THAT DOES NOT
# EXIST. Everything about the private task still works — the 403, the card, the
# button, the confirmation, the owner's notification — which is what makes this
# a leak rather than a breakage, and why it needed a check of its own rather
# than being implied by the five above it.
#
# Reddens: request-access: "but a task that does not exist offers nothing to ask for"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-card.tsx'
a = "  if (!(error instanceof ApiError) || error.status !== 403) return null"
b = "  if (!(error instanceof ApiError)) return null"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-card.tsx: the card now renders on a 404 as well as a 403.')
