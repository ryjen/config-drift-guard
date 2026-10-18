# Narrated demo publication

The owner approved the 87-second Config Drift Guard test-footage demonstration for repository publication. The final 720p MP4 is staged but not yet publicly hosted. Do not link to the private Drive copy as if it were a public video.

- Duration: 87.168 seconds; H.264 Constrained Baseline, 1280×720, AAC stereo.
- Exact media SHA-256: `fa0d50106b9f989970b7bd18c83ba7eacb6eb8cf68d36108a3e1146f9396fa5b`.
- The synthetic service drift example reconciles observed `api:v1 / 1 replica / debug` to desired `api:v2 / 3 replicas / info` after explicit approval.
- A separate stale-plan test changes observed image to `api:v3` before approval; preflight rejects the old plan and leaves the new state untouched.
- Recording is edited browser-test footage, not a production deployment or security certification.
- Narration uses ElevenLabs synthetic speech. Confirm its generation-plan redistribution rights and credit requirements before public release.

Publishing steps: upload the exact MP4 as a downloadable release asset (rather than committing it into Git history), upload the companion English VTT captions, verify the actual public playback/download link, then update `README.md` and close issue #39. Source-code licensing is a separate decision in issue #34.
