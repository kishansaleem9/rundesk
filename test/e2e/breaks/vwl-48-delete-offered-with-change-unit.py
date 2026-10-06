# DELETE IS OFFERED WHEREVER A CHANGE IS, at Edit too.
# Reddens: unit: view-write.test.ts "offers Delete at Full edit, and on a reader’s own private view, never at Edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "    mayDelete: viewWriteBar(view, actor, facts, 'delete') === null,\n"
b = '    mayDelete: mayChange,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-48-delete-offered-with-change-unit: delete is offered wherever a change is")
