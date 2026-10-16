#!/usr/bin/env python3
"""Inventory pinned pnpm package manifest licenses from an offline installation.

This is evidence gathering, not a license-grant, legal compliance determination,
or automatic NOTICE generator. No network requests are made.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

LOCK_PACKAGE_ENTRY = re.compile(r"^  ([^\s].+):$", re.MULTILINE)
NOTICE_NAME = re.compile(r"(notice|copyright|third[._-]?party)", re.IGNORECASE)
LICENSE_NAME = re.compile(r"(licen[sc]e|copying)", re.IGNORECASE)
ROW_FIELDS = (
    "locked_package", "name", "version", "metadata_status",
    "declared_license", "license_files", "notice_files",
)


def locked_packages(lock_text: str) -> list[tuple[str, str, str]]:
    start = lock_text.find("\npackages:\n")
    end = lock_text.find("\nsnapshots:\n", start)
    if start < 0 or end < 0:
        raise ValueError("Expected pnpm v9 packages and snapshots sections")
    entries = []
    for match in LOCK_PACKAGE_ENTRY.finditer(lock_text[start:end]):
        key = match.group(1).strip("'\"")
        if "@" not in key:
            raise ValueError(f"Cannot parse versioned package: {key}")
        name, version = key.rsplit("@", 1)
        if not name or not version:
            raise ValueError(f"Missing name/version: {key}")
        entries.append((key, name, version))
    if not entries or len({key for key, _, _ in entries}) != len(entries):
        raise ValueError("Lockfile package list is empty or contains duplicates")
    return sorted(entries)


def installed_metadata(root: Path) -> dict[tuple[str, str], Path]:
    installed: dict[tuple[str, str], Path] = {}
    store = root / "node_modules" / ".pnpm"
    if not store.is_dir():
        raise FileNotFoundError(f"Install the exact lockfile first: {store}")
    for pattern in ("*/node_modules/*/package.json", "*/node_modules/@*/*/package.json"):
        for path in store.glob(pattern):
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            name, version = manifest.get("name"), manifest.get("version")
            if isinstance(name, str) and isinstance(version, str):
                installed[(name, version)] = path
    return installed


def make_rows(root: Path) -> tuple[list[dict[str, str]], str]:
    lock_bytes = (root / "pnpm-lock.yaml").read_bytes()
    lock_sha = hashlib.sha256(lock_bytes).hexdigest()
    installed = installed_metadata(root)
    rows = []
    for key, name, version in locked_packages(lock_bytes.decode("utf-8")):
        path = installed.get((name, version))
        lic = ""
        license_files = []
        notice_files = []
        if path is not None:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            value = metadata.get("license")
            lic = value if isinstance(value, str) else (
                json.dumps(value, sort_keys=True) if value is not None else ""
            )
            for child in path.parent.iterdir():
                if not child.is_file():
                    continue
                if LICENSE_NAME.search(child.name):
                    license_files.append(child.name)
                if NOTICE_NAME.search(child.name):
                    notice_files.append(child.name)
        rows.append({
            "locked_package": key,
            "name": name,
            "version": version,
            "metadata_status": "matched_local_install" if path else "not_present_in_local_install",
            "declared_license": lic,
            "license_files": ";".join(sorted(license_files)),
            "notice_files": ";".join(sorted(notice_files)),
        })
    return rows, lock_sha


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows, lock_sha = make_rows(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=ROW_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    stats = Counter(r["metadata_status"] for r in rows)
    licenses = Counter(r["declared_license"] for r in rows if r["metadata_status"] == "matched_local_install")
    print(json.dumps({
        "lock_sha256": lock_sha,
        "total_locked": len(rows),
        "metadata_status": stats,
        "licenses": licenses,
        "license_file_present": sum(bool(r["license_files"]) for r in rows),
        "notice_file_present": sum(bool(r["notice_files"]) for r in rows),
    }, indent=2))


if __name__ == "__main__":
    main()
