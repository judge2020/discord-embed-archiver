# DiscordApi Link Archiver

A Cloudflare Workers project to continuously archive images in specific DiscordApi channels

Desired functionality:

- [X] Image archiving: Downloads embeds and attachments and store them in R2 bucket
- [X] Image archive retrieval: Take a message ID and tie it back to (a number of) archived embed images (This will likely be achieved by integrating DiscordApi Interactions where a message button opens the archived image URL in-browser)
- [X] Cron: every 2 hours, go through the channels configured and archive all recent embeds
- [X] Backfill: A way to trigger backfilling an entire channel using a slow queue (to avoid rate limits)
- [ ] Code cleanup and organization

Possibly:

- [ ] Admin-only message commands to enable or disable archiving in a channel
- [ ] Basic dedupe (log embeds already saved, and point new messages with the same embed to the existing image URL)
- [ ] [Pre-signed URLs for access](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), instead of a permanent http url


### Setup

Clone repo and `npm i`

1. Create a Discord application and obtain its bot token
2. Enable "Message content intent" for the bot, then wait a minute before continuing
2. Run `python3 -m pip install discord.py` then the following in python3 shell (you must connect to gateway once for bot token to work), replacing the last line with your bot token. After it connects, Ctrl-C and `exit()` to exit the shell:

```
import discord

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print("We have logged in as {0.user}".format(client))

client.run("BOT_TOKEN_HERE")
```

3. Copy wrangler.toml.example to wrangler.toml `cp wrangler.toml.example wrangler.toml`
4. Create KV stores:

```
npm exec wrangler kv:namespace create DiscordLinkStateKV
npm exec wrangler kv:namespace create DiscordArchiveStateKV
```

Fill in the IDs it returns in wrangler.toml for the two KV namespaces


5. Create discord token secret:

```
npm exec wrangler secret put DISCORD_TOKEN
```

5. Create the main R2 bucket of interest:

```
npm exec wrangler r2 bucket create discord-image-bucket
```

(if you choose a different name, change it in wrangler.toml)

Then head to [the Bucket's settings page](https://dash.cloudflare.com/?to=/:account/r2/default/buckets/discord-image-bucket), enable "R2.dev subdomain", and copy the Public bucket URL into the R2_BASE_URL variable in `wrangler.toml`.

6. Create the queue object:

```
npm exec wrangler queues create discord-download-queue
```

7. fill out the remaining [vars] in wrangler.toml

Note: "thread IDs" are valid channel IDs.

8. `npm exec wrangler deploy`
8. Take the output worker URL, "https://discord-link-archiver.*.workers.dev/", and put it into the Discord Developer portal as an interactions endpoint the interaction endpoint at /interactions.
9. visit your worker at the path /setup-globals to set up global app commands
9. visit your worker at the path /invite to invite it to your Discord server
