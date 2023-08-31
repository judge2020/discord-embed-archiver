
import { error, IRequest, json, Router } from 'itty-router';
import DiscordApi from './DiscordApi';
import {verifyKey} from 'discord-interactions';
import { MessageBatch } from '@cloudflare/workers-types';
import { parseChannels, sleep } from './helpers';
import { DiscordLinkState } from './DiscordLinkState';
import { ArchivedImage, ArchiveRequest, Env, StandardArgs } from './types';
import { RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';
import { DiscordInteractHandler } from './DiscordInteractHandler';
import { DiscordArchiveState } from './ChannelArchiveState';

const router = Router<IRequest, StandardArgs>();

router.get('/', (request, env, discord) => {
	return new Response('Root page2');
});

router.get('/invite', (request, env) => {
	return new Response('', {
		status: 302,
		headers: {
			'location': `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&scope=&scope=applications.commands%20bot&permissions=65536`
		}
	});
});

let discordInteractHandler: DiscordInteractHandler;


router.get('/setup-globals', async (request, env, discord, link_state) => {
	discordInteractHandler = discordInteractHandler ? discordInteractHandler : new DiscordInteractHandler(env, discord, link_state);
	await discordInteractHandler.setupGlobals(env.DISCORD_CLIENT_ID);
	return 'Good';
})

router.post('/interactions', async (request: Request, env, discord, link_state) => {
	let signature = request.headers.get('x-signature-ed25519');
	let timestamp = request.headers.get('x-signature-timestamp');

	let isValidRequest = verifyKey(
		await request.clone().arrayBuffer(),
		signature,
		timestamp,
		env.DISCORD_CLIENT_PUB_KEY,
	)

	if (!isValidRequest) {
		return new Response('Bad request signature', {status: 401})
	}

	discordInteractHandler = discordInteractHandler ? discordInteractHandler : new DiscordInteractHandler(env, discord, link_state);

	return await discordInteractHandler.handle((await request.json()));
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

	messages.forEach((message) => {
		let archiveRequest: ArchiveRequest = {
			channel_id: channel_id,
			message: message
		};
		env.DOWNLOAD_QUEUE.send(archiveRequest);
	});
	return "Done";
});


let discord: DiscordApi;
let link_state: DiscordLinkState;
let archive_state: DiscordArchiveState;

// noinspection JSUnusedGlobalSymbols
export default {
	 async fetch(request, env): Promise<Response> {
		discord = discord ? discord : new DiscordApi(env.DISCORD_TOKEN);
		link_state = link_state ? link_state : new DiscordLinkState(env.DiscordLinkStateKV, env.DISCORD_IMAGE_BUCKET);
		 // noinspection TypeScriptValidateTypes
		return router
			.handle(request, env, discord, link_state)
			.then(json)
			.catch(error);
	},

	async queue(batch: MessageBatch<ArchiveRequest>, env: Env): Promise<void> {
		link_state = link_state ? link_state : new DiscordLinkState(env.DiscordLinkStateKV, env.DISCORD_IMAGE_BUCKET);

		// it's important to await things here, since we can only have 6 simultaneous connections open to other CF services (R2 and KV)
		for(const message of batch.messages) {
			let request: ArchiveRequest = message.body;
			console.log("Consuming " + request.message.id);
			let already_archived = (await link_state.messageAlreadyArchived(request.message.id));
			if (already_archived) {
				console.log("Already archived", request.message.id);
				continue;
			} else {
				await link_state.archiveMessage(request);
				console.log('archived metadata for' + request.message.id);
			}
			// todo: download and put in r2 and/or durable objects
			message.ack();
		}
		return;
	},

	async scheduled(event, env: Env, ctx) {
		let parsed_channels = parseChannels(env.ARCHIVE_CHANNELS);
		archive_state = archive_state ? archive_state : new DiscordArchiveState(env.DiscordArchiveStateKV);
		discord = discord ? discord : new DiscordApi(env.DISCORD_TOKEN);
		switch (event.cron) {
			// todo backfill: effectively the opposite of this - running a cron, say every third minute, using `before` instead of `after` - but only if channel is marked for backfilling
			 case "48 */2 * * *":
			default:
				// main cron for updating channels
				for (const channel_id of parsed_channels) {
					let channel_state = await archive_state.getArchiveState(channel_id);
					console.log(channel_state);
					if (!channel_state) {
						// start with just the latest 100 IDs
						channel_state = {
							channel_id: channel_id,
							latest_archive: "1",
						};
						let messages: RESTGetAPIChannelMessagesResult = await (await discord.getMessages(channel_id, null, null, null, 100)).json();
						for (let message of messages) {
							let archiveRequest: ArchiveRequest = {
								channel_id: channel_id,
								message: message
							};
							await env.DOWNLOAD_QUEUE.send(archiveRequest);
							if (BigInt(channel_state.latest_archive) < BigInt(message.id)) {
								channel_state.latest_archive = message.id;
							}
						}
					}
					else {
						// go back messages
						let shouldStop = false;
						while (!shouldStop) {
							let response = await (await discord.getMessages(channel_id, channel_state.latest_archive, null, null, 100));
							let _rate_limit = Number(response.headers.get("X-RateLimit-Limit"));
							let _rate_remaining = Number(response.headers.get("X-RateLimit-Remaining"));
							let _rate_reset_after = Number(response.headers.get("X-RateLimit-Reset-After"));
							let _rate_reset_bucket = Number(response.headers.get("X-RateLimit-Bucket")); // seems to be the same for querying channels in a guild
							if (_rate_remaining < 2) {
								// If Discord pushes us to waiting over 5 seconds for get messages, it's probably not a good idea to keep hitting it
								if (_rate_reset_after > 5) {
									shouldStop = true;
								}
								await sleep(_rate_reset_after * 1000);
							}
							let messages: RESTGetAPIChannelMessagesResult = await response.json();
							if (messages.length == 0) {
								shouldStop = true;
							}
							for (let message of messages) {
								let archiveRequest: ArchiveRequest = {
									channel_id: channel_id,
									message: message
								};
								await env.DOWNLOAD_QUEUE.send(archiveRequest);
								if (BigInt(channel_state.latest_archive) < BigInt(message.id)) {
									channel_state.latest_archive = message.id;
								}
							}
						}
					}
					await archive_state.setArchiveState(channel_state);
				}
		 }
	}
};
