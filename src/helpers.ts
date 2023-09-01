import { ArchiveRequest, DownloadMediaResult, DSnowflake, EmbedArchiveRequest, RateLimitHeaders } from './types';
import { APIEmbed, APIMessage } from 'discord-api-types/v10';

const twitter_hostnames = [
	"twitter.com",
	"www.twitter.com",
	"m.twitter.com",
	"x.com",
	"www.x.com",
	"vxtwitter.com",
	"www.vxtwitter.com",
	"fxtwitter.com",
	"www.fxtwitter.com",
];

const main_twitter_hostname = "twitter.com";

export function fixTwitter(url: string) {
	let tmp_url = new URL(url);
	if (twitter_hostnames.includes(tmp_url.hostname)) {
		tmp_url.hostname = main_twitter_hostname;
		tmp_url.search = "";
	}
	return tmp_url.toString();
}


export function parseChannels(channels: string): string[] {
	return JSON.parse(channels);
}

export async function downloadMedia(url: string, backup_url: string): Promise<DownloadMediaResult> {
	let first_try = await fetch(url, {
		redirect: "follow",
		method: "GET"
	});
	if (first_try.status == 200) {
		return {
			response: first_try,
			used_backup: false,
			success: true
		};
	}
	let second_try = await fetch(backup_url, {
		redirect: 'follow',
		method: 'GET'
	});
	if (second_try.status != 200) {
		return {
			response: first_try,
			response_backup: second_try,
			used_backup: true,
			success: false
		}
	}
	return {
		response: second_try,
		used_backup: true,
		success: true
	}
}

export function messageJsonKey(message_id: DSnowflake) {
	return `messages/${message_id}/metadata.json`;
}

export function getFreshUrlForBucket(channel_id: DSnowflake, message_id: DSnowflake) {
	return `${channel_id}/${message_id}/`
		+ Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);
}

export function getImageFromEmbed(embed: APIEmbed): EmbedArchiveRequest | null {
	if (embed.image && embed.url && embed.image.proxy_url && embed.image.url) {
		return {
			proxy_url: embed.image.proxy_url,
			url: embed.image.url,
			orig_url: fixTwitter(embed.url),
		};
	} else if (embed.thumbnail && embed.url && embed.thumbnail.proxy_url && embed.thumbnail.url) {
		return {
			proxy_url: embed.thumbnail.proxy_url,
			url: embed.thumbnail.url,
			orig_url: fixTwitter(embed.url),
		}
	} else if (embed.video && embed.url && embed.video.proxy_url && embed.video.url) {
		return {
			proxy_url: embed.video.proxy_url,
			url: embed.video.url,
			orig_url: fixTwitter(embed.url),
		}
	}
	return null;
}

export function sleep(milliseconds) {
	return new Promise(r=>setTimeout(r, milliseconds));
}

export function getRateHeaders(headers: Headers): RateLimitHeaders {
	return {
		limit: Number(headers.get("X-RateLimit-Limit")),
		remaining: Number(headers.get("X-RateLimit-Limit")),
		reset_after: Number(headers.get("X-RateLimit-Limit")),
		reset_bucket: Number(headers.get("X-RateLimit-Limit")), // seems to be the same for querying channels in a guild
	}
}
