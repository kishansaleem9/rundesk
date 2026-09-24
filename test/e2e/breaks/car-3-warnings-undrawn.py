# A PLAN'S WARNINGS ARE NOT DRAWN AGAIN, though the type carries them.
# Reddens: create-ai-results: "the plan’s warning is shown with it"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          {(plan.warnings ?? []).map((warning, i) => (\n'
b = '          {([] as string[]).map((warning, i) => (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("car-3-warnings-undrawn: applied")
