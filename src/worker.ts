import {
	error,
	json,
	Router,
	IRequest
} from 'itty-router';
import Discord from './discord';
import { Queue, MessageBatch } from '@cloudflare/workers-types';
import { fixTwitter } from './helpers';


interface Env {
	// SECRETS
	DISCORD_TOKEN: string;
	ARCHIVE_CHANNELS: string;
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	DOWNLOAD_QUEUE: Queue<any>;
}


class ParsedEnv {
	discord_token: string;
	archive_channels: { [key: string]: number[] };
	DOWNLOAD_QUEUE: Queue<any>;

	constructor(env: Env) {
		this.discord_token = env.DISCORD_TOKEN;
		this.archive_channels = JSON.parse(env.ARCHIVE_CHANNELS);
		this.DOWNLOAD_QUEUE = env.DOWNLOAD_QUEUE;
	}
}

type StandardArgs = [env: ParsedEnv, discord: Discord];

const router = Router<IRequest, StandardArgs>();

router.get<IRequest, StandardArgs>('/invite', (request) => {
	return new Response('', {
		status: 302,
		headers: {
			'location': `https://discord.com/oauth2/authorize?client_id=1140704569194729592&scope=bot&permissions=65536`
		}
	});
});

router.get('/', (request, env, discord) => {
	return new Response('Hello, world! This is the root page of your Worker template.');
});

type DownloadRequest = {
	message_id: string | number;
	proxy_url: string;
	url: string;
	orig_url: string;
}
// todo: change this into a way to backfill
// likely using kv or DO to track ?before message ID
router.get('/run', async (request, env, discord) => {
	let messages = await discord.getMessages(env.archive_channels[Object.keys(env.archive_channels)][0]);
	let urls_to_download: DownloadRequest[] = [];

	(await messages.json()).forEach((message) => {
		message.embeds.forEach((embed) => {
			if (embed.image) {
				urls_to_download.push({
					message_id: message.id,
					proxy_url: embed.image.proxy_url,
					url: embed.image.url,
					orig_url: fixTwitter(embed.url)
				});
			} else if (embed.thumbnail) {
				urls_to_download.push({
					message_id: message.id,
					proxy_url: embed.thumbnail.proxy_url,
					url: embed.thumbnail.url,
					orig_url: fixTwitter(embed.url)
				});
			}
		});
	});

	env.DOWNLOAD_QUEUE.send(urls_to_download[0]);

	urls_to_download.forEach((download_request) => {
		env.DOWNLOAD_QUEUE.send(download_request);
	})

	return urls_to_download;
});


let discord;
let parsed_env;

// noinspection JSUnusedGlobalSymbols
export default {
	 async fetch(request, env): Promise<Response> {
		discord = discord ? discord : new Discord(env.DISCORD_TOKEN);
		parsed_env = parsed_env ? parsed_env : new ParsedEnv(env);

		// noinspection TypeScriptValidateTypes
		return router
			.handle(request, parsed_env, discord)
			.then(json)
			.catch(error);
	},

	async queue(batch: MessageBatch<DownloadRequest>, env: Env): Promise<void> {
		for(const message of batch.messages) {
			let request: DownloadRequest = message.body;
			console.log("Consuming: ", request);
			// todo: download and put in r2 and/or durable objects
			message.ack();
		}
		return;
	},
};
