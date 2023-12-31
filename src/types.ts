import { KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';
import { APIMessage } from 'discord-api-types/v10';
import { APIEmbed } from 'discord-api-types/payloads/v10/channel';

export type DSnowflake = string;

export type EmbedArchiveRequest = {
	proxy_url: string;
	url: string;
	orig_url: string;
}

export type ArchiveRequest = {
	channel_id: DSnowflake;
	message: APIMessage;
}

export type ChannelListRequest = {
	channel_id: DSnowflake;
	backfill: boolean;
}

export type ArchivedMedia = {
	image_key: string;
	source_url: string;
	contentDisposition?: string;
	contentType?: string;
	contentLength?: string;
};

export type ErrorMessage = {
	message: string;
	extra: string | null;
}

export type MessageMetadataRequest = {
	images: ArchivedMedia[];
	errors: ErrorMessage[] | null;
	timestamp: string;
	original_embeds: APIEmbed[] | null;
}

export type ChannelArchiveState = {
	channel_id: DSnowflake;
	earliest_archive: DSnowflake;
	latest_archive: DSnowflake;
	backfill_done: boolean;
}

export interface Env {
	// SECRETS
	DISCORD_TOKEN: string;
	PRESIGNED_AWS_KEY_ID: string | null;
	PRESIGNED_AWS_SECRET_KEY: string | null;

	// VARS
	WANT_PRESIGNED: boolean;
	PRESIGNED_EXPIRES: number;
	PRESIGNED_BUCKET_NAME: string;
	PRESIGNED_BUCKET_ACCOUNT_ID: string;
	ARCHIVE_CHANNELS: string;
	DISCORD_CLIENT_ID: string;
	DISCORD_CLIENT_PUB_KEY: string;
	R2_BASE_URL: string;
	USAGE_MODEL: string;

	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	DiscordLinkStateKV: KVNamespace;
	DiscordArchiveStateKV: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	DISCORD_IMAGE_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	DOWNLOAD_QUEUE: Queue<ArchiveRequest>;
	CHANNEL_QUEUE: Queue<ChannelListRequest>;
}

export type StandardArgs = [env: Env];

export type DownloadMediaResult = {
	success: boolean;
	used_backup: boolean;
	response: Response;
	response_backup?: Response;
}

export type RateLimitHeaders = {
	limit: Number;
	remaining: Number;
	reset_after: Number;
	reset_bucket: Number;
}

export type UserFacingArchiveRetrievalResult = {
	original_url: string;
	archive_url: string;
}

export type UserFacingArchiveRetrievalResultList = UserFacingArchiveRetrievalResult[];
