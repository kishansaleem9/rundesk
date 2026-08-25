import { createLazyFileRoute } from '@tanstack/react-router'
import { SkillsPage } from '../pages/workspace-skills-page'

export const Route = createLazyFileRoute('/app/$workspaceId/skills/')({
  component: SkillsPage,
})
