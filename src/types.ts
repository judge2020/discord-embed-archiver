import { KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';
import DiscordApi from './DiscordApi';
import { DiscordLinkState } from './DiscordLinkState';
import { APIMessage } from 'discord-api-types/v10';

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

export type ArchivedImage = {
	image_key: string;
	source_url: string;
	contentDisposition?: string;
	contentType?: string;
	contentLength?: string;
};

export type MessageMetadataRequest = {
	images: ArchivedImage[];
	timestamp: string;
	archive_request: ArchiveRequest;
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
	ARCHIVE_CHANNELS: string;
	DISCORD_CLIENT_ID: string;
	DISCORD_CLIENT_PUB_KEY: string;
	R2_BASE_URL: string;
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
	DOWNLOAD_QUEUE: Queue<any>;
}

export type StandardArgs = [env: Env, discord: DiscordApi, link_state: DiscordLinkState];

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
