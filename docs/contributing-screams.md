# Contributing Goat Screams

## Before You Start

- Capture or source clips you own or that are clearly licensed (CC0, CC-BY, short fair-use snippets <3s).
- Target clean audio: minimal background noise, goat vocalization front and center.
- Keep clips between 0.5s and 10s; longer recordings should be trimmed.

## Upload Checklist

1. Export audio as MP3 (192 kbps recommended).
2. Provide metadata in your submission form:
   - `title`: Descriptive name (e.g., “Farm sunrise bleat”).
   - `context`: Scenario the goat is in (feeding time, startled, chorus, etc.).
   - `year`: When the source was recorded or published.
   - `source`: URL or description of original material, including attribution requirements.
3. Submit via `/api/v1/submissions`:
   - Multipart example:
     ```shell
         curl -F "title=Sunrise Bleat" -F "context=Farm recording" -F "audio=@bleat.mp3" http://localhost:3000/api/v1/submissions
     ```
   - JSON example:
     ```shell
         curl -H "Content-Type: application/json" -d '{"title":"Viral Meme","audio_url":"https://..."}' http://localhost:3000/api/v1/submissions
     ```
4. Wait for moderation (24h SLA). Accepted clips appear in the public API with proper attribution.

## Legal & Attribution Guidance

- Prefer original recordings or content explicitly released under CC0/CC-BY.
- For fair use snippets (e.g., viral memes), keep clips under 3 seconds and document the rationale in `source`.
- Include attribution text if required; moderators will add it to the curated metadata.

## Questions?

- Review `docs/moderation-runbook.md` for how submissions are evaluated.
- Join the project chat or open an issue to discuss licensing uncertainties.

_Last updated: 2025-10-16_
