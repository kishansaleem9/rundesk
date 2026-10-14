# THE RULE’S COMMENT IS WRITTEN WITH ITS PLACEHOLDERS LEFT IN.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "on an urgent task tagged Client, the rule comments — its title filled in, under the rule’s maker — adds Mia as a watcher, and sets the due date three days out"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        const body = renderTemplate(template, await this.buildMessageVars(ctx)).trim()\n        if (!body) break\n        const authorId = await this.resolveChannelAuthor(ctx.workspaceId, authorHint)\n        if (!authorId) throw new Error('No eligible author for the automation’s comment')\n",
     "        const body = template.trim()\n        if (!body) break\n        const authorId = await this.resolveChannelAuthor(ctx.workspaceId, authorHint)\n        if (!authorId) throw new Error('No eligible author for the automation’s comment')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-5-comment-unfilled: THE RULE’S COMMENT IS WRITTEN WITH ITS PLACEHOLDERS LEFT IN.')
