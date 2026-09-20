"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * §1.1 — every field the create DTO accepts has to reach the service.
 *
 * The POST /tasks handler builds its argument field by field rather than
 * spreading the body, which is the safe choice — it is why a client cannot
 * mass-assign columns. The cost is that adding a field to the DTO and honouring
 * it in the service is not enough: unless the field is also named in that
 * literal, it is accepted, validated, and dropped in between.
 *
 * That is exactly what happened to `taskTypeId`. The DTO took it, createTask
 * validated it against the list's workspace and wrote it, and choosing a type
 * at create time had never once worked on any deploy. Nothing errored. The task
 * simply came back with the workspace default.
 *
 * The deploy check missed it too, because it created its probe type with
 * isDefault:true — so the task picked that same type up as the default and the
 * assertion passed without the field ever crossing the wire.
 *
 * This compares the two lists directly, so the next field added to the DTO
 * cannot go missing quietly.
 */
function workspaceRoot(from) {
    let dir = from;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir)
            throw new Error('workspace root not found');
        dir = up;
    }
}
const repo = workspaceRoot(process.cwd());
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(repo, rel), 'utf8');
(0, node_test_1.describe)('POST /tasks forwards every field it accepts (§1.1)', () => {
    const dto = read('apps/api/src/modules/tasks/dto/task.dto.ts');
    const controller = read('apps/api/src/modules/tasks/tasks.controller.ts');
    const dtoFields = (() => {
        const body = dto.slice(dto.indexOf('export class CreateTaskDto'));
        return new Set([...body.slice(0, body.indexOf('\n}')).matchAll(/^ {2}(\w+)[?!]?:/gm)].map((m) => m[1]));
    })();
    const forwarded = (() => {
        const call = controller.slice(controller.indexOf('return this.tasks.createTask({'));
        return new Set([...call.slice(0, call.indexOf('})')).matchAll(/^\s+(\w+):/gm)].map((m) => m[1]));
    })();
    (0, node_test_1.it)('names every DTO field in the createTask call', () => {
        const dropped = [...dtoFields].filter((f) => !forwarded.has(f));
        strict_1.default.deepEqual(dropped, [], `accepted by the DTO and never passed on: ${dropped.join(', ')}`);
    });
    (0, node_test_1.it)('still forwards taskTypeId, the one this was written for', () => {
        strict_1.default.ok(forwarded.has('taskTypeId'));
        strict_1.default.ok(dtoFields.has('taskTypeId'));
    });
    (0, node_test_1.it)('and the deploy check uses a non-default type, or it proves nothing', () => {
        // A probe type created with isDefault:true is indistinguishable from the
        // field being dropped, because the task acquires it either way.
        const verify = read('deploy/verify-release.sh');
        const probe = verify.slice(verify.indexOf('"name":"Deploy check"'));
        strict_1.default.ok(!probe.slice(0, 120).includes('isDefault'), 'the probe type must not be the workspace default');
    });
});
//# sourceMappingURL=create-task-wiring.test.js.map