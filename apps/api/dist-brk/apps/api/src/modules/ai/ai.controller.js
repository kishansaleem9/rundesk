"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ai_service_1 = require("./ai.service");
const skills_service_1 = require("../skills/skills.service");
const model_tiers_1 = require("./model-tiers");
const briefing_service_1 = require("./briefing.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const not_guest_guard_1 = require("../../common/guards/not-guest.guard");
const plan_feature_guard_1 = require("../plans/plan-feature.guard");
const require_plan_decorator_1 = require("../plans/require-plan.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const knowledge_1 = require("./knowledge");
let AiController = class AiController {
    constructor(ai, briefings, skills) {
        this.ai = ai;
        this.briefings = briefings;
        this.skills = skills;
    }
    /**
     * §V2-S18, frame `[17:16]` — what the composer's picker is allowed to offer.
     *
     * TWO LISTS, NOT ONE LIST WITH A FLAG. `models` is what this server can
     * actually route to; `unavailable` is what the frame names and this product
     * has no client for. They are separate shapes so no rewrite of the picker can
     * accidentally hand an unroutable id to `modelForTier` — the unroutable shape
     * has no field to put a model in.
     *
     * The unavailable entries carry a translation KEY, not a sentence: this is
     * read by a person in four locales.
     */
    models() {
        return { models: model_tiers_1.MODEL_TIERS, unavailable: model_tiers_1.UNROUTABLE_PROVIDERS };
    }
    /**
     * §V2-S18 `[17:28]`–`[17:32]` — "apna [preferred] AI bhi set down karna hai."
     *
     * The preference was `localStorage` only (`rundesk.aiTier`), which is a
     * per-browser habit rather than a setting: it did not follow anybody to a
     * second machine. It is a row now, per person per workspace.
     */
    modelPreference(user, workspaceId) {
        return this.ai.modelPreference(user.id, workspaceId);
    }
    setModelPreference(user, workspaceId, body) {
        // Refused rather than coerced when it is not a routable tier — see
        // `setModelPreference`. A stored "gemini" nothing can run is worse than
        // refusing the write.
        return this.ai.setModelPreference(user.id, workspaceId, body?.preferredTier ?? '');
    }
    status() {
        return { available: this.ai.isAvailable() };
    }
    /**
     * §V2-11, frames `19:00`/`19:05` — what the AI was worth, beside what it cost.
     */
    value(user, workspaceId, from, to) {
        const parse = (s) => {
            if (!s)
                return undefined;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? undefined : d;
        };
        return this.ai.valueSummary({
            workspaceId,
            from: parse(from),
            to: parse(to),
            actor: { id: user.id, role: user.role },
        });
    }
    /** §V2-11 — "Edit benchmark", frame `19:00`. Admin-only. */
    updateBenchmark(user, workspaceId, body) {
        return this.ai.updateValueBenchmark(workspaceId, { id: user.id, role: user.role }, body);
    }
    /**
     * §V2-11, frame `19:05` — the Activity log, one row per AI run.
     *
     * The frame's filter row is `Date run ▾ · Status ▾ · My agents · Agent ▾`.
     *
     * `userId` HAS BEEN ACCEPTED HERE SINCE THIS ENDPOINT WAS WRITTEN and the web
     * client never sent it, so the "mine only" toggle re-rendered and asked the
     * server for exactly the same rows — a UI-only build, and a live defect
     * rather than a missing feature. The client sends it now.
     *
     * `status` is new, and could not have existed before migration 0150: nothing
     * wrote a failed run, so the filter would have had one reachable value.
     *
     * The frame's "Agent" filter still has no counterpart, on purpose. Rundesk
     * has no agents, and a filter that can only ever return everything is a
     * control that lies about what it does.
     */
    activity(user, workspaceId, from, to, feature, userId, status, limit) {
        const parse = (s) => {
            if (!s)
                return undefined;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? undefined : d;
        };
        /*
         * An unrecognised status is dropped rather than passed through. Passed
         * through it matches nothing, and an empty list is how somebody concludes
         * they have no failed runs when what they actually have is a typo in a
         * query string.
         */
        const runStatus = status === 'succeeded' || status === 'failed' ? status : undefined;
        return this.ai.runLog({
            workspaceId,
            actor: { id: user.id, role: user.role },
            from: parse(from),
            to: parse(to),
            feature: feature || undefined,
            userId: userId || undefined,
            status: runStatus,
            limit: limit ? Number(limit) : undefined,
        });
    }
    usage(user, workspaceId, from, to) {
        const parse = (s) => {
            if (!s)
                return undefined;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? undefined : d;
        };
        return this.ai.usageSummary({
            workspaceId,
            from: parse(from),
            to: parse(to),
            actor: { id: user.id, role: user.role },
        });
    }
    briefing(user) {
        // Always answers: generateBriefing falls back to the deterministic template
        // when no model is configured, so a run-now never dead-ends on a 503.
        return this.briefings.generateNow(user.id);
    }
    async generateTask(user, body) {
        await this.ai.assertAvailable('task.generate', { userId: user.id, workspaceId: body.workspaceId });
        return this.ai.generateTask(body.prompt, body.context, { userId: user.id, workspaceId: body.workspaceId }, body.customFields);
    }
    async suggestPriority(user, body) {
        await this.ai.assertAvailable('task.priority', { userId: user.id, workspaceId: body.workspaceId });
        return this.ai.suggestPriority(body.title, body.description, { userId: user.id, workspaceId: body.workspaceId });
    }
    async suggestDeadline(user, body) {
        await this.ai.assertAvailable('task.deadline', { userId: user.id, workspaceId: body.workspaceId });
        // Factor in current team workload (Plan §7.4). Prefer a client-supplied
        // signal; otherwise enrich server-side from the task's assignees' open-task
        // counts (access-checked, like the summarize taskId path).
        let teamWorkload = body.teamWorkload;
        if (!teamWorkload && body.taskId) {
            await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id);
            teamWorkload = await this.ai.buildTeamWorkloadSignal(body.taskId);
        }
        return this.ai.suggestDeadline(body.title, body.description, teamWorkload, {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
    }
    async automationSuggestions(user, body) {
        if (!body?.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Gate on workspace membership (the controller isn't workspace-scoped), then
        // return best-effort suggestions — the service never throws on AI failure.
        await this.ai.assertWorkspaceMember(body.workspaceId, user.id);
        return this.ai.suggestAutomations(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId });
    }
    async summarize(user, body) {
        await this.ai.assertAvailable('summarize', { userId: user.id, workspaceId: body.workspaceId });
        // When a taskId is provided, enrich the input server-side (Plan §7.5) with
        // recent activity, open subtasks, open blockers, and recent comments — but
        // first assert the caller can access that task's workspace (Plan §7.5 hardening).
        if (body.taskId)
            await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id);
        const content = body.taskId ? await this.ai.buildTaskSummaryInput(body.taskId) : body.content ?? '';
        const summary = await this.ai.summarize(content, body.type ?? 'task', {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
        return { summary };
    }
    async summarizeStream(user, body, res) {
        if (!this.ai.isAvailable()) {
            // §V2-11 — recorded before the 503, like `assertAvailable`. This route
            // owns its own response (it streams), so it sends rather than throws.
            await this.ai.recordFailure('summarize', 'none', { userId: user.id, workspaceId: body.workspaceId }, 'not_configured', 'AI features are not configured');
            res.status(503).send({ error: 'AI features are not configured' });
            return;
        }
        // A task summary is enriched server-side from the task's recent activity,
        // open subtasks, blockers and comments; a project summary streams the
        // caller-provided report text (Plan §7.5). Assert task-workspace access
        // before reading a task by id (Plan §7.5 hardening).
        if (body.taskId)
            await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id);
        const content = body.taskId ? await this.ai.buildTaskSummaryInput(body.taskId) : body.content ?? '';
        await this.ai.summarizeStream(content, body.type ?? 'task', res, {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
    }
    async improveWriting(user, body) {
        await this.ai.assertAvailable('writing.improve', { userId: user.id, workspaceId: body.workspaceId });
        const improved = await this.ai.improveWriting(body.text, body.mode ?? 'improve', {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
        return { improved };
    }
    async extractFromNotes(user, body) {
        await this.ai.assertAvailable('meeting.notes', { userId: user.id, workspaceId: body.workspaceId });
        return this.ai.extractTasksFromNotes(body.notes, { userId: user.id, workspaceId: body.workspaceId });
    }
    async insights(user, body) {
        await this.ai.assertAvailable('insights', { userId: user.id, workspaceId: body.workspaceId });
        return this.ai.generateInsights(body.context ?? '', { userId: user.id, workspaceId: body.workspaceId });
    }
    async suggestLayout(user, body) {
        await this.ai.assertAvailable('dashboard.layout', { userId: user.id, workspaceId: body.workspaceId });
        return this.ai.suggestDashboardLayout(body.availableWidgets ?? [], body.context ?? '', {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
    }
    async chat(user, body, res) {
        if (!this.ai.isAvailable()) {
            // §V2-11 — recorded before the 503, like `assertAvailable`. This route
            // owns its own response (it streams), so it sends rather than throws.
            await this.ai.recordFailure('chat', 'none', { userId: user.id, workspaceId: body.workspaceId }, 'not_configured', 'AI features are not configured');
            res.status(503).send({ error: 'AI features are not configured' });
            return;
        }
        /*
         * G13-10 [18:33–18:36] — say what is being read, while it is being read.
         *
         * Her frames show a status with the retrieval steps streaming beneath it
         * before any answer appears: "Checking what you're working on", "Checking
         * the latest Skills basics". Ours showed a blinking caret, so a turn that
         * spends several seconds inspecting a real workspace looked identical to
         * one doing nothing — and seeing that it read your actual data is the
         * whole trust signal.
         *
         * The stream opens HERE rather than inside chatStream, because the work
         * worth reporting happens before the model is called. Each step is written
         * immediately before the operation it names, so the trace is a record of
         * work rather than decoration: skip buildWorkspaceContext and its line
         * never appears.
         */
        /*
         * §15 — resolved BEFORE the stream opens, and that ordering is the point.
         *
         * The skill is resolved through SkillsService rather than by reading the
         * row here: the service owns the visibility filter and the enabled check,
         * so going through it is what stops a caller invoking a skill they cannot
         * see, or one its owner has switched off. A skillId without a workspaceId
         * is not resolvable at all — the id alone names nothing this endpoint may
         * open.
         *
         * This used to sit below, after the stream had been opened, and the
         * refusal had to go down the stream as an error frame because
         * `res.status().send()` throws once headers have flushed. It failed closed,
         * which was the important half — but the CALLER saw HTTP 201 and had to
         * read the body to discover it had been refused, which is not what a
         * status code is for. A deployed-app check asserting the 4xx read that 201
         * as "a disabled skill was accepted", and could not have read it any other
         * way.
         *
         * Resolving first costs one await before the first byte, only on a request
         * that names a skill, and lets the refusal be an ordinary 400/404 again.
         * The exception is left to propagate rather than caught: the service
         * already throws the right ones, and the headers have not been sent yet.
         */
        let skillPrompt;
        if (body.skillId && body.workspaceId) {
            const invocation = await this.skills.buildInvocationContext(body.workspaceId, user.id, body.skillId);
            skillPrompt = this.skills.renderSkillPrompt(invocation);
        }
        const stream = (0, ai_service_1.openSseStream)(res);
        const step = (name) => stream.write(`data: ${JSON.stringify({ step: name })}\n\n`);
        let context;
        if (body.workspaceId) {
            step('workspace');
            context = await this.ai.buildWorkspaceContext(body.workspaceId, user.id, {
                currentView: body.currentView,
            });
        }
        else {
            context = body.workspaceContext ?? '';
        }
        // The trace still names the skill, in the place it always appeared. It
        // reports work already done rather than announcing work about to start —
        // the one step here that does, because a refusal has to be answerable with
        // a status code and that has to happen before anything is written.
        if (skillPrompt)
            step('skill');
        await this.ai.chatStream(body.messages, context, res, { userId: user.id, workspaceId: body.workspaceId }, skillPrompt, body.tier, stream);
    }
    async suggestTasks(user, body) {
        if (!body?.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Gate on membership (controller isn't workspace-scoped); the service is
        // best-effort and never throws on AI failure.
        await this.ai.assertWorkspaceMember(body.workspaceId, user.id);
        return this.ai.suggestTasks({
            workspaceId: body.workspaceId,
            projectId: body.projectId,
            projectName: body.projectName,
            description: body.description,
        }, { userId: user.id, workspaceId: body.workspaceId });
    }
    async workloadBalance(user, body) {
        if (!body?.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.ai.assertWorkspaceMember(body.workspaceId, user.id);
        return this.ai.workloadBalance(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId });
    }
    async workloadBalanceExecute(user, body) {
        if (!body?.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Reassignment is a privileged action — managers/admins only.
        await this.ai.assertWorkspaceManager(body.workspaceId, user.id);
        return this.ai.executeWorkloadBalance(body.workspaceId, Array.isArray(body?.moves) ? body.moves : [], user.id);
    }
    async knowledge(user, body) {
        if (!body?.workspaceId || !body?.question?.trim()) {
            throw new common_1.HttpException('workspaceId and question are required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Gate on workspace membership (the controller isn't workspace-scoped);
        // retrieval further scopes to content the caller can access. Best-effort —
        // the service never throws on AI failure (deterministic search fallback).
        await this.ai.assertWorkspaceMember(body.workspaceId, user.id);
        const answer = await this.ai.answerKnowledge(body.workspaceId, user.id, body.question, {
            userId: user.id,
            workspaceId: body.workspaceId,
        });
        /*
         * §G02 — the thumbs come back WITH the answer.
         *
         * The palette caches an answer for five minutes and is torn down on every
         * close, so a rating fetched separately would be a second round trip that
         * usually arrives after the person has already looked away. Riding along
         * costs one indexed lookup and means a thumb that was pressed yesterday is
         * lit the moment the answer appears.
         */
        const feedback = await this.ai.getAnswerFeedback(body.workspaceId, user.id, body.question);
        return { ...answer, feedback };
    }
    async knowledgeFeedback(user, body) {
        if (!body?.workspaceId || !body?.question?.trim()) {
            throw new common_1.HttpException('workspaceId and question are required', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.ai.assertWorkspaceMember(body.workspaceId, user.id);
        const value = body.feedback;
        return this.ai.setAnswerFeedback(body.workspaceId, user.id, body.question, value === 'up' || value === 'down' ? value : null);
    }
    /*
     * The help library, served rather than restated.
     *
     * `answerHelp` cites its sources as `/app/help#help-<id>`, but the page hand
     * wrote four cards out of ten topics — so for the other six the assistant
     * cited an anchor that did not exist, and clicking it did nothing at all.
     * The page now renders one card per topic from this list, which is the only
     * arrangement in which a citation cannot point at nothing.
     *
     * Keywords are deliberately not returned: they are matching fuel for the
     * fallback, not something to show anybody.
     */
    helpTopics() {
        return knowledge_1.HELP_TOPICS.map(({ id, question, answer }) => ({ id, question, answer }));
    }
    async help(user, body) {
        if (!body?.question?.trim()) {
            throw new common_1.HttpException('question is required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Help is product-wide (no workspace) — the PlanFeatureGuard is a no-op
        // without a workspaceId. Best-effort: always answers via the FAQ fallback.
        return this.ai.answerHelp(body.question, { userId: user.id });
    }
    async proposeSkill(user, body, res) {
        if (!body.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        const request = (body.request ?? '').trim();
        if (!request) {
            throw new common_1.HttpException('Say what the skill should do', common_1.HttpStatus.BAD_REQUEST);
        }
        // Streamed, because the steps are the point: frame `t1138` shows "Mapping
        // your task habits" and "Checking task-organizing best practices" arriving
        // *before* the answer. Collecting them and sending the lot at the end would
        // render the same words with none of the meaning — the person would learn
        // what was read only after they had already been shown the conclusion.
        //
        // Same Fastify hijack as chatStream: reply.raw is the Node response.
        const reply = res;
        if (typeof reply.hijack === 'function')
            reply.hijack();
        const raw = reply.raw ?? reply;
        raw.setHeader('Content-Type', 'text/event-stream');
        raw.setHeader('Cache-Control', 'no-cache');
        raw.setHeader('Connection', 'keep-alive');
        raw.flushHeaders?.();
        try {
            // Deliberately NOT gated on isAvailable(): the proposer has a real
            // deterministic draft for an instance with no key, and it says so in its
            // own rationale rather than pretending it read the workspace.
            const result = await this.ai.proposeSkill(body.workspaceId, user.id, request, { userId: user.id, workspaceId: body.workspaceId }, (step) => raw.write(`data: ${JSON.stringify({ step })}\n\n`));
            raw.write(`data: ${JSON.stringify(result)}\n\n`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not draft a skill';
            raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
        finally {
            raw.write('data: [DONE]\n\n');
            raw.end();
        }
    }
    async mineSkills(user, body, res) {
        if (!body.workspaceId) {
            throw new common_1.HttpException('workspaceId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        // Streamed for the same reason as the drafter: the scans are the claim, so
        // they arrive before the conclusion rather than alongside it.
        const reply = res;
        if (typeof reply.hijack === 'function')
            reply.hijack();
        const raw = reply.raw ?? reply;
        raw.setHeader('Content-Type', 'text/event-stream');
        raw.setHeader('Cache-Control', 'no-cache');
        raw.setHeader('Connection', 'keep-alive');
        raw.flushHeaders?.();
        try {
            const result = await this.ai.mineSkills(body.workspaceId, user.id, { userId: user.id, workspaceId: body.workspaceId }, (step) => raw.write(`data: ${JSON.stringify({ step })}\n\n`));
            raw.write(`data: ${JSON.stringify(result)}\n\n`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not scan your work';
            raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
        finally {
            raw.write('data: [DONE]\n\n');
            raw.end();
        }
    }
    async command(user, body) {
        await this.ai.assertAvailable('command', { userId: user.id, workspaceId: body.workspaceId });
        if (!body?.workspaceId || !body?.message?.trim()) {
            throw new common_1.HttpException('workspaceId and message are required', common_1.HttpStatus.BAD_REQUEST);
        }
        return this.ai.command(body.workspaceId, body.message, { userId: user.id, workspaceId: body.workspaceId });
    }
    async commandExecute(user, body) {
        // No model call — pure task mutations via TasksService, each access-checked.
        return this.ai.executeActions(Array.isArray(body?.actions) ? body.actions : [], user.id);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — the tiers the composer offers, and the ones it cannot' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "models", null);
__decorate([
    (0, common_1.Get)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: 'The signed-in person’s preferred model tier for this workspace' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "modelPreference", null);
__decorate([
    (0, common_1.Put)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: 'Set the preferred model tier for this workspace' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "setModelPreference", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: 'Check if AI features are available' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('value'),
    (0, swagger_1.ApiOperation)({ summary: 'AI value: runs, estimated time saved and its labour value' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "value", null);
__decorate([
    (0, common_1.Patch)('value/benchmark'),
    (0, swagger_1.ApiOperation)({ summary: 'Set the minutes-saved-per-run and hourly rate the value panel reasons from' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "updateBenchmark", null);
__decorate([
    (0, common_1.Get)('activity'),
    (0, swagger_1.ApiOperation)({ summary: 'Individual AI runs, newest first' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('feature')),
    __param(5, (0, common_1.Query)('userId')),
    __param(6, (0, common_1.Query)('status')),
    __param(7, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)('usage'),
    (0, swagger_1.ApiOperation)({ summary: 'AI usage + estimated cost per user / per model' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "usage", null);
__decorate([
    (0, common_1.Post)('briefing'),
    (0, swagger_1.ApiOperation)({ summary: "Generate the caller's daily briefing now (§7.11 on demand)" }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "briefing", null);
__decorate([
    (0, common_1.Post)('task/generate'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate a task from a natural language prompt' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateTask", null);
__decorate([
    (0, common_1.Post)('task/priority'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest priority for a task' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "suggestPriority", null);
__decorate([
    (0, common_1.Post)('task/deadline'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest a deadline for a task (factors in current team workload)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "suggestDeadline", null);
__decorate([
    (0, common_1.Post)('automation-suggestions'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest automation rules from recent workspace behavior (AI, with deterministic fallback)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "automationSuggestions", null);
__decorate([
    (0, common_1.Post)('summarize'),
    (0, swagger_1.ApiOperation)({ summary: 'Summarize a task or project' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "summarize", null);
__decorate([
    (0, common_1.Post)('summarize/stream'),
    (0, swagger_1.ApiOperation)({ summary: 'Summarize a task or project (streaming SSE)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "summarizeStream", null);
__decorate([
    (0, common_1.Post)('writing/improve'),
    (0, swagger_1.ApiOperation)({ summary: 'Improve writing with AI' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "improveWriting", null);
__decorate([
    (0, common_1.Post)('meeting-notes'),
    (0, swagger_1.ApiOperation)({ summary: 'Extract action items from meeting notes' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "extractFromNotes", null);
__decorate([
    (0, common_1.Post)('insights'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate AI insights from real workspace metrics' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "insights", null);
__decorate([
    (0, common_1.Post)('dashboard/suggest-layout'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest a dashboard widget layout with AI' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "suggestLayout", null);
__decorate([
    (0, common_1.Post)('chat'),
    (0, swagger_1.ApiOperation)({ summary: 'Chat with AI assistant (streaming SSE)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('suggest-tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest a task list for a project by learning from similar projects (AI, deterministic fallback)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "suggestTasks", null);
__decorate([
    (0, common_1.Post)('workload-balance'),
    (0, swagger_1.ApiOperation)({ summary: 'Suggest workload redistribution from real per-assignee load (AI, deterministic fallback)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "workloadBalance", null);
__decorate([
    (0, common_1.Post)('workload-balance/execute'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute confirmed workload moves (manager/admin only; reassigns via TasksService)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "workloadBalanceExecute", null);
__decorate([
    (0, common_1.Post)('knowledge'),
    (0, swagger_1.ApiOperation)({ summary: 'Ask the workspace knowledge base (retrieval over accessible content; deterministic fallback)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "knowledge", null);
__decorate([
    (0, common_1.Patch)('knowledge/feedback'),
    (0, swagger_1.ApiOperation)({ summary: '§G02 — thumbs up / down on a palette answer; the same one again clears it' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "knowledgeFeedback", null);
__decorate([
    (0, common_1.Get)('help/topics'),
    (0, swagger_1.ApiOperation)({ summary: 'The curated help topics the assistant answers from, for the help library' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "helpTopics", null);
__decorate([
    (0, common_1.Post)('help'),
    (0, swagger_1.ApiOperation)({ summary: 'Ask the AI help assistant (grounded in the curated FAQ; deterministic keyword fallback)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "help", null);
__decorate([
    (0, common_1.Post)('skills/propose'),
    (0, swagger_1.ApiOperation)({
        summary: '§15 — draft a skill from a sentence (SSE; proposal only, nothing is written)',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "proposeSkill", null);
__decorate([
    (0, common_1.Post)('skills/mine'),
    (0, swagger_1.ApiOperation)({
        summary: '§15 Skills Miner — scan real work for repeated workflows (SSE; writes nothing)',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "mineSkills", null);
__decorate([
    (0, common_1.Post)('command'),
    (0, swagger_1.ApiOperation)({ summary: 'Plan a natural-language command via tool use (preview, nothing mutates)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "command", null);
__decorate([
    (0, common_1.Post)('command/execute'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute confirmed command actions (per-action, access-checked)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "commandExecute", null);
exports.AiController = AiController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, swagger_1.ApiBearerAuth)()
    // Plan §14.1: gate the whole AI surface on the workspace's plan `ai` feature.
    // The guard resolves the workspaceId from the request body/query/param; when a
    // gated request carries a workspaceId whose plan lacks AI it 403s, otherwise it's
    // a no-op — and always a no-op for enterprise (every existing workspace).
    ,
    (0, require_plan_decorator_1.RequirePlan)('ai'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, not_guest_guard_1.NotGuestGuard, plan_feature_guard_1.PlanFeatureGuard),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        briefing_service_1.BriefingService,
        skills_service_1.SkillsService])
], AiController);
//# sourceMappingURL=ai.controller.js.map