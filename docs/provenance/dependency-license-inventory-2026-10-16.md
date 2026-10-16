# Dependency-license inventory — Config Drift Guard

**Evidence date:** 2026-10-16
**Pinned public-main source:** `3e8d8676b69f12c82f6f8df0b863fa491ec9ad38`
**Lockfile SHA-256:** `eb8ddbbdcf0cf5eee07f4f7f312f4485d7f097c784575cb5f7f7d2b6e2246533`
**Scope:** The `packages:` entries in `pnpm-lock.yaml`, compared with exact name/version package manifests in a successful **offline, frozen-lockfile** local Linux pnpm installation. Includes runtime, dev, optional and platform-specific resolution entries. This is **not** a deployed-bundle inventory.

## Evidence summary

| Measure | Result |
| --- | ---: |
| Pinned package entries | 316 |
| Exact-name/version matches to local installed manifests | 187 |
| Pinned entries with no matching installed metadata in this Linux environment | 129 |
| Matched packages with a discovered license/copying filename at their package root | 169 |
| Matched packages with a discovered notice/copyright/third-party filename at their package root | 5 |

There are no undeclared `license` fields among the **187 matched manifests** in this local installation. This is *not* a license-clearance claim for those packages: a manifest field may be inaccurate, dual-license choices require judgment, and conditions may differ for bundled assets, compiled binaries and actual distribution.

The 129 absent manifests are listed individually in the companion CSV. Many are other-OS/architecture variants (Biome, esbuild, Next SWC and similar), but **absence is recorded as unknown, not automatically considered optional or cleared**. Some may instead be uninstalled peer or optional graph entries. Do not assign them a license by inheritance from a similarly named package.

## Reported license expressions for the matched manifests

| Manifest `license` expression | Pinned packages with matched metadata |
| --- | ---: |
| MIT | 148 |
| Apache-2.0 | 13 |
| ISC | 10 |
| BSD-3-Clause | 7 |
| MIT OR Apache-2.0 | 3 |
| LGPL-3.0-or-later | 2 |
| CC-BY-4.0 | 1 |
| (MIT OR WTFPL) | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| 0BSD | 1 |

**Review priority before any external redistribution:** `@img/sharp-libvips-linux-x64@1.2.4` and `@img/sharp-libvips-linuxmusl-x64@1.2.4` declare `LGPL-3.0-or-later`; `caniuse-lite@1.0.30001803` declares `CC-BY-4.0`. These are metadata observations, not conclusions that obligations are triggered in a specific product. Confirm which packages and assets are actually *distributed* versus present only in development/build environments. Separately review the packages declaring license-choice expressions, binary redistribution, notice files and bundled generated assets.

## Reproduce the metadata inventory

```bash
corepack pnpm install --offline --frozen-lockfile
python3 scripts/dependency_license_inventory.py \
  --output docs/provenance/dependency-license-inventory-2026-10-16.csv
```

The script uses Python's standard library, reads no network resources, and matches exact `(package name, version)` keys against local pnpm package manifests. A different operating system or pnpm installation can change **local metadata availability** and thus this output; the lockfile entries and SHA remain the reference. The per-version CSV records metadata availability, declared manifest license, and *filename-only* checks for top-level license and notice files. The script **does not read or certify license terms**, resolve transitives missing locally, verify attribution text or evaluate compatibility.

## Unresolved evidence and owner decisions

- Verify the exact text and applicability of selected licenses and bundled notices; evaluate build/runtime bundles and platform-specific artifacts, not only package manifests.
- Check project-authored source, UI/text, generated media and the repository's history for actual authorship and rights. Git attribution alone is not ownership proof.
- Review the separate video-edit artifact and any fonts, overlays, code snippets or graphical material before any owner-approved publication (tracked in issue #39).
- Have the owner explicitly choose retained rights or a specific redistribution license; decide what assets are included or excluded. **No license grant, SPDX ID, LICENSE file, public-video release or change of repository visibility is authorized by this inventory.**
- Record the decision in [issue #34](https://github.com/ryjen/config-drift-guard/issues/34). Any eventual LICENSE/NOTICE PR requires separate owner approval.

**Related evidence:** [issue #34](https://github.com/ryjen/config-drift-guard/issues/34); [pinned CSV](dependency-license-inventory-2026-10-16.csv). This report is a bounded automated metadata review, **not legal advice**.
