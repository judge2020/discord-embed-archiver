import {
	APIApplicationCommand, Snowflake
} from 'discord-api-types/v10';
import { DSnowflake } from './types';


export default class DiscordApi {

	private default_headers: HeadersInit;

	private api_base: string = "https://discord.com/api/v10";

	constructor(token: string) {
		if (token.length < 30) {
			throw new Error("Discord token incorrect length");
		}
		this.default_headers = {
			"authorization": "Bot " + token,
			"content-type": "application/json",
			"accept": "application/json",
		};
	}

	// not needed to read public threads, but leaving it here
	async joinThread(channel_id: number) {
		let url = `${this.api_base}/channels/${channel_id}/thread-members/@me`;
		return fetch(url, {
			method: "PUT",
			headers: this.default_headers,
		})
	}


	async createGlobalAppCommand(client_id: DSnowflake, applicationCommand: any) {
		let url = `${this.api_base}/applications/${client_id}/commands`;
		return fetch(url, {
			method: "POST",
			headers: this.default_headers,
			body: JSON.stringify(applicationCommand)
		})
	}

	async getMessages(channel_id: DSnowflake, after: DSnowflake|null = null, before: DSnowflake|null = null, around: DSnowflake|null = null, limit = 50): Promise<Response> {
		let urlParams = {
			"limit": limit.toString()
		};
		if (after !== null) {
			urlParams["after"] = after;
		}
		if (before !== null) {
			urlParams["before"] = before;
		}
		if (around !== null) {
			urlParams["around"] = around;
		}
		let queryString = new URLSearchParams(urlParams).toString();
		let url = `${this.api_base}/channels/${channel_id}/messages?${queryString}`;

		return fetch(url, {
			method: "GET",
			headers: this.default_headers,
		})
	}
}
