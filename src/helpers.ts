import { DownloadMediaResult, MessageId } from './types';

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


export function parseChannels(channels: string): number[] {
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

export function messageJsonKey(message_id: MessageId) {
	return `messages/${message_id}/metadata.json`;
}

export function getFreshUrlForBucket(message_id: MessageId) {
	return `messages/${message_id}/`
		+ Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);
}
