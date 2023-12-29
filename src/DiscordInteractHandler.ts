import DiscordApi from './DiscordApi';
import { DiscordLinkState } from './DiscordLinkState';
import {
	APIEmbed,
	APIInteraction,
	APIInteractionResponse, APIMessage, APIModalInteractionResponse,
	ApplicationCommandType,
	InteractionResponseType,
	InteractionType
} from 'discord-api-types/v10';
import { ArchiveRequest, DSnowflake, Env, UserFacingArchiveRetrievalResultList } from './types';
import {
	getDiscordRelativeTimeEmbed,
	getMessageLink, parseChannels
} from './helpers';

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

function successInteractResponse(content: string, embeds: APIEmbed[] = []): APIInteractionResponse {
	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: content,
			embeds: embeds,
			flags: 64,
			allowed_mentions: { parse: [] }
		}
	};
}

function successInteractModalResponse(retrievalResults: UserFacingArchiveRetrievalResultList): APIModalInteractionResponse {
	let cur = 0;
	let components = [{
		type: 1,
		components: [{
			type: 4,
			custom_id: "unusedbase",
			"label": "info",
			style: 2,
			value: "This is only an embed because Discord has a real problem with ephemeral messages: if you scroll back too far, interactions that respond with an ephemeral messages will not be accessible since they disappear when you return to the bottom of your client to look at them. If/when they improve this behavior, this can go back to being a message response instead of this popup modal."
		}]
	}];

	retrievalResults.forEach((result) => {
		components.push({
			type: 1,
			components: [{
				type: 4,
				custom_id: "unused_" + cur,
				label: `Media ${cur} URL`,
				style: 1,
				value: result.original_url,
			}]
		});

		components.push({
			type: 1,
			components: [{
				type: 4,
				custom_id: "unusedarc_" + cur,
				label: `Media ${cur} archive URL`,
				style: 1,
				value: result.archive_url,
			}]
		});

		cur += 1;
	});

	return {
		type: InteractionResponseType.Modal,
		data: {
			custom_id: '_unused',
			title: "Media Links (embed)",
			components: components
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
			let message = json.data.resolved.messages[Object.keys(json.data.resolved.messages)[0]];
			switch (json.data.name) {
				case MESSAGE_COMMAND_ARCHIVE_NOW:
					return await this.handleArchiveNow(json, message);
				case MESSAGE_COMMAND_RETRIEVE:
					return await this.handleRetrieve(json, message);
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

	private async handleRetrieve(json: APIInteraction, message: APIMessage): Promise<APIInteractionResponse> {
		let archive_metadata = await this.discordLinkState.getMessageMetadata(message.id);
		if (archive_metadata == null || archive_metadata.images.length == 0) {
			let content = `❌ Unable to retrieve archive for ${getMessageLink(json.guild_id!, json.channel_id!, message.id)}. Likely Reason: `;
			if (message.embeds.length == 0) {
				content += "No embeds on message. Attachments and non-embedded links are not archived.";
			}
			else if (!this.parsedChannels.includes(json.channel_id!)) {
				content += "Message is not in an approved archiving channel or thread";
			}
			else if(archive_metadata?.errors?.length > 0) {
				for (let error_message of archive_metadata?.errors) {
					content += `\n${error_message.message} (${error_message.extra})`
				}
			}
			else if (archive_metadata?.images.length == 0) {
				content += "Archiving failed for some reason.";
			}
			else {
				content += `Has not been archived yet. \nIf this message has been edited, use the '${MESSAGE_COMMAND_ARCHIVE_NOW}' action.`;
			}
			return errorInteractResponse(content);
		}

		let want_embeds = false;
		if (want_embeds) {
			let out_embeds: APIEmbed[] = archive_metadata.images.map(media => ({
				fields: [
					{
						inline: true,
						name: "Original URL",
						value: media.source_url,
					},
					{
						inline: true,
						name: "Archive URL",
						value: `${this.env.R2_BASE_URL}/${media.image_key}`,
					}
				]
			}));

			return successInteractResponse(`${getMessageLink(json.guild_id!, json.channel_id!, message.id)} archived ${getDiscordRelativeTimeEmbed(archive_metadata.timestamp)}`, out_embeds);
		}
		else {
			let out_results: UserFacingArchiveRetrievalResultList = archive_metadata.images.map(media => ({
				original_url: media.source_url,
				archive_url: `${this.env.R2_BASE_URL}/${media.image_key}`
			}));

			// We must use a model for now
			return successInteractModalResponse(out_results);

		}
	}

	private async handleArchiveNow(json: APIInteraction, message: APIMessage): Promise<APIInteractionResponse> {
		if (!this.parsedChannels.includes(json.channel_id!)) {
			return errorInteractResponse('❌ This channel is not approved for archiving');
		}

		if ((await this.discordLinkState.messageAlreadyArchived(message.id))) {
			return errorInteractResponse(`❌ ${getMessageLink(json.guild_id!, json.channel_id!, message.id)} Already archived`);
		}

		let archiveRequest: ArchiveRequest = {
			channel_id: json.channel_id!,
			message: message,
		};
		if (!archiveRequest) {
			return errorInteractResponse(`❌ No embeds on message ${getMessageLink(json.guild_id!, json.channel_id!, message.id)}. Attachments and non-embedded links are not archived.`);
		}

		let archived = await this.discordLinkState.archiveMessage(archiveRequest);

		let out__embeds: APIEmbed[] = [];
		for (let media of archived.images) {
			out__embeds.push({
				fields: [
					{
						inline: true,
						name: 'Original URL_' + archived.images.indexOf(media).toString(),
						value: media.source_url
					},
					{
						inline: true,
						name: 'Archive URL_' + archived.images.indexOf(media).toString(),
						value: `${this.env.R2_BASE_URL}/${media.image_key}`
					}
				]
			});
		}
		return successInteractResponse(`✅ Successfully archived ${getMessageLink(json.guild_id!, json.channel_id!, message.id)}`, out__embeds);
	}

	async setupGlobals(client_id: DSnowflake) {
		for (let command of GLOBAL_COMMAND_OBJECTS) {
			console.log(await (await this.discordApi.createGlobalAppCommand(client_id, command)).json());
		}
	}
}
