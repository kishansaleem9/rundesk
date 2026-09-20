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
var R2Service_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.R2Service = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let R2Service = R2Service_1 = class R2Service {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(R2Service_1.name);
        const accountId = this.config.get('R2_ACCOUNT_ID');
        const accessKeyId = this.config.get('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY');
        const bucketName = this.config.get('R2_BUCKET_NAME');
        const endpoint = this.config.get('R2_ENDPOINT') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
        this.publicUrl = this.config.get('R2_PUBLIC_URL') ?? null;
        this.bucketName = bucketName ?? null;
        if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
            this.client = null;
            this.logger.warn('R2 is not fully configured. File and clip uploads are disabled.');
            return;
        }
        this.client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey },
        });
    }
    get configured() {
        return !!this.client && !!this.bucketName;
    }
    requireConfigured() {
        if (!this.client || !this.bucketName) {
            throw new common_1.InternalServerErrorException('Storage is not configured');
        }
    }
    async presignPutObject(key, contentType, metadata = {}, expiresInSeconds = 900) {
        this.requireConfigured();
        const cmd = new client_s3_1.PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ContentType: contentType,
            Metadata: metadata,
        });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, cmd, { expiresIn: expiresInSeconds });
    }
    /**
     * Direct server-side upload — used when we can't go through a presigned
     * URL (e.g. attachments arriving via the inbound-email webhook are
     * pre-decoded by the email provider, so the API has the bytes in hand).
     */
    async putObject(key, body, contentType, metadata = {}) {
        this.requireConfigured();
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: body,
            ContentType: contentType,
            Metadata: metadata,
        }));
    }
    /**
     * Fetch an object's raw bytes server-side. Used when the API needs the
     * content itself (not a browser download URL) — e.g. the §15.1 knowledge
     * indexer extracting text from a text attachment. Returns a Buffer; callers
     * decide how to decode. Throws if storage is unconfigured or the key is
     * missing (callers that must not fail wrap this in try/catch).
     */
    async getObject(key) {
        this.requireConfigured();
        const res = await this.client.send(new client_s3_1.GetObjectCommand({ Bucket: this.bucketName, Key: key }));
        const body = res.Body;
        if (!body)
            return Buffer.alloc(0);
        // AWS SDK v3 streams expose transformToByteArray() in Node and browsers.
        const bytes = await body.transformToByteArray();
        return Buffer.from(bytes);
    }
    async getObjectUrl(key, expiresInSeconds = 900) {
        this.requireConfigured();
        if (this.publicUrl) {
            const normalized = this.publicUrl.replace(/\/$/, '');
            // Only use direct public URL mode for true public/CDN domains.
            // Raw R2 S3 endpoints usually require signed requests and can return 400/403 on browser GET.
            const looksLikeRawR2Api = /r2\.cloudflarestorage\.com/i.test(normalized);
            if (!looksLikeRawR2Api) {
                return `${normalized}/${key}`;
            }
        }
        const cmd = new client_s3_1.GetObjectCommand({ Bucket: this.bucketName, Key: key });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, cmd, { expiresIn: expiresInSeconds });
    }
    async deleteObject(key) {
        this.requireConfigured();
        await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
    }
    async headObject(key) {
        this.requireConfigured();
        return this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.bucketName, Key: key }));
    }
    async listObjects(prefix, maxKeys = 1000) {
        this.requireConfigured();
        return this.client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
            MaxKeys: maxKeys,
        }));
    }
};
exports.R2Service = R2Service;
exports.R2Service = R2Service = R2Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], R2Service);
//# sourceMappingURL=r2.service.js.map