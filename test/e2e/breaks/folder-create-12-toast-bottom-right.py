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
# Left alone deliberately: the fix is a re-run, not a re-aim. The sentence that
# stood here said `folder-create` was "in the stale plan", and it was not —
# nothing in the tree changed to fix a RUNNER bug, so no rule about files could
# see this patch, and the claim sat in the header unchecked for a day. The line
# below is the same claim, made mechanical: the plan generator honours it until
# this patch has been measured at a commit later than this edit.
#
# AND THE RE-RUN HAPPENED, at 29f83079: 19 passed, 1 failed, on "the toast's
# centre was at (1298, 1003) of 1500x1000" — bottom-RIGHT, which is what this
# patch moves it to and what the check it names asserts against. So the header
# above was right that the fix was a re-run rather than a re-aim, and the
# `# Re-run:` line that said so is spent and gone: the generator counts a
# declaration only while the patch file has changed since the run that measured
# it, and nothing has changed since this one.
#
# It was the last UNPROVEN patch in the audit.
#
# Reddens: folder-create: "and it sits bottom-left, where frame `08:55` stacks them"
import io, re
p = '/home/user/rundesk/packages/ui/src/components/toaster.tsx'
s = io.open(p, encoding='utf-8').read()
a = "bottom-left"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "bottom-right"))
print('toaster.tsx: toasts are bottom-right again — the corner the privacy banner lives in.')
