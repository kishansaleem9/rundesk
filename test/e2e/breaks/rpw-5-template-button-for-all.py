# "SAVE AS TEMPLATE" IS OFFERED TO ANYBODY AGAIN, a 403 for a member.
# Reddens: role-permissions-web: "\"Save as template\" is offered to a member only once a role grants template.manage"
import io
p = '/home/user/rundesk/apps/web/src/components/task-templates-section.tsx'
a = "  if (!workspaceId || can('template.manage') !== true) return null\n"
b = '  if (!workspaceId) return null\n  void can\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-5-template-button-for-all: Save as template is offered to anybody')
