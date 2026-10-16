# Config Drift Guard — edited demo review-cut QA

**Status: Unpublished internal editorial draft.** This is technical/source evidence and limited visual inspection, not a legal clearance, privacy audit, or owner approval.

## Integrity and scope

| Item | Verified finding |
|---|---|
| Repository and recorded PR head | ryjen/config-drift-guard, f3232d83fab26d66e7224c1cb900d904b111b063 |
| Browser CI receipt | [Run 38977481218](https://github.com/ryjen/config-drift-guard/actions/runs/38977481218): standard checks, Chromium, browser E2E, artifact upload passed |
| Raw GitHub Actions artifact | ID 12079408543; GitHub copy expires 2026-10-19 22:45:46 UTC |
| Retained ZIP | config-drift-guard-verified-browser-captures.zip; 5,111,540 bytes; SHA-256 deb9c9298cf87c4e46a25d5fad531aa08d119117557d5f8b010ab0b81ef096d7 |
| ZIP members | 2 actual Chromium WebM videos (12.44 and 15.68 seconds), 6 real milestone screenshots |
| Edited review MP4 | config-drift-guard-demo-review-cut.mp4; 8,079,061 bytes; SHA-256 1bf068588d03365b1e423409d349140fdc1b352ed3ad068150c0dae8c12cd63a |
| MP4 technical characteristics | 87.15 seconds, 1920×1080, H.264 video, **no audio track** |
| Timed descriptions | [Nine-cue WebVTT draft](DEMO-REVIEW-DESCRIPTIONS.vtt); descriptive subtitles, not a transcript of spoken words |

The files were inspected in the originating ChatGPT working container using SHA-256, ZIP member listing, FFprobe and representative video/slate frames. **Neither media binary is committed to this public repository**, and short-lived GitHub artifact retention is not durable storage.

## Authenticity and editorial structure

The cut was assembled locally with Pillow and FFmpeg from the two actual Chromium test WebMs, six authentic browser screenshots and clearly labeled editorial slates. Overlays use locally installed DejaVu Sans fonts. It **does not depict a single continuous manually operated session, live cloud resources, employer production use, or synthetic AI-generated application screenshots**.

| Approximate time | Scene |
|---|---|
| 00:00–00:06 | Synthetic-test evidence intro |
| 00:06–00:14 | Known seeded operator console |
| 00:14–00:26.45 | Real browser scan and approval test video |
| 00:26.45–00:36.45 | Verified convergence milestone |
| 00:36.45–00:45.45 | New plan and stale-input setup |
| 00:45.45–01:01.15 | Real browser stale-plan failure test video |
| 01:01.15–01:13.15 | Failed preflight, skipped apply/verification screenshot |
| 01:13.15–01:21.15 | Explicit operator rejection milestone |
| 01:21.15–01:27.15 | Source evidence / unpublished-draft outro |

Representative slates/screenshots were visually inspected for legibility, synthetic-demo labeling, correct stale-plan narrative, and obvious exposed personal content. This sample-based inspection **does not replace full-frame review** or establish that every captured frame is safe for public distribution.

## Known provenance and open approvals

- [x] No stock photos, third-party music, synthesized narration, or externally sourced logos were intentionally added by the local cut-generation script. UI imagery is from the synthetic browser fixtures.
- [x] The local font files are DejaVu Sans; the system package records Bitstream Vera-related terms at /usr/share/doc/fonts-dejavu-core/copyright. This finding is **not complete release clearance**.
- [ ] Owner watches the whole MP4 at a readable screen size and confirms content accuracy, legibility, editing honesty, absence of secrets/private details and suitability for viewers on smaller screens.
- [ ] Review UI assets, font attribution, any third-party notices, audio added later, and distributor/codec terms under [rights issue #34](https://github.com/ryjen/config-drift-guard/issues/34). Current source lacks a top-level LICENSE.
- [ ] Review and edit the descriptive WebVTT and decide whether to record voiceover. The source video has **no spoken audio** to caption.
- [ ] Owner explicitly approves the final **exact media digest** and chosen publication location. No license, publicity, or video release is authorized by passing CI.
- [ ] Only after approval, publish, verify playback/accessibility, and add the real public video URL to README and [Engineering Work](https://ryanjennin.gs/engineering/) through reviewed changes. Close [video issue #39](https://github.com/ryjen/config-drift-guard/issues/39) only after that acceptance.

**Revision discipline:** Any trimming, re-encoding, narration, overlay, subtitles, new test capture or other final-cut change requires recalculating SHA-256, re-checking duration/tracks and obtaining owner approval for the new artifact.
