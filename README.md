# DiscordApi Link Archiver

A Cloudflare Workers project to continuously archive images in specific DiscordApi channels

Desired functionality:

- [X] Image archiving: Downloads embeds and attachments and store them in R2 bucket
- [X] Image archive retrieval: Take a message ID and tie it back to (a number of) archived embed images (This will likely be achieved by integrating DiscordApi Interactions where a message button opens the archived image URL in-browser)
- [X] Cron: every 2 hours, go through the channels configured and archive all recent embeds
- [ ] Backfill: A way to trigger backfilling an entire channel using a slow queue (to avoid rate limits)
- [ ] Code cleanup and organization

Possibly:

- [ ] Admin-only message commands to enable or disable archiving in a channel
- [ ] Basic dedupe (log embeds already saved, and point new messages with the same embed to the existing image URL)
- [ ] [Pre-signed URLs for access](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), instead of a permanent http url
