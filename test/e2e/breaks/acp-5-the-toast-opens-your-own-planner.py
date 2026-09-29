# THE TOAST'S "OPEN PRIORITIES" AFTER A TEAMMATE'S ADD OPENS YOUR OWN PLANNER.
#
# `ledger-rows/row-850`. The colleague's toast copies the link from yours:
# `/app/:ws/calendar`, the Planner, whose rail is YOUR priorities — where the
# task is not, because it went on the teammate's. "Added" with a link to
# somewhere it is not is the claim the toast exists to avoid ("'Added' with no
# way to look is a claim the reader has to take on trust").
#
# ONE CHECK: the panel the link should open, read for the row it added.
#
# Reddens: assign-to-priorities: "the toast's link opens their priorities, where the task says who added it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "              onClick: () => openPersonPanel(them.userId),\n"
b = "              onClick: () => navigate({ to: `/app/${workspaceId}/calendar` }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-5-the-toast-opens-your-own-planner: the teammate\'s toast links to your Planner')
