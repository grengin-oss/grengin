# Grengin

Grengin is an AI-native business growth engine. It simplifies a well-governed access to the most important AI tools, while collaborating with the other classic and AI tools to work as an assistant for all.

## Releases

Version tags publish complete `grengin-<version>.tar.gz` and `grengin-<version>.zip`
bundles. Each bundle contains:

- `frontend/`: frontend source from the tagged Grengin commit
- `frontend-dist/`: production frontend build
- `backend/`: backend source from the commit pinned in `release/backend-commit.txt`
- `RELEASE-MANIFEST.json`: repositories, versions, and exact commit SHAs

SHA-256 checksums are attached to the same GitHub release. The backend is pinned
to an immutable commit so rebuilding a release never depends on the current
state of `grengin-api/main`.

## License

This project uses a **dual-license model** designed to keep the software free for individuals, small businesses, and non-commercial use, while requiring larger commercial entities to obtain a paid license.

### Community Edition (Free)

**You can use Grengin for free if:**
- Your organization has less than **$5M USD** in annual revenue, OR
- You're using it for **non-commercial purposes** (personal, educational, research), OR
- You're using it for **internal tools** that don't directly generate revenue, OR
- You're an **individual**, **non-profit**, or **educational institution**

### Commercial License Required

**You need a commercial license if:**
- Your organization has **$5M+ annual revenue**, AND
- You're using Grengin for commercial purposes

📄 **[Read the full license](LICENSE.md)** | 💬 **[License FAQ](LICENSE_FAQ.md)** | 💼 **[Commercial licensing](LICENSE_ENTERPRISE.md)**

**Questions?** Contact licensing@grengin.com

---

## Contributing

We welcome contributions from the community! By contributing to Grengin, you agree to license your contributions under our dual-license model.

- **Small contributions** (bug fixes, typos, minor improvements) can be submitted directly via pull request
- **Significant contributions** (new features, major changes) require signing our [Contributor License Agreement](CONTRIBUTOR_LICENSE.md)

You retain full ownership of your contributions - the CLA simply grants us the rights to include them in both Community and Enterprise editions.

**[Read the full CLA](CONTRIBUTOR_LICENSE.md)**

---

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
