import { KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';
import Discord from './discord';
import { DiscordLinkState } from './DiscordLinkState';

export type MessageId = string|number;

export type Embed = {
	proxy_url: string;
	url: string;
	orig_url: string;
	embed_json: string;
}
export type ArchiveRequest = {
	message_id: MessageId;
	embeds: Embed[];
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
	archive_request: ArchiveRequest;
}

export interface Env {
	// SECRETS
	DISCORD_TOKEN: string;
	ARCHIVE_CHANNELS: string;
	DISCORD_CLIENT_ID: string;
	R2_BASE_URL: string;
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	DiscordLinkStateKV: KVNamespace;
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

export type StandardArgs = [env: Env, discord: Discord, link_state: DiscordLinkState];

export type DownloadMediaResult = {
	success: boolean;
	used_backup: boolean;
	response: Response;
	response_backup?: Response;
}
