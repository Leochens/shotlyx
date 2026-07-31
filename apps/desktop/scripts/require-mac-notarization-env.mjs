const credentialSets = [
	{
		label: "App Store Connect API key",
		vars: ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
	},
	{
		label: "Apple ID app-specific password",
		vars: ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
	},
	{
		label: "notarytool keychain profile",
		vars: ["APPLE_KEYCHAIN_PROFILE"],
	},
];

if (process.platform !== "darwin") {
	process.exit(0);
}

const matchingSet = credentialSets.find((set) =>
	set.vars.every((name) => Boolean(process.env[name]))
);

if (matchingSet) {
	console.log(`Using ${matchingSet.label} credentials for macOS notarization.`);
	process.exit(0);
}

const missingGroups = credentialSets
	.map((set) => `- ${set.label}: ${set.vars.join(", ")}`)
	.join("\n");

console.error(`
Refusing to build a signed macOS installer without notarization credentials.

Gatekeeper rejects Developer ID apps that are signed but not notarized, which
makes the installed app fail to open on user machines.

Set one of these credential groups before running dist:mac:
${missingGroups}

For a local-only package that is not suitable for distribution, run:
  bun run --cwd apps/desktop dist:mac:unsigned
`);

process.exit(1);
