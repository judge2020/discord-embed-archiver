import { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { ArchivedImage, ArchiveRequest, ChannelArchiveState, DSnowflake, MessageMetadataRequest } from './types';
import { downloadMedia, getFreshUrlForBucket, messageJsonKey } from './helpers';
import { APIEmbed, APIMessage } from 'discord-api-types/v10';

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
}
