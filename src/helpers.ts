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
