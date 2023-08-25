# Discord Link Archiver

A Cloudflare Workers project to continuously archive images in specific Discord channels

Desired functionality:

- [ ] Image archiving: Downloads embeds and attachments and store them in R2 bucket
- [ ] Image archive retrieval: Take a message ID and tie it back to (a number of) archived embed images (This will likely be achieved by integrating Discord Interactions where a message button opens the archived image URL in-browser)
- [ ] Cron: every 24 hours, go through every channel configured and archive all embed images from the past 24 hours
- [ ] Backfill: A way to trigger backfilling an entire channel using a slow queue (to avoid rate limits)

