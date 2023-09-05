
import { error, IRequest, json, Router } from 'itty-router';
import DiscordApi from './DiscordApi';
import {verifyKey} from 'discord-interactions';
import { Message, MessageBatch } from '@cloudflare/workers-types';
import { getImageFromEmbed, parseChannels } from './helpers';
import { DiscordLinkState } from './DiscordLinkState';
import { ArchiveRequest, ChannelListRequest, Env, StandardArgs } from './types';
import { RESTGetAPIChannelMessageResult, RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';
import { DiscordInteractHandler } from './DiscordInteractHandler';
import { DiscordArchiveState } from './ChannelArchiveState';

const DISCORD_DOWNLOAD_QUEUE = 'discord-download-queue';
const DISCORD_DOWNLOAD_QUEUE_ALT = 'discord-download-queue-production';
const CHANNEL_LIST_QUEUE = 'channel-list-queue';
const CHANNEL_LIST_QUEUE_ALT = 'channel-list-queue';

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

router.get('/metadata/:message_id', async (request, env, discord, link_state) => {
	let message_id = request.params.message_id;
	return {...{base_url: env.R2_BASE_URL}, ...(await link_state.getMessageMetadata(message_id))};
});

router.get('/embeds/:channel_id/:message_id', async (request, env, discord, link_state) => {
	let channel_id = request.params.channel_id;
	let message_id = request.params.message_id;
	let message: RESTGetAPIChannelMessageResult = await (await discord.getMessage(channel_id, message_id)).json();
	let embeds = [];
	for (const embed of message.embeds) {
		embeds.push(getImageFromEmbed(embed));
	}
	return embeds;
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

	async queue(batch: MessageBatch<ArchiveRequest | ChannelListRequest>, env: Env): Promise<void> {
		discord = discord ? discord : new DiscordApi(env.DISCORD_TOKEN);
		link_state = link_state ? link_state : new DiscordLinkState(env.DiscordLinkStateKV, env.DISCORD_IMAGE_BUCKET);

		switch (batch.queue) {
			case DISCORD_DOWNLOAD_QUEUE || DISCORD_DOWNLOAD_QUEUE_ALT:
				// it's important to await things here, since we can only have 6 simultaneous connections open to other CF services (R2 and KV)
				for(const message: Message<ArchiveRequest> of batch.messages) {
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
					message.ack();
				}
				return;
			case CHANNEL_LIST_QUEUE || CHANNEL_LIST_QUEUE_ALT:
				for (const message: Message<ChannelListRequest> of batch.messages) {
					let request: ChannelListRequest = message.body;
					try {
						await archive_state.processCron(request.channel_id, discord, env, request.backfill);
					}
					catch (e) {
						console.log(`Failed to archive channel ${request.channel_id} with error ${e.toString()} | backfill: ${request.backfill}`, e.stack)
					}
				}
				return;
			default:
				console.log("Batch request did not match any known queue");
				return;
		}

	},

	async scheduled(event, env: Env, ctx) {
		let parsed_channels = parseChannels(env.ARCHIVE_CHANNELS);
		archive_state = archive_state ? archive_state : new DiscordArchiveState(env.DiscordArchiveStateKV);
		discord = discord ? discord : new DiscordApi(env.DISCORD_TOKEN);
		switch (event.cron) {
			// todo backfill: effectively the opposite of this - running a cron, say every third minute, using `before` instead of `after` - but only if channel is marked for backfilling
			case "48 */2 * * *":
				// main cron for updating channels
				console.log("running periodic archive cron");
				for (const channel_id of parsed_channels) {
					await env.CHANNEL_QUEUE.send({
						channel_id: channel_id,
						backfill: false,
					})
				}
				return;
			case "*/15 * * * *":
				// backfill
				console.log("running backfill cron");
				for (const channel_id of parsed_channels) {
					await env.CHANNEL_QUEUE.send({
						channel_id: channel_id,
						backfill: true,
					})
				}
				return;
			default:
				console.log("cannot run unspecified cron");
		 }
	}
};
