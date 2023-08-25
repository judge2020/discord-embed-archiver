
export default class Discord {

	private default_headers: HeadersInit;

	private api_base: string = "https://discord.com/api/v10";

	constructor(token: string) {
		this.default_headers = {
			"authorization": "Bot " + token
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

	async getMessages(channel_id: number, after: number|null = null, before: number|null = null, around: number|null = null, limit = 50) {
		let urlParams = {
			"limit": limit.toString()
		};
		if (after !== null) {
			urlParams["after"] = after.toString();
		}
		if (before !== null) {
			urlParams["before"] = before.toString();
		}
		if (around !== null) {
			urlParams["around"] = around.toString();
		}
		let queryString = new URLSearchParams(urlParams).toString();
		let url = `${this.api_base}/channels/${channel_id}/messages?${queryString}`;

		return fetch(url, {
			method: "GET",
			headers: this.default_headers,
		})
	}
}
