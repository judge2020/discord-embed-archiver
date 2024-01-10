import { KVNamespace } from '@cloudflare/workers-types';
import { ArchiveRequest, ChannelArchiveState, DSnowflake, Env } from './types';
import { getRateHeaders, sleep } from './helpers';
import { RESTGetAPIChannelMessagesResult } from 'discord-api-types/v10';
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
		let response = (await this.DiscordArchiveStateKV.get(channel_id));
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

		// In bundled mode, only 50 subrequests are allowed
		// In unbound mode, 1000 are allowed
		// Sending to queue is a subrequest, and so is KV get/put requests
		let discord_limit = env.USAGE_MODEL == 'standard' ? 50 : 40;
		let max_channel_requests = env.USAGE_MODEL == 'standard' ? 8 : 1;
		let current_requests = 0;

		console.log(channel_state);
		if (!channel_state) {
			channel_state = {
				channel_id: channel_id,
				earliest_archive: DEFAULT_EARLIEST,
				latest_archive: DEFAULT_LATEST,
				backfill_done: false,
			};
			let messages: RESTGetAPIChannelMessagesResult = await (await discord.getMessages(channel_id, null, null, null, discord_limit)).json();
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
			await this.setArchiveState(channel_state);
		}
		else {
			// iterate messages
			let shouldStop = false;
			while (current_requests < max_channel_requests && !shouldStop) {
				current_requests += 1;

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
							channel_state.earliest_archive = message.id;
						}
					}
					else if (BigInt(channel_state.latest_archive || DEFAULT_LATEST) < BigInt(message.id)) {
						channel_state.latest_archive = message.id;
					}
				}
				// sleep 1 second to give queue some breathing room
				await sleep(1234);
			}
			await this.setArchiveState(channel_state);
			if (!shouldStop) {
				// we didn't run out of messages, we hit channel limit. immediately requeue
				await sleep(3245); // ensure KV store write consistency
				await env.CHANNEL_QUEUE.send({
					channel_id: channel_id,
					backfill: backfill,
				})
			}
		}
	}
}
