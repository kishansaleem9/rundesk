"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const organizations_service_1 = require("./organizations.service");
const chain = (rows) => ({
    from: () => chain(rows),
    where: () => chain(rows),
    limit: () => chain(rows),
    then: (res, rej) => Promise.resolve(rows).then(res, rej),
});
(0, node_test_1.describe)('OrganizationsService.updateMemberRole', () => {
    (0, node_test_1.it)('rejects an invalid role', async () => {
        const svc = new organizations_service_1.OrganizationsService({});
        await strict_1.default.rejects(() => svc.updateMemberRole('org', 'u', 'hacker'), /Invalid role/);
    });
    (0, node_test_1.it)('rejects a non-owner granting the owner role', async () => {
        const db = { select: () => chain([{ role: 'admin' }]) }; // actor is admin, not owner
        const svc = new organizations_service_1.OrganizationsService(db);
        await strict_1.default.rejects(() => svc.updateMemberRole('org', 'u', 'owner', 'actor'), /Only an organization owner/);
    });
});
//# sourceMappingURL=organizations.service.test.js.map