# The git tag is the version

Commitizen reads and writes the version as a git tag (`version_provider = "scm"`), not in `package.json`, and the changelog lives in GitHub Release notes rather than a committed `CHANGELOG.md`. Committing a bumped `package.json` from CI would mean a bot token able to push past `master`'s branch protection; with tags only, the release job needs nothing beyond the default `GITHUB_TOKEN`. The build stamps the tag into the app, so the `version` field in `package.json` is a placeholder and should not be edited.
