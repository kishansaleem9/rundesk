# The list is created ONE SPACE OVER: `createContainer` resolves the default
# container of some other space in the workspace, so `/ai/command/execute` still
# reports `succeeded` with the right name and the right path, and the row lands
# somewhere the person never asked for. `ai-containers.ts` names this exact
# risk — "a container created in the wrong space is harder to notice than one
# that was not created at all" — and this is the check that notices.
# Reddens: create-menu-ai: "\"<name>\" really exists in this run's own space — the button created something"
import io

p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    const projectId = await this.lists.defaultContainerForSpace(space.id, actorId)"
b = (
  "    const [elsewhere] = await this.db\n"
  "      .select({ id: spaces.id })\n"
  "      .from(spaces)\n"
  "      .where(and(eq(spaces.workspaceId, space.workspaceId), ne(spaces.id, space.id)))\n"
  "      .limit(1)\n"
  "    const projectId = await this.lists.defaultContainerForSpace(elsewhere?.id ?? space.id, actorId)"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: create_list writes into a different space and still reports success.')
