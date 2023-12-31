# Discord Embed Archiver

A Cloudflare Workers project to continuously archive images in specific Discord channels.

The public version of this bot is currently invite-only.

Desired functionality:

- [X] Image archiving: Downloads embeds and attachments and store them in R2 bucket
- [X] Image archive retrieval: Take a message ID and tie it back to (a number of) archived embed images (This will likely be achieved by integrating DiscordApi Interactions where a message button opens the archived image URL in-browser)
- [X] Cron: every 2 hours, go through the channels configured and archive all recent embeds
- [X] Backfill: A way to trigger backfilling an entire channel using a slow queue (to avoid rate limits)
- [X] Addressing issues of scale
- [ ] Code cleanup and organization

Possibly:

- [ ] Admin-only message commands to enable or disable archiving in a channel
- [ ] Basic dedupe (log embeds already saved, and point new messages with the same embed to the existing image URL)
- [ ] [Pre-signed URLs for access](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), instead of a permanent http url


### Setup

Clone repo and `npm i`

1. Create a Discord application and obtain its bot token
2. Enable "Message content intent" for the bot, then wait a minute before continuing
3. You must initialize your bot user by logging into the Gateway once. This can be done locally with [this python script](https://gist.github.com/judge2020/4a996a26058562bb4bf38b5c679528d2).
4. `cp wrangler.toml.example wrangler.toml`
5. Create KV stores:

```
npx wrangler kv:namespace create DiscordLinkStateKV
npx wrangler kv:namespace create DiscordArchiveStateKV
```

Fill in the relevant KV sections of wrangler.toml for the two KV namespaces with their corresponding IDs

6. Create a secret environment variable for your Discord Bot Token:

```
npx wrangler secret put DISCORD_TOKEN
```

7. Create the main R2 bucket of interest:

```
npx wrangler r2 bucket create discord-image-bucket
```

(if you choose a different name, change it in wrangler.toml)

Then head to [the Bucket's settings page](https://dash.cloudflare.com/?to=/:account/r2/default/buckets/discord-image-bucket), enable "R2.dev subdomain", and copy the Public bucket URL into the R2_BASE_URL variable in `wrangler.toml`.

Note: if you'd like, you can set up a custom domain. You will need to at scale if you begin to experience the r2.dev rate limits or if you'd like to have images cached instead of counting as a Class A operation.

6. Create the queues:

```
npx wrangler queues create discord-download-queue
npx wrangler queues create channel-list-queue
```

7. fill out the remaining [vars] in wrangler.toml. The channels variable is a string representing a JSON array of channel names (string[]).

Note: thread IDs are valid channel IDs.

8. `npx wrangler deploy`
9. Take the output worker URL, "discord-link-archiver.YOURSUBDOMAIN.workers.dev/", and put it into the Discord Developer portal as an interactions endpoint and append `/interactions`.
10. visit your worker at the path `/setup-globals/:DISCORD_CLIENT_PUB_KEY` to set up global app commands
11. visit your worker at the path /invite to invite it to your Discord server


### Presigned URLs setup

By using presigned URLs, you can avoid people hotlinking your images and using up your R2 quota. In addition, R2_BASE_URL will no longer be used.

Cons:
- Cannot use a custom domain (yet) - nor can you use r2.dev
- Unknown if the output URL is subject to rate limiting
- Your Cloudflare account ID will be revealed. This is not strictly a problem, and [Cloudflare has previously said](https://github.com/cloudflare/wrangler-legacy/issues/209#issuecomment-541654484) that all values in wrangler.toml are fine to be committed, just something to consider.

[Create a R2 API Token](https://dash.cloudflare.com/?to=/:account/r2/api-tokens/create). It only needs 'Object Read only' since it's only used for creating presigned URLs, not writing images to the bucket. In addition, you can limit its access to the specified R2 bucket.

```bash
npx wrangler secret put PRESIGNED_AWS_KEY_ID
npx wrangler secret put PRESIGNED_AWS_SECRET_KEY
```

Next, set `WANT_PRESIGNED` to `true` and fill out the entries prefixed with `PRESIGNED_` in `wrangler.toml`.

Be sure to turn off public access on your bucket and disconnect any custom domains, as they always enable public access to everything when connected.
