import { createLazyFileRoute } from '@tanstack/react-router'
import { SkillDetailPage } from '../pages/workspace-skill-detail-page'

export const Route = createLazyFileRoute('/app/$workspaceId/skills/$skillId')({
  component: SkillDetailPage,
})
