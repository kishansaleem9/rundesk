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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachRecordingDto = exports.CreateMeetingDto = void 0;
const class_validator_1 = require("class-validator");
/**
 * Create a meeting from a task (Plan §12.9 Zoom / Google Meet). The provider
 * is required — the server creates a real meeting through the workspace's
 * connected Zoom (own OAuth connection) or Google Meet (reuses the Google
 * Calendar connection) and stores the join URL as a task↔external link.
 */
const MEETING_PROVIDERS = ['zoom', 'google_meet'];
class CreateMeetingDto {
}
exports.CreateMeetingDto = CreateMeetingDto;
__decorate([
    (0, class_validator_1.IsIn)(MEETING_PROVIDERS),
    __metadata("design:type", Object)
], CreateMeetingDto.prototype, "provider", void 0);
/** Attach a post-meeting recording link to an existing meeting link. */
class AttachRecordingDto {
}
exports.AttachRecordingDto = AttachRecordingDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AttachRecordingDto.prototype, "url", void 0);
//# sourceMappingURL=meeting.dto.js.map