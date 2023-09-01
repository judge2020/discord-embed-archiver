import { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { ArchivedImage, ArchiveRequest, ChannelArchiveState, DSnowflake, Env, MessageMetadataRequest } from './types';
import { downloadMedia, getFreshUrlForBucket, getRateHeaders, messageJsonKey, sleep } from './helpers';
import { APIEmbed, APIMessage, RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';
import DiscordApi from './DiscordApi';

const DEFAULT_EARLIEST = "99999999999999999999999";
const DEFAULT_LATEST = "1";

export class DiscordArchiveState {

	DiscordArchiveStateKV: KVNamespace;

	constructor(DiscordArchiveStateKV: KVNamespace) {
		this.DiscordArchiveStateKV = DiscordArchiveStateKV;
	}

	async setArchiveState(archiveState: ChannelArchiveState) {
		return this.DiscordArchiveStateKV.put(archiveState.channel_id.toString(), JSON.stringify(archiveState));
	}

	async getArchiveState(channel_id: DSnowflake): Promise<ChannelArchiveState | null> {
		let response = (await this.DiscordArchiveStateKV.get(channel_id.toString()));
		if (response !== null) {
			return JSON.parse(response);
		}
		return null;
	}

	async processCron(channel_id: DSnowflake, discord: DiscordApi, env: Env, backfill = false) {
		let channel_state = await this.getArchiveState(channel_id);
		if (backfill && channel_state?.backfill_done) {
			return;
		}

		// leaving enough room for many subrequests (1000 total limit between discord, r2, kv, etc)

		let max_channel_requests = 100;
		let current_requests = 0;

		console.log(channel_state);
		if (!channel_state) {
			// start with just the latest 100 IDs
			channel_state = {
				channel_id: channel_id,
				earliest_archive: DEFAULT_EARLIEST,
				latest_archive: DEFAULT_LATEST,
				backfill_done: false,
			};
			let messages: RESTGetAPIChannelMessagesResult = await (await discord.getMessages(channel_id, null, null, null, 100)).json();
			if (!(Symbol.iterator in Object(messages))) {
				throw new Error("Error from discord:" + JSON.stringify(messages));
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
				if (BigInt(channel_state.earliest_archive) > BigInt(message.id)) {
					channel_state.earliest_archive = message.id;
				}
			}
		}
		else {
			// iterate messages
			let shouldStop = false;
			while (!shouldStop) {

				current_requests += 1;
				if (current_requests >= max_channel_requests) {
					shouldStop = true;
				}

				let response;
				response = backfill ?
					await (await discord.getMessages(channel_id, null, channel_state.earliest_archive || DEFAULT_EARLIEST, null, 100))
					: await (await discord.getMessages(channel_id, channel_state.latest_archive || DEFAULT_LATEST, null, null, 100));

				console.log("Discord API response status", response.status);

				let rateHeaders = getRateHeaders(response.headers);

				if (response.status == 429 || rateHeaders.remaining < 2) {
					// If Discord pushes us to waiting over 5 seconds for get messages, it's probably not a good idea to keep hitting it
					if (response.status == 429 || rateHeaders.reset_after > 5) {
						shouldStop = true;
					}
					await sleep(rateHeaders.reset_after * 1000);
				}
				let messages: RESTGetAPIChannelMessagesResult = await response.json();

				if (!(Symbol.iterator in Object(messages))) {
					throw new Error("Error from discord:" + JSON.stringify(messages));
				}

				if (messages.length == 0) {
					shouldStop = true;
					if (backfill) {
						channel_state.backfill_done = true;
					}
				}

				for (let message of messages) {
					let archiveRequest: ArchiveRequest = {
						channel_id: channel_id,
						message: message
					};
					await env.DOWNLOAD_QUEUE.send(archiveRequest);
					if (backfill) {
						if (BigInt(channel_state.earliest_archive || DEFAULT_EARLIEST) > BigInt(message.id)) {
							channel_state.latest_archive = message.id
						}
					}
					else if (BigInt(channel_state.latest_archive || DEFAULT_LATEST) < BigInt(message.id)) {
						channel_state.latest_archive = message.id;
					}
				}
			}
		}
		await this.setArchiveState(channel_state);
	}
}
