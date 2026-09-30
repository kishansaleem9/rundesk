# THE TASK MENU HAS NO "ADD TO" AGAIN.
#
# `ledger-rows/row-845`. ClickUp's task menu has "+ Add to", whose Personal
# Priorities entry lets you "search or select a user". Without it the menu
# reaches nobody's priorities, and assigning or the Priority field are the only
# ways in.
#
# TWO CHECKS: the people offered there, and the add behind them.
#
# Reddens: assign-to-priorities: "the task menu's Add to › Personal Priorities offers you first, then your colleagues"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                        <DropdownMenuSubTrigger data-testid=\"task-menu-add-to\">\n"
b = "                        <DropdownMenuSubTrigger data-testid=\"task-menu-add-to\" disabled>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-38-the-menu-has-no-add-to: Add to cannot be opened')
