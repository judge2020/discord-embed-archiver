
import { error, IRequest, json, Router } from 'itty-router';
import DiscordApi from './DiscordApi';
import {verifyKey} from 'discord-interactions';
import { MessageBatch } from '@cloudflare/workers-types';
import { parseChannels } from './helpers';
import { DiscordLinkState } from './DiscordLinkState';
import { ArchivedImage, ArchiveRequest, Env, StandardArgs } from './types';
import { RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';
import { DiscordInteractHandler } from './DiscordInteractHandler';

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

	let urls_to_download = [];
	messages.forEach((message) => {
		let archiveRequest: ArchiveRequest = {channel_id: channel_id, message_id: message.id, embeds: []};
		if (archiveRequest) {
			urls_to_download.push(archiveRequest);
		}
	});

	urls_to_download.forEach((download_request) => {
		env.DOWNLOAD_QUEUE.send(download_request);
	})

	return urls_to_download;
});


let discord: DiscordApi;
let link_state: DiscordLinkState;

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
			console.log("Consuming " + request.message_id);
			let already_archived = (await link_state.messageAlreadyArchived(request.message_id));
			if (already_archived) {
				console.log("Already archived", request.message_id);
				continue;
			} else {
				await link_state.archiveMessage(request);
				console.log('archived metadata for' + request.message_id);
			}
			// todo: download and put in r2 and/or durable objects
			message.ack();
		}
		return;
	},
};
