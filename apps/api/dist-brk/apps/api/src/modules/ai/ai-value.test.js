"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_value_1 = require("./ai-value");
/**
 * §V2-11 — the arithmetic behind "Time Saved" and "Human Cost Savings".
 *
 * These checks are about honesty rather than about maths. The panel produces a
 * number somebody will put in a business case, so the things worth pinning are:
 * that a losing workspace is shown as losing, that zero states do not render as
 * NaN, and that the benchmark cannot be set to a value that discredits the
 * output.
 */
const BENCH = { minutesSavedPerRun: 6, hourlyRateCents: 5000 };
(0, node_test_1.test)('the worked example, end to end', () => {
    // 100 runs × 6 min = 600 min = 10h; 10h × $50 = $500; minus $12 spent.
    const v = (0, ai_value_1.summariseValue)(100, 12, BENCH);
    strict_1.default.equal(v.runs, 100);
    strict_1.default.equal(v.minutesSaved, 600);
    strict_1.default.equal(v.laborValueUsd, 500);
    strict_1.default.equal(v.costUsd, 12);
    strict_1.default.equal(v.netValueUsd, 488);
});
(0, node_test_1.test)('a workspace that is LOSING is shown as losing', () => {
    // The check this module exists for. Clamping at zero would turn the panel
    // into marketing: expensive usage against an honest benchmark must be able
    // to come out negative, or the number means nothing.
    const v = (0, ai_value_1.summariseValue)(2, 90, BENCH);
    strict_1.default.equal(v.minutesSaved, 12);
    strict_1.default.equal(v.laborValueUsd, 10);
    strict_1.default.ok(v.netValueUsd < 0, `netValueUsd was ${v.netValueUsd}`);
    strict_1.default.equal(v.netValueUsd, -80);
});
(0, node_test_1.test)('the benchmark is echoed back, so the surface can show its working', () => {
    // A conclusion without its inputs is a number people cannot argue with, and
    // this one deserves arguing with.
    const v = (0, ai_value_1.summariseValue)(10, 1, BENCH);
    strict_1.default.deepEqual(v.benchmark, BENCH);
});
(0, node_test_1.test)('a workspace that has never used AI reads as zero, not as NaN', () => {
    const v = (0, ai_value_1.summariseValue)(0, 0, BENCH);
    strict_1.default.equal(v.runs, 0);
    strict_1.default.equal(v.minutesSaved, 0);
    strict_1.default.equal(v.laborValueUsd, 0);
    strict_1.default.equal(v.netValueUsd, 0);
});
(0, node_test_1.test)('a benchmark of zero is a real answer and divides by nothing', () => {
    // "We think a run saves nothing" is a legitimate position, and the panel has
    // to survive it rather than render $NaN.
    const v = (0, ai_value_1.summariseValue)(100, 5, { minutesSavedPerRun: 0, hourlyRateCents: 0 });
    strict_1.default.equal(v.minutesSaved, 0);
    strict_1.default.equal(v.laborValueUsd, 0);
    strict_1.default.equal(v.netValueUsd, -5);
});
(0, node_test_1.test)('nonsense inputs do not become nonsense output', () => {
    const v = (0, ai_value_1.summariseValue)(Number.NaN, Number.NaN, { minutesSavedPerRun: Number.NaN, hourlyRateCents: Number.NaN });
    strict_1.default.equal(v.runs, 0);
    strict_1.default.equal(v.laborValueUsd, 0);
    strict_1.default.equal(v.netValueUsd, 0);
    strict_1.default.ok(!Number.isNaN(v.netValueUsd));
});
(0, node_test_1.test)('money is rounded to the cent, not left at float precision', () => {
    // 7 runs × 6 min = 42 min; 42/60 × $33.33 = $23.331
    const v = (0, ai_value_1.summariseValue)(7, 0, { minutesSavedPerRun: 6, hourlyRateCents: 3333 });
    strict_1.default.equal(v.laborValueUsd, 23.33);
});
(0, node_test_1.test)('durations read the way somebody would say them', () => {
    strict_1.default.equal((0, ai_value_1.formatMinutes)(0), '0m');
    strict_1.default.equal((0, ai_value_1.formatMinutes)(45), '45m');
    strict_1.default.equal((0, ai_value_1.formatMinutes)(60), '1h');
    strict_1.default.equal((0, ai_value_1.formatMinutes)(200), '3h 20m');
    // Not "3.33 hours", which is a number nobody says out loud.
    strict_1.default.ok(!(0, ai_value_1.formatMinutes)(200).includes('.'));
    strict_1.default.equal((0, ai_value_1.formatMinutes)(-5), '0m');
});
(0, node_test_1.test)('a benchmark that would discredit the panel is refused', () => {
    strict_1.default.equal((0, ai_value_1.validateBenchmark)({ minutesSavedPerRun: 6, hourlyRateCents: 5000 }), null);
    strict_1.default.ok((0, ai_value_1.validateBenchmark)({ minutesSavedPerRun: ai_value_1.MAX_MINUTES_PER_RUN + 1 }));
    strict_1.default.ok((0, ai_value_1.validateBenchmark)({ minutesSavedPerRun: -1 }));
    strict_1.default.ok((0, ai_value_1.validateBenchmark)({ minutesSavedPerRun: 1.5 }));
    strict_1.default.ok((0, ai_value_1.validateBenchmark)({ hourlyRateCents: ai_value_1.MAX_HOURLY_RATE_CENTS + 1 }));
    strict_1.default.ok((0, ai_value_1.validateBenchmark)({ hourlyRateCents: -1 }));
});
(0, node_test_1.test)('zero is allowed at both ends, because both are real positions', () => {
    strict_1.default.equal((0, ai_value_1.validateBenchmark)({ minutesSavedPerRun: 0, hourlyRateCents: 0 }), null);
});
(0, node_test_1.test)('a partial benchmark validates only what it carries', () => {
    // The surface edits one field at a time; requiring both would make changing
    // the rate also re-assert the minutes.
    strict_1.default.equal((0, ai_value_1.validateBenchmark)({ hourlyRateCents: 7500 }), null);
    strict_1.default.equal((0, ai_value_1.validateBenchmark)({}), null);
});
//# sourceMappingURL=ai-value.test.js.map