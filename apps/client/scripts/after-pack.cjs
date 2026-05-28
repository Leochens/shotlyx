const fs = require("node:fs/promises");
const path = require("node:path");

exports.default = async function afterPack(context) {
	const projectDir = context.packager.projectDir;
	const bundles = [
		{ source: path.join(projectDir, ".desktop-web"), name: "desktop-web" },
		{ source: path.join(projectDir, ".desktop-api"), name: "desktop-api" },
	];

	if (context.electronPlatformName !== "darwin") {
		const resourcesDir = path.join(context.appOutDir, "resources");
		for (const bundle of bundles) {
			await fs.rm(path.join(resourcesDir, bundle.name), {
				recursive: true,
				force: true,
			});
			await fs.cp(bundle.source, path.join(resourcesDir, bundle.name), {
				recursive: true,
				force: true,
				dereference: false,
				verbatimSymlinks: true,
			});
		}
		return;
	}

	const resourcesDir = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
		"Contents",
		"Resources",
	);
	for (const bundle of bundles) {
		const destination = path.join(resourcesDir, bundle.name);
		await fs.rm(destination, { recursive: true, force: true });
		await fs.cp(bundle.source, destination, {
			recursive: true,
			force: true,
			dereference: false,
			verbatimSymlinks: true,
		});
	}
};
