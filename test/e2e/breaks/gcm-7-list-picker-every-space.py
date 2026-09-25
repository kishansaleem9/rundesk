# THE LIST FORM'S SPACE PICKER NAMES EVERY SPACE A GUEST CAN SEE AGAIN,
# and one they only pass through refuses the list.
# Reddens: guest-create-menu: "the List form offers the guest the space with Full edit and not the one they pass through — a member is offered both"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  }).data ?? []).filter((s) => CREATE_TYPES.some((ty) => ty.value === 'list' && creatable(ty, s.id)))\n"
b = "  }).data ?? []).filter((s) => s.id !== '')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-7-list-picker-every-space: the list form offers every space')
