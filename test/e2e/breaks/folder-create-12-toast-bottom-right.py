# Put the toaster back to bottom-RIGHT, where the privacy banner sits and has
# already swallowed clicks in three suites. Both frames draw bottom-LEFT.
# ITS LOG IS EVIDENCE FROM A BROKEN HARNESS, not a statement about this patch.
# The run on disk shows three failures about a 409 reading "That resource already
# exists" where the service should say "Folder name taken" — which a TOAST
# POSITION patch cannot possibly cause. It dates from the worktree
# package-resolution era, when a patch to `packages/**` was applied in the
# worktree and built from the repo, and the ledger records this patch by name as
# one that "was recorded as reddening three checks unrelated to its claim".
#
# Left alone deliberately: the fix is a re-run, not a re-aim, and
# `folder-create` is in the stale plan.
#
# Reddens: folder-create: "and it sits bottom-left, where frame `08:55` stacks them"
import io, re
p = '/home/user/rundesk/packages/ui/src/components/toaster.tsx'
s = io.open(p, encoding='utf-8').read()
a = "bottom-left"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "bottom-right"))
print('toaster.tsx: toasts are bottom-right again — the corner the privacy banner lives in.')
