# `WorkspacesService.create` stops seeding the starter list's status pipeline.
#
# This is the bug as it shipped, and the one this whole suite exists for: a
# workspace's first list had no statuses, `resolveStatusForList` answered
# `category: 'open'` for any key, and work marked done in a new workspace's
# first list never counted as done anywhere.
#
# IT STOPS THE RUN, AND THAT IS THE SUITE WORKING AS DESIGNED. Check 3 finds
# no status with category "closed" and the suite throws — "without a closed
# status there is no way to finish anything here" — so the run ends at 3 of 10
# rather than letting the six checks below it pass vacuously against a list
# that cannot be finished. Its own header says this is how it was found:
# "a fixture could not close a task — the suite that needed it refused to
# continue rather than let the check pass vacuously, which is the only reason
# anybody looked."
#
# So the usual preference — a patch that leaves every check running names which
# check noticed — does not apply here. This patch attacks the PREMISE, and a
# suite with a real guard in front of its premise cannot both stop and carry
# on. The stop is the evidence.
#
# Reddens: list-statuses-seeded: "the starter list has a status pipeline"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "      if (starterList) await seedListStatuses(tx, starterList.id)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("workspaces.service.ts: a new workspace's starter list is status-less again.")
