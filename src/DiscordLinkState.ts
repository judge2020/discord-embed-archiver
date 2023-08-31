import { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { ArchivedImage, ArchiveRequest, DSnowflake, MessageMetadataRequest } from './types';
import { downloadMedia, getFreshUrlForBucket, getImageFromEmbed, messageJsonKey } from './helpers';
import { APIEmbed, APIMessage } from 'discord-api-types/v10';

export class DiscordLinkState {

	DiscordLinkStateKV: KVNamespace;
	DISCORD_IMAGE_BUCKET: R2Bucket;

	constructor(DiscordLinkStateKV: KVNamespace, DISCORD_IMAGE_BUCKET: R2Bucket) {
		this.DiscordLinkStateKV = DiscordLinkStateKV;
		this.DISCORD_IMAGE_BUCKET = DISCORD_IMAGE_BUCKET;
	}

	async messageAlreadyArchived(message_id: DSnowflake) {
		return (await this.DiscordLinkStateKV.get(messageJsonKey(message_id))) !== null;
	}

	async setMessageMetadata(messageMetadataRequest: MessageMetadataRequest) {
		return this.DiscordLinkStateKV.put(messageJsonKey(messageMetadataRequest.archive_request.message.id), JSON.stringify(messageMetadataRequest));
	}

	async getMessageMetadata(message_id: DSnowflake): Promise<MessageMetadataRequest | null> {
		let response = (await this.DiscordLinkStateKV.get(messageJsonKey(message_id)));
		if (response !== null) {
			return JSON.parse(response);
		}
		return null;
	}

	async archiveMessage(request: ArchiveRequest): Promise<MessageMetadataRequest> {
		let images: ArchivedImage[] = [];

		for (const embed of request.message.embeds) {
			let extracted_embed = getImageFromEmbed(embed);
			if (!extracted_embed) {
				console.log("No image in embed " + request.message.id);
				continue;
			}
			let downloaded_media = await downloadMedia(extracted_embed.url, extracted_embed.proxy_url);
			if (!downloaded_media.success) {
				console.log('Download media did not succeed for message' + request.message.id);
				// todo use the kv metadata to track num tries, and stop after x retries
				continue;
			}

			let bucketUrl = getFreshUrlForBucket(request.channel_id, request.message.id);

			await this.DISCORD_IMAGE_BUCKET.put(bucketUrl, (await downloaded_media.response.arrayBuffer()), {
				httpMetadata: {
					contentType: downloaded_media.response.headers.get('content-type'),
					cacheControl: 'public'
				}
			});

			images.push({
				image_key: bucketUrl,
				source_url: downloaded_media.used_backup ? extracted_embed.proxy_url : extracted_embed.url,
				contentType: downloaded_media.response.headers.get('content-type'),
				contentDisposition: downloaded_media.response.headers.get('content-disposition'),
				contentLength: downloaded_media.response.headers.get('content-length')
			});
		}

		let returned_metadata = {
			images: images,
			timestamp: new Date().toISOString(),
			archive_request: request
		};

		await this.setMessageMetadata(returned_metadata);

		return returned_metadata;
	}
}
