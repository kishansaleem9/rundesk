import { ConfigService } from '@nestjs/config';
export declare class R2Service {
    private readonly config;
    private readonly logger;
    private readonly bucketName;
    private readonly publicUrl;
    private readonly client;
    constructor(config: ConfigService);
    get configured(): boolean;
    private requireConfigured;
    presignPutObject(key: string, contentType: string, metadata?: Record<string, string>, expiresInSeconds?: number): Promise<string>;
    /**
     * Direct server-side upload — used when we can't go through a presigned
     * URL (e.g. attachments arriving via the inbound-email webhook are
     * pre-decoded by the email provider, so the API has the bytes in hand).
     */
    putObject(key: string, body: Buffer | Uint8Array, contentType: string, metadata?: Record<string, string>): Promise<void>;
    /**
     * Fetch an object's raw bytes server-side. Used when the API needs the
     * content itself (not a browser download URL) — e.g. the §15.1 knowledge
     * indexer extracting text from a text attachment. Returns a Buffer; callers
     * decide how to decode. Throws if storage is unconfigured or the key is
     * missing (callers that must not fail wrap this in try/catch).
     */
    getObject(key: string): Promise<Buffer>;
    getObjectUrl(key: string, expiresInSeconds?: number): Promise<string>;
    deleteObject(key: string): Promise<void>;
    headObject(key: string): Promise<import("@aws-sdk/client-s3").HeadObjectCommandOutput>;
    listObjects(prefix: string, maxKeys?: number): Promise<import("@aws-sdk/client-s3").ListObjectsV2CommandOutput>;
}
