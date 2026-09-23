# LOGOS ARE NOT AMONG THE PUBLIC PICTURES: a saved logo address answers 404, and the logo is not drawn.
# Reddens: stable-images: "and the workspace logo from its own"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "export const PUBLIC_IMAGE_PREFIXES = ['avatars/', 'workspace-logos/'] as const\n"
b = "export const PUBLIC_IMAGE_PREFIXES = ['avatars/'] as const\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-8-logos-not-served: applied")
