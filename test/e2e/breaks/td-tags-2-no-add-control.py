# THE TASK SHEET OFFERS NO WAY TO ADD A TAG: the "+" is gone, and the tag box with it.
# The suite waits for the control to be drawn; this takes it away for good, so the wait runs out.
# Reddens: task-depth: "the task sheet offers a way to add a tag"
import io
p = '/home/user/rundesk/apps/web/src/components/task-tags.tsx'
a = '      <Popover open={open} onOpenChange={setOpen}>\n        <PopoverTrigger asChild>\n          <button\n            type="button"\n            data-testid="task-tag-add"\n'
b = '      <Popover open={open} onOpenChange={setOpen}>\n        <PopoverTrigger asChild>\n          <button\n            type="button"\n            hidden\n            data-testid="task-tag-add"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("td-tags-2-no-add-control: applied")
