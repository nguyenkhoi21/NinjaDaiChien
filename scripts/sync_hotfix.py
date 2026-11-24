#!/usr/bin/env python3
"""
Sync Android hotfix delta files from upstream into a local mirror directory.
Uses Python 3 standard library only.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

DEFAULT_UPSTREAM = "http://103.90.227.124:8080/static/hotfix/android/"
DEFAULT_REPO = "nguyenkhoi21/NinjaDaiChien"
DEFAULT_BRANCH = "hotfix-mirror"


def fetch_bytes(url, timeout=20, retries=3):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "NinjaDaiChien-Hotfix-Sync/1.0"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} for {url}")
                return resp.read()
        except Exception as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(min(2 * attempt, 5))
    raise RuntimeError(f"Failed to fetch {url} after {retries} attempts: {last_err}")


def fetch_json(url, timeout=20, retries=3):
    raw = fetch_bytes(url, timeout=timeout, retries=retries)
    return json.loads(raw.decode("utf-8"))


def md5_bytes(data):
    return hashlib.md5(data).hexdigest().lower()


def md5_file(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest().lower()


def compute_delta(base_assets, remote_assets):
    delta = {}
    for rel_path, meta in remote_assets.items():
        base_meta = base_assets.get(rel_path)
        if not base_meta or str(base_meta.get("md5", "")).lower() != str(meta.get("md5", "")).lower():
            delta[rel_path] = meta
    return delta


def download_and_verify(upstream_base, hotfix_dir, rel_path, meta):
    expected_md5 = str(meta.get("md5", "")).lower()
    url = upstream_base.rstrip("/") + "/" + rel_path.lstrip("/")
    data = fetch_bytes(url, timeout=30, retries=3)
    actual_md5 = md5_bytes(data)
    if expected_md5 and actual_md5 != expected_md5:
        raise RuntimeError(
            f"MD5 mismatch for {rel_path}: expected {expected_md5}, got {actual_md5}"
        )
    dest = os.path.join(hotfix_dir, *rel_path.split("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)
    return rel_path, len(data)


def main():
    parser = argparse.ArgumentParser(description="Sync Android hotfix delta to mirror directory.")
    parser.add_argument("--upstream", default=DEFAULT_UPSTREAM, help="Upstream hotfix base URL")
    parser.add_argument("--base", default="scripts/base_project.manifest", help="Path to base project.manifest")
    parser.add_argument("--mirror-dir", required=True, help="Target mirror repository directory")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="GitHub owner/repo")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help="GitHub mirror branch")
    parser.add_argument("--dry-run", action="store_true", help="Compute delta without writing files")
    parser.add_argument("--force", action="store_true", help="Force re-sync even if version matches")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent download workers")
    args = parser.parse_args()

    upstream_base = args.upstream.rstrip("/") + "/"
    if not os.path.isfile(args.base):
        print(f"[!] Base manifest not found: {args.base}", file=sys.stderr)
        return 1

    with open(args.base, "r", encoding="utf-8") as f:
        base_manifest = json.load(f)
    base_assets = base_manifest.get("assets", {})

    print(f"[*] Fetching manifests from {upstream_base}...")
    remote_version = fetch_json(upstream_base + "version.manifest")
    remote_project = fetch_json(upstream_base + "project.manifest")
    target_ver = str(remote_project.get("version") or remote_version.get("version") or "")
    remote_assets = remote_project.get("assets", {})
    if not target_ver or not remote_assets:
        print("[!] Invalid remote manifest (missing version or assets)", file=sys.stderr)
        return 1

    delta = compute_delta(base_assets, remote_assets)
    total_bytes = sum(int(m.get("size", 0) or 0) for m in delta.values())
    print(
        f"[*] Base version: {base_manifest.get('version')} | Upstream version: {target_ver} | "
        f"Delta files: {len(delta)} ({total_bytes / 1024 / 1024:.2f} MB)"
    )

    hotfix_dir = os.path.join(args.mirror_dir, "hotfix", "android")
    local_ver_path = os.path.join(hotfix_dir, "version.manifest")
    local_proj_path = os.path.join(hotfix_dir, "project.manifest")

    # Check if existing mirror already matches target version and all delta MD5s
    to_download = {}
    for rel_path, meta in delta.items():
        dest = os.path.join(hotfix_dir, *rel_path.split("/"))
        expected_md5 = str(meta.get("md5", "")).lower()
        if args.force or not os.path.isfile(dest):
            to_download[rel_path] = meta
        elif expected_md5 and md5_file(dest) != expected_md5:
            to_download[rel_path] = meta

    existing_ver = ""
    if os.path.isfile(local_ver_path):
        try:
            with open(local_ver_path, "r", encoding="utf-8") as f:
                existing_ver = str(json.load(f).get("version", ""))
        except Exception:
            existing_ver = ""

    if not args.force and existing_ver == target_ver and not to_download and os.path.isfile(local_proj_path):
        print(f"[OK] Mirror already up-to-date at version {target_ver} ({len(delta)} delta files verified).")
        return 0

    if args.dry_run:
        print(f"[DRY-RUN] Would download {len(to_download)} files ({sum(int(m.get('size', 0) or 0) for m in to_download.values()) / 1024 / 1024:.2f} MB).")
        return 0

    os.makedirs(hotfix_dir, exist_ok=True)
    if to_download:
        print(f"[*] Downloading {len(to_download)} files with {args.workers} workers...")
        errors = []
        done_count = 0
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = {
                pool.submit(download_and_verify, upstream_base, hotfix_dir, rel_path, meta): rel_path
                for rel_path, meta in to_download.items()
            }
            for fut in as_completed(futures):
                rel_path = futures[fut]
                try:
                    _, sz = fut.result()
                    done_count += 1
                    if done_count % 20 == 0 or done_count == len(to_download):
                        print(f"    [{done_count}/{len(to_download)}] {rel_path} ({sz} bytes)")
                except Exception as exc:
                    errors.append(f"{rel_path}: {exc}")
        if errors:
            print(f"[!] {len(errors)} file(s) failed to download/verify:", file=sys.stderr)
            for e in errors[:20]:
                print("   ", e, file=sys.stderr)
            return 1

    # Remove stale files no longer in delta
    expected_rel_set = {os.path.normpath(os.path.join(*p.split("/"))) for p in delta.keys()}
    expected_rel_set.add("version.manifest")
    expected_rel_set.add("project.manifest")
    removed = 0
    for root, _, files in os.walk(hotfix_dir):
        for fname in files:
            full = os.path.join(root, fname)
            rel = os.path.normpath(os.path.relpath(full, hotfix_dir))
            if rel not in expected_rel_set:
                os.remove(full)
                removed += 1
    if removed:
        print(f"[*] Removed {removed} stale file(s) from mirror.")

    mirror_package_url = f"https://raw.githubusercontent.com/{args.repo}/{args.branch}/hotfix/android/"
    out_project = dict(remote_project)
    out_project["packageUrl"] = mirror_package_url
    out_project["remoteManifestUrl"] = mirror_package_url + "project.manifest"
    out_project["remoteVersionUrl"] = mirror_package_url + "version.manifest"

    out_version = dict(remote_version)
    out_version["packageUrl"] = mirror_package_url
    out_version["remoteManifestUrl"] = mirror_package_url + "project.manifest"
    out_version["remoteVersionUrl"] = mirror_package_url + "version.manifest"

    with open(local_proj_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out_project, f, ensure_ascii=False, separators=(",", ":"))
    with open(local_ver_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out_version, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"[+] Successfully synced version {target_ver} -> {hotfix_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
