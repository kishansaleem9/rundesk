# AN AI ANSWER'S TASK CHIPS ASK THE SPACE AND THE PROJECT ONLY: a private list's task resolves.
# Reddens: private-list-reach: ", ) // ══ 8. AN AI ANSWER'S REFERENCES ═════════════════════════════════════════ console.log('\\n▶ an AI answer’s task and list chips') const refs = { workspaceId: WS, taskIds: [PT, OT], listIds: [PL, OL] } const [mRefs, aRefs] = await Promise.all([M('/ai/refs', { method: 'POST', body: refs }), A('/ai/refs', { method: 'POST', body: refs })]) chk( mRefs.status === 200 && !names(mRefs) && mRefs.text.includes(OT) && names(aRefs), 'an AI answer’s chips resolve nothing of the private list for the member — the open task resolves, and the admin’s resolve it',"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                inArray(tasks.id, taskIds),\n                taskInReachFilter(this.db, workspaceId, actorId, isManager),\n'
b = '                inArray(tasks.id, taskIds),\n                containerVisibilityFilter(this.db, actorId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-11-ai-chips-stop-at-the-project: applied")
