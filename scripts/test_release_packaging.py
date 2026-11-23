#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
# SPDX-License-Identifier: Apache-2.0

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("package-release.sh")


class ReleasePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="grengin-package-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.frontend = self.root / "frontend"
        self.backend = self.root / "backend"
        for repo in (self.frontend, self.backend):
            repo.mkdir()
            self.git(repo, "init", "-q")
            self.git(repo, "config", "user.name", "Release test")
            self.git(repo, "config", "user.email", "release@example.invalid")
            (repo / "LICENSE").write_text("Apache-2.0\n")
            (repo / "NOTICE").write_text("Release fixture\n")
        (self.backend / "Cargo.toml").write_text('[package]\nversion = "0.9.13"\n')
        self.commit(self.backend)
        self.backend_sha = self.git(self.backend, "rev-parse", "HEAD").strip()
        (self.frontend / "scripts").mkdir()
        shutil.copy2(SCRIPT, self.frontend / "scripts/package-release.sh")
        (self.frontend / "package.json").write_text('{\n  "version": "0.9.13",\n  "private": true\n}\n')
        (self.frontend / "release").mkdir()
        (self.frontend / "release/backend-commit.txt").write_text(self.backend_sha + "\n")
        self.image = "ghcr.io/grengin-oss/grengin-api@sha256:" + "a" * 64
        (self.frontend / "release/backend-image.txt").write_text(self.image + "\n")
        self.commit(self.frontend)
        (self.frontend / "dist").mkdir()
        (self.frontend / "dist/index.html").write_text("<h1>Grengin</h1>\n")
        self.env = dict(os.environ, BACKEND_SOURCE_DIR=str(self.backend),
                        RELEASE_OUTPUT_DIR=str(self.root / "output"))
        self.binaries = {}
        for arch in ("amd64", "arm64"):
            rootfs = self.root / arch
            binaries = rootfs / "usr/local/bin"
            binaries.mkdir(parents=True)
            self.binaries[arch] = binaries
            self.binary(binaries / "grengin-api", arch)
            self.env[f"BACKEND_{arch.upper()}_ROOTFS"] = str(rootfs)

    def git(self, repo, *args):
        return subprocess.check_output(["git", "-C", str(repo), *args], text=True)

    def commit(self, repo):
        self.git(repo, "add", ".")
        self.git(repo, "commit", "-qm", "Fixture")

    def binary(self, path, contents="fixture"):
        path.write_text(contents)
        path.chmod(0o755)

    def package(self, version="v0.9.13", succeeds=True):
        result = subprocess.run(["bash", str(self.frontend / "scripts/package-release.sh"), version],
                                env=self.env, text=True, capture_output=True)
        if succeeds:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.root / "output").exists())
        return result

    def bundle(self, arch):
        path = self.root / f"output/grengin-0.9.13-linux-{arch}.tar.gz"
        with tarfile.open(path) as archive:
            prefix = f"grengin-0.9.13-linux-{arch}"
            manifest = json.load(archive.extractfile(prefix + "/RELEASE-MANIFEST.json"))
            members = {member.name: member for member in archive.getmembers()}
            return manifest, members

    def test_retired_sqlx_is_not_required_and_migration_cli_is_packaged(self):
        for arch, binaries in self.binaries.items():
            self.binary(binaries / "grengin-migrate", arch)
        self.package()
        for arch in self.binaries:
            manifest, members = self.bundle(arch)
            self.assertEqual(manifest["platform"]["architecture"], arch)
            self.assertEqual(manifest["backend"]["commit"], self.backend_sha)
            self.assertEqual(manifest["backend"]["image"], self.image)
            self.assertEqual(manifest["backend"]["migration_path"], "bin/grengin-migrate")
            self.assertNotIn("sqlx_mcp_path", manifest["backend"])
            self.assertEqual(members[f"grengin-0.9.13-linux-{arch}/bin/grengin-api"].mode, 0o755)
            self.assertIn(f"grengin-0.9.13-linux-{arch}/bin/grengin-migrate", members)

    def test_legacy_sqlx_is_included_only_for_the_architecture_that_has_it(self):
        self.binary(self.binaries["amd64"] / "sqlx-mcp")
        self.package()
        amd64, members = self.bundle("amd64")
        arm64, _ = self.bundle("arm64")
        self.assertEqual(amd64["backend"]["sqlx_mcp_path"], "bin/sqlx-mcp")
        self.assertIn("grengin-0.9.13-linux-amd64/bin/sqlx-mcp", members)
        self.assertNotIn("sqlx_mcp_path", arm64["backend"])
        self.assertNotIn("migration_path", arm64["backend"])

    def test_missing_or_nonexecutable_api_refuses_before_creating_assets(self):
        self.binaries["arm64"].joinpath("grengin-api").unlink()
        self.assertIn("Backend binary not found", self.package(succeeds=False).stderr)
        self.binary(self.binaries["arm64"] / "grengin-api")
        self.binaries["arm64"].joinpath("grengin-api").chmod(0o644)
        self.package(succeeds=False)

    def test_mismatched_version_refuses_before_creating_assets(self):
        self.package("v0.9.14", succeeds=False)

    def test_wrong_backend_commit_refuses_before_creating_assets(self):
        (self.backend / "another-file").write_text("not the pinned source\n")
        self.commit(self.backend)
        self.package(succeeds=False)

    def test_dirty_frontend_refuses_before_creating_assets(self):
        (self.frontend / "NOTICE").write_text("uncommitted\n")
        self.package(succeeds=False)

    def test_source_archives_and_checksums_match_packaged_bytes(self):
        self.package()
        output = self.root / "output"
        for line in (output / "grengin-0.9.13-SHA256SUMS.txt").read_text().splitlines():
            digest, name = line.split()
            self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
        with tarfile.open(output / "grengin-0.9.13-source.tar.gz") as archive:
            manifest = json.load(archive.extractfile("grengin-0.9.13-source/RELEASE-MANIFEST.json"))
            self.assertEqual(manifest["frontend"]["commit"], self.git(self.frontend, "rev-parse", "HEAD").strip())
            self.assertEqual(manifest["backend"]["commit"], self.backend_sha)
        with zipfile.ZipFile(output / "grengin-0.9.13-source.zip") as archive:
            self.assertIn("grengin-0.9.13-source/backend/Cargo.toml", archive.namelist())


if __name__ == "__main__":
    unittest.main()
