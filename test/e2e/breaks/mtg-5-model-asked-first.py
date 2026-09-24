# THE MODEL IS ASKED BEFORE THE DESTINATION IS CHECKED: a refused list still costs a model call.
# Reddens: unit: meeting-task-provenance.test.ts "asks the model nothing, and makes nothing, when the list is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    if (opts.createIn) await this.assertCanMakeTasksIn(workspaceId, opts.createIn, userId)\n    const source = (meeting.notes ?? '').trim() || (meeting.transcript ?? '').trim()\n    if (!source) throw new BadRequestException('This meeting has no notes or transcript to read')\n    if (!this.ai.isAvailable()) throw new BadRequestException('AI features are not configured')\n\n    const extracted = await this.ai.extractTasksFromNotes(source, { userId, workspaceId })\n"
b = "    const source = (meeting.notes ?? '').trim() || (meeting.transcript ?? '').trim()\n    if (!source) throw new BadRequestException('This meeting has no notes or transcript to read')\n    if (!this.ai.isAvailable()) throw new BadRequestException('AI features are not configured')\n\n    const extracted = await this.ai.extractTasksFromNotes(source, { userId, workspaceId })\n    if (opts.createIn) await this.assertCanMakeTasksIn(workspaceId, opts.createIn, userId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mtg-5-model-asked-first: applied")
