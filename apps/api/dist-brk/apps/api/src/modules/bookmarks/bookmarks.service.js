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
var BookmarksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookmarksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * §G01-9 [00:35] — "save ClickUp items or any URL from around the web".
 *
 * The "any URL" half is what makes this its own thing rather than another
 * favourite, and it is also the half that needs care: a stored link is handed
 * back to a browser, so what may be stored is decided here and not at the point
 * it is clicked.
 */
let BookmarksService = BookmarksService_1 = class BookmarksService {
    constructor(db) {
        this.db = db;
    }
    async assertMember(workspaceId, userId) {
        const [row] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
    }
    /**
     * What may be saved.
     *
     * An in-app path, or an absolute http(s) URL. Everything else is refused —
     * `javascript:` most of all, because a bookmark is rendered as a link and
     * clicking one would run script on this origin. `data:` and `blob:` go the
     * same way for the same reason. Checked on the way IN so a row that exists is
     * a row that is safe to render, rather than leaving every future read path to
     * remember.
     */
    static normalizeUrl(raw) {
        const url = typeof raw === 'string' ? raw.trim() : '';
        if (!url)
            throw new common_1.BadRequestException('a bookmark needs a url');
        if (url.startsWith('/'))
            return url.slice(0, 2000);
        if (/^https?:\/\//i.test(url))
            return url.slice(0, 2000);
        throw new common_1.BadRequestException('a bookmark must be an in-app path or an http(s) url');
    }
    async list(workspaceId, userId) {
        await this.assertMember(workspaceId, userId);
        return this.db
            .select()
            .from(db_1.workspaceBookmarks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.workspaceBookmarks.position), (0, drizzle_orm_1.asc)(db_1.workspaceBookmarks.createdAt));
    }
    async create(workspaceId, userId, body) {
        await this.assertMember(workspaceId, userId);
        const url = BookmarksService_1.normalizeUrl(body?.url);
        /*
         * The URL stands in for a missing title rather than the row being refused.
         * Somebody pasting a link and pressing Add has said everything they meant
         * to; demanding a name as well is a second step for no gain.
         */
        const title = (body?.title ?? '').trim().slice(0, 200) || url;
        const [{ next }] = await this.db
            .select({ next: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.workspaceBookmarks.position}), -1) + 1` })
            .from(db_1.workspaceBookmarks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.userId, userId)));
        const [row] = await this.db
            .insert(db_1.workspaceBookmarks)
            .values({ workspaceId, userId, title, url, position: next })
            .returning();
        return row;
    }
    async remove(workspaceId, userId, bookmarkId) {
        await this.assertMember(workspaceId, userId);
        /*
         * Scoped by owner as well as id. Without the userId in the WHERE, knowing
         * somebody else's bookmark id would be enough to delete it — the id is the
         * only thing standing between the two people otherwise.
         */
        const deleted = await this.db
            .delete(db_1.workspaceBookmarks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.id, bookmarkId), (0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceBookmarks.userId, userId)))
            .returning({ id: db_1.workspaceBookmarks.id });
        if (deleted.length === 0)
            throw new common_1.NotFoundException('Bookmark not found');
        return { ok: true };
    }
};
exports.BookmarksService = BookmarksService;
exports.BookmarksService = BookmarksService = BookmarksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], BookmarksService);
//# sourceMappingURL=bookmarks.service.js.map