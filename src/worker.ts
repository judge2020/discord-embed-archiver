
import { error, IRequest, json, Router } from 'itty-router';
import Discord from './discord';
import { MessageBatch } from '@cloudflare/workers-types';
import { fixTwitter, parseChannels, downloadMedia, getFreshUrlForBucket } from './helpers';
import { DiscordLinkState } from './DiscordLinkState';
import { ArchivedImage, ArchiveRequest, Env, StandardArgs } from './types';
import { RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';

const router = Router<IRequest, StandardArgs>();

router.get('/', (request, env, discord) => {
	return new Response('Root page');
});

router.get('/invite', (request, env) => {
	return new Response('', {
		status: 302,
		headers: {
			'location': `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&scope=bot&permissions=65536`
		}
	});
});

router.get('/get/:message_id', async (request, env, discord, link_state) => {
	let message_id = request.params.message_id;
	return {...{base_url: env.R2_BASE_URL}, ...(await link_state.getMessageMetadata(message_id))};
});

// todo: change this into a way to backfill
// likely using kv or DO to track ?before message ID
router.get('/run', async (request, env, discord) => {
	let parsed_channels = parseChannels(env.ARCHIVE_CHANNELS);
	let channel_id = parsed_channels[0];
	let messages: RESTGetAPIChannelMessagesResult = await (await discord.getMessages(channel_id)).json();
	let urls_to_download: ArchiveRequest[] = [];

	// attachments are not in scope
	messages.forEach((message) => {
		let archiveRequest: ArchiveRequest = {channel_id: channel_id, message_id: message.id, embeds: []};
		message.embeds.forEach((embed) => {
			if (embed.image && embed.url && embed.image.proxy_url && embed.image.url) {
				archiveRequest.embeds.push({
					proxy_url: embed.image.proxy_url,
					url: embed.image.url,
					orig_url: fixTwitter(embed.url),
					embed_json: JSON.stringify(embed),
				});
			} else if (embed.thumbnail && embed.url && embed.thumbnail.proxy_url && embed.thumbnail.url) {
				archiveRequest.embeds.push({
					proxy_url: embed.thumbnail.proxy_url,
					url: embed.thumbnail.url,
					orig_url: fixTwitter(embed.url),
					embed_json: JSON.stringify(embed),
				});
			} else if (embed.video && embed.url && embed.video.proxy_url && embed.video.url) {
				archiveRequest.embeds.push({
					proxy_url: embed.video.proxy_url,
					url: embed.video.url,
					orig_url: fixTwitter(embed.url),
					embed_json: JSON.stringify(embed),
				});
			}
		});
		if (archiveRequest.embeds.length >= 1) {
			urls_to_download.push(archiveRequest);
		}
	});

	urls_to_download.forEach((download_request) => {
		env.DOWNLOAD_QUEUE.send(download_request);
	})

	return urls_to_download;
});


let discord: Discord;
let link_state: DiscordLinkState;

// noinspection JSUnusedGlobalSymbols
export default {
	 async fetch(request, env): Promise<Response> {
		discord = discord ? discord : new Discord(env.DISCORD_TOKEN);
		link_state = link_state ? link_state : new DiscordLinkState(env.DiscordLinkStateKV);

		// noinspection TypeScriptValidateTypes
		return router
			.handle(request, env, discord, link_state)
			.then(json)
			.catch(error);
	},

	async queue(batch: MessageBatch<ArchiveRequest>, env: Env): Promise<void> {
		link_state = link_state ? link_state : new DiscordLinkState(env.DiscordLinkStateKV);

		// it's important to await things here, since we can only have 6 simultaneous connections open to other CF services (R2 and KV)
		for(const message of batch.messages) {
			let request: ArchiveRequest = message.body;
			console.log("Consuming " + request.message_id);
			let already_archived = (await link_state.messageAlreadyArchived(request.message_id));
			if (already_archived) {
				console.log("Already archived", request.message_id);
				continue;
			} else {

				let images: ArchivedImage[] = [];

				for (const embed of request.embeds) {
					let downloaded_media = await downloadMedia(embed.url, embed.proxy_url);
					if (!downloaded_media.success) {
						console.log('Download media did not succeed for message' + request.message_id);
						// todo use the kv metadata to track num tries, and stop after x retries
						continue;
					}

					let bucketUrl = getFreshUrlForBucket(request.channel_id, request.message_id);

					await env.DISCORD_IMAGE_BUCKET.put(bucketUrl, (await downloaded_media.response.arrayBuffer()), {
						httpMetadata: {
							contentType: downloaded_media.response.headers.get('content-type'),
							cacheControl: 'public'
						}
					});

					images.push({
						image_key: bucketUrl,
						source_url: downloaded_media.used_backup ? embed.proxy_url : embed.url,
						contentType: downloaded_media.response.headers.get('content-type'),
						contentDisposition: downloaded_media.response.headers.get('content-disposition'),
						contentLength: downloaded_media.response.headers.get('content-length')
					});
				}


				await link_state.setMessageMetadata({
					images: images,
					archive_request: request
				});
				console.log('archived metadata for' + request.message_id);
			}
			// todo: download and put in r2 and/or durable objects
			message.ack();
		}
		return;
	},
};
