import DiscordApi from './DiscordApi';
import { DiscordLinkState } from './DiscordLinkState';
import {
	APIEmbed,
	APIEmbedField,
	APIInteraction,
	APIInteractionResponse,
	ApplicationCommandType,
	InteractionResponseType,
	InteractionType
} from 'discord-api-types/v10';
import { ArchivedImage, ArchiveRequest, DSnowflake, Embed, Env } from './types';
import { extractArchiveRequestFromMessage, parseChannels } from './helpers';

const MESSAGE_COMMAND_RETRIEVE = 'Retrieve Archive';
const MESSAGE_COMMAND_ARCHIVE_NOW = 'Archive Now';

const MESSAGE_COMMAND_RETRIEVE_OBJECT = {
	type: ApplicationCommandType.Message,
	name: MESSAGE_COMMAND_RETRIEVE,
};

const MESSAGE_COMMAND_ARCHIVE_NOW_OBJECT = {
	type: ApplicationCommandType.Message,
	name: MESSAGE_COMMAND_ARCHIVE_NOW,
};

const GLOBAL_COMMAND_OBJECTS = [
	MESSAGE_COMMAND_RETRIEVE_OBJECT,
	MESSAGE_COMMAND_ARCHIVE_NOW_OBJECT,
]

function errorInteractResponse(content: string): APIInteractionResponse {
	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: content,
			flags: 64,
			allowed_mentions: { parse: []}
		}
	};
}

export class DiscordInteractHandler {

	env: Env;
	parsedChannels: DSnowflake[];
	discordApi: DiscordApi;
	discordLinkState: DiscordLinkState;

	constructor(env: Env, discordApi: DiscordApi, discordLinkState: DiscordLinkState) {
		this.env = env;
		this.parsedChannels = parseChannels(env.ARCHIVE_CHANNELS);
		this.discordApi = discordApi;
		this.discordLinkState = discordLinkState;
	}

	// Stick to discord-api-types types instead of discord-interactions if possible
	async handle(json: APIInteraction): Promise<APIInteractionResponse> {
		if (json.type == InteractionType.Ping) {
			return {
				type: InteractionResponseType.Pong
			}
		}
		else if (json.type == InteractionType.ApplicationCommand) {
			// noinspection TypeScriptUnresolvedReference Seems to not include messages hmm
			let messages = json.data.resolved.messages;
			let message_id = Object.keys(messages)[0];
			switch (json.data.name) {
				case MESSAGE_COMMAND_ARCHIVE_NOW:
					if (!this.parsedChannels.includes(json.channel_id)) {
						return errorInteractResponse("❌ This channel is not approved for archiving");
					}
					if ((await this.discordLinkState.messageAlreadyArchived(message_id))) {
						return errorInteractResponse("❌ Already archived");
					}
					let archiveRequest = extractArchiveRequestFromMessage(json.channel_id, messages[message_id]);
					if (!archiveRequest) {
						return {
							type: InteractionResponseType.ChannelMessageWithSource,
							data: {
								content: "❌ Already archived",
								flags: 64,
								allowed_mentions: { parse: []}
							}
						};
					}
					let archived = await this.discordLinkState.archiveMessage(archiveRequest);
					let out__embeds: APIEmbed[] = [];
					for (let image of archived.images) {
						out__embeds.push({
							fields: [
								{
									inline: true,
									name: "Original URL_" + archived.images.indexOf(image).toString(),
									value: image.source_url,
								},
								{
									inline: true,
									name: "Archive URL_" + archived.images.indexOf(image).toString(),
									value: `${this.env.R2_BASE_URL}/${image.image_key}`,
								}
							]
						})
					}
					return {
						type: InteractionResponseType.ChannelMessageWithSource,
						data: {
							content: "✅ Successfully archived",
							embeds: out__embeds,
							flags: 64,
							allowed_mentions: { parse: []}
						}
					}
				case MESSAGE_COMMAND_RETRIEVE:
					let archive_metadata = await this.discordLinkState.getMessageMetadata(message_id);
					if (archive_metadata == null) {
						let content = "❌ Unable to retrieve archive for this message. Likely Reason: ";
						if (messages[message_id]["embeds"].length == 0) {
							content += "No embeds on message. Attachments and non-embedded links are not archived.";
						}
						else if (!this.parsedChannels.includes(json.channel_id)) {
							content += "Message is not in an approved archiving channel or thread";
						}
						else {
							content += "Has not been archived yet.";
						}
						return {
							type: InteractionResponseType.ChannelMessageWithSource,
							data: {
								content: content,
								flags: 64,
								allowed_mentions: { parse: []}
							}
						}
					}
					let out_embeds: APIEmbed[] = [];
					for (let image of archive_metadata.images) {
						out_embeds.push({
							fields: [
								{
									inline: true,
									name: "Original URL_" + archive_metadata.images.indexOf(image).toString(),
									value: image.source_url,
								},
								{
									inline: true,
									name: "Archive URL_" + archive_metadata.images.indexOf(image).toString(),
									value: `${this.env.R2_BASE_URL}/${image.image_key}`,
								}
							]
						})
					}

					return {
						type: InteractionResponseType.ChannelMessageWithSource,
						data: {
							embeds: out_embeds,
							flags: 64,
							allowed_mentions: { parse: []}
						}
					}
				default:
					return {
						type: InteractionResponseType.ChannelMessageWithSource,
						data: {
							content: "Responding to message name" + json.data.name + " with " + JSON.stringify(json.data),
							flags: 64,
							allowed_mentions: { parse: []}
						}
					}
			}
		}
		return {
			type: InteractionResponseType.Pong
		}
	}

	async setupGlobals(client_id: DSnowflake) {
		for (let command of GLOBAL_COMMAND_OBJECTS) {
			console.log(await (await this.discordApi.createGlobalAppCommand(client_id, command)).json());
		}
	}
}
