# The padlock drawn and the switch still live — the panel offers a choice the
# server will refuse, which is worse than not offering it.
#
# IT NAMED THE WRONG CHECK, and the log said so once anybody compared the two.
# "the panel padlocks exactly the four this plan cannot reach" reads the
# padlock BADGES, which this patch does not touch: it passes, correctly. What
# falls is the check beside it, which reads the switch's own disabled state and
# holds Priority up against Custom Fields so a blanket `disabled` cannot pass
# for a gate.
#
# PREDICTED ONE. The run that found this also failed
# `asking only for what the plan reaches succeeds, with the rest stored as off`
# with `status 403, features undefined` — a purely server-side check that calls
# the API directly and cannot be reached by a `disabled` prop in a React
# component. That is either fixture state from an earlier patch in the same set
# or a flake, and it is recorded here rather than claimed: a failure a patch
# cannot cause is not evidence for it.
#
# Reddens: clickapps-plan-gating: "Custom Fields is marked \"Pro\" and
#   un-switchable, while Priority stays switchable"
import io
p='/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
s=io.open(p,encoding='utf-8').read()
a="                    disabled={!!gate}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                    disabled={false}\n"))
