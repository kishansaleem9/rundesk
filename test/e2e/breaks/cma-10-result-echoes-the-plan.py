# The result row prints the plan's own sentence, so it claims a container without ever reading one back.
# Reddens: create-menu-ai: "the result names the container the SERVER made"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                {r.container ? r.container.path : r.humanLabel} — {t(`quickCreate.aiStatus.${r.status}` as TranslationKey)}\n'
b = '                {r.humanLabel} — {t(`quickCreate.aiStatus.${r.status}` as TranslationKey)}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("quick-create-modal.tsx: The result row prints the plan's own sentence, so it claims a container without ever reading one back.")
