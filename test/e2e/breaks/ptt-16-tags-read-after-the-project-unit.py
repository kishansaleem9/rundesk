# A SAVE READS THE PROJECT BEFORE IT LOOKS AT THE TAGS (`ledger-rows/row-1874`).
# The tags are cleaned where they are written, after the whole snapshot is read: a request
# the server was always going to refuse costs every read first.
# Reddens: unit: project-templates.service.test.ts "a save from a project with a tag past its bound is refused before the project is looked up"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a1 = ("    const tags = normalizeTemplateTags(dto.tags)\n"
      "    // The project, in this workspace, as the saver may open it.\n")
b1 = ("    // BROKEN: the tags are read after the project\n"
      "    // The project, in this workspace, as the saver may open it.\n")
a2 = ("        complexity: complexityOf(payload),\n"
      "        category: isCategory(dto.category) ? dto.category : null,\n"
      "        useCase: isUseCase(dto.useCase) ? dto.useCase : null,\n"
      "        tags,\n")
b2 = ("        complexity: complexityOf(payload),\n"
      "        category: isCategory(dto.category) ? dto.category : null,\n"
      "        useCase: isUseCase(dto.useCase) ? dto.useCase : null,\n"
      "        tags: normalizeTemplateTags(dto.tags),\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a1) == 1, f'anchor 1 appears {s.count(a1)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'anchor 2 appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a1, b1).replace(a2, b2))
print('ptt-16-tags-read-after-the-project-unit: a save reads the project before refusing its tags')
