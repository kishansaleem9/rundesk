# `create_list` REPORTS without WRITING: the executor synthesises the row the
# panel reads — right id shape, right name, right `Space > List` path — and
# never calls `ListsService.createList`. This is the facade with a model on top
# that `ai-containers.ts` was split in half to make catchable: the transcript
# says a list was made, and Postgres holds nothing.
# Reddens: create-menu-ai: "\"<name>\" really exists in this run's own space — the button created something"
import io

p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    let created: { id: string; name: string } | undefined\n    try {"
b = "    let created: { id: string; name: string } | undefined = { id: projectId, name }\n    if (String(name) === '\\u0000') try {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: create_list answers ok without ever writing a row.')
