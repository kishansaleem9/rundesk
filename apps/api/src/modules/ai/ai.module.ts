import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { BriefingService } from './briefing.service'
import { WorkloadAlertService } from './workload-alert.service'
import { EmbeddingService } from './embedding.service'
import { KnowledgeIndexerService } from './knowledge-indexer.service'
import { AiController } from './ai.controller'
import { ChatThreadsService } from './chat-threads.service'
import { ChatThreadsController } from './chat-threads.controller'
import { KnowledgeController } from './knowledge.controller'
import { TasksModule } from '../tasks/tasks.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlansModule } from '../plans/plans.module'
import { SearchModule } from '../search/search.module'
import { SkillsModule } from '../skills/skills.module'
import { DocsModule } from '../docs/docs.module'

@Module({
  // NotificationsModule supplies NotificationsService for briefing + workload
  // alert delivery (§7.11/§7.12). AiModule already depends on it transitively via
  // TasksModule and Notifications imports neither Ai nor Tasks, so no cycle.
  // PlansModule supplies PlanFeatureGuard + PlansService for the §14.1 AI gate.
  // SearchModule supplies SearchService for §15.1 knowledge retrieval (it's
  // @Global, but importing it makes the dependency explicit).
  // SkillsModule supplies SkillsService so a chat turn can be answered *as* a
  // skill (§15) — the service also owns the visibility and enabled checks, so
  // resolving the skill through it is what stops a caller invoking one they
  // cannot see. Skills imports nothing from Ai, so no cycle.
  imports: [TasksModule, NotificationsModule, PlansModule, SearchModule, SkillsModule, DocsModule],
  controllers: [AiController, KnowledgeController, ChatThreadsController],
  // BriefingService owns the hourly @Cron that delivers daily briefings;
  // WorkloadAlertService owns the daily @Cron that alerts managers about
  // overloaded teammates (§7.12) — both must be provided here or their crons
  // never register. KnowledgeIndexerService owns the nightly @Cron that
  // re-embeds each workspace into the §15.1 semantic store; EmbeddingService is
  // the pluggable embedder (env-gated real API + deterministic local default)
  // used by both the indexer and AiService's knowledge retrieval.
  providers: [AiService, BriefingService, WorkloadAlertService, EmbeddingService, KnowledgeIndexerService, ChatThreadsService],
  exports: [AiService],
})
export class AiModule {}
