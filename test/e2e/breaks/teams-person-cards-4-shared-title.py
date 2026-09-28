# One person's job title under everybody's name — the same shape as the facade,
# one field lower. "UI designer" would appear under all four people in the
# frame, and each card would still look right on its own.
# Reddens: teams-person-cards: "and it belongs to the person it was set on, not to everybody"
import io
p='/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s=io.open(p,encoding='utf-8').read()
a="        jobTitle: person.jobTitle ?? null,"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"        jobTitle: people[0]?.jobTitle ?? null,"))
