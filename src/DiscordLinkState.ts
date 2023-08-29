import { KVNamespace } from '@cloudflare/workers-types';
import { ArchiveRequest, DSnowflake, MessageMetadataRequest } from './types';
import { messageJsonKey } from './helpers';

export class DiscordLinkState {

	DiscordLinkStateKV: KVNamespace;

	constructor(DiscordLinkStateKV: KVNamespace) {
		this.DiscordLinkStateKV = DiscordLinkStateKV;
	}

	async messageAlreadyArchived(message_id: DSnowflake) {
		return (await this.DiscordLinkStateKV.get(messageJsonKey(message_id))) !== null;
	}

	async setMessageMetadata(messageMetadataRequest: MessageMetadataRequest) {
		return this.DiscordLinkStateKV.put(messageJsonKey(messageMetadataRequest.archive_request.message_id), JSON.stringify(messageMetadataRequest));
	}

	async getMessageMetadata(message_id: DSnowflake): Promise<ArchiveRequest | null> {
		let response = (await this.DiscordLinkStateKV.get(messageJsonKey(message_id)));
		if (response !== null) {
			return JSON.parse(response);
		}
		return null;
	}
}
