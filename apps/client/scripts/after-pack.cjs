const fs = require("node:fs/promises");
const path = require("node:path");

exports.default = async function afterPack(context) {
	const projectDir = context.packager.projectDir;
	const source = path.join(projectDir, ".desktop-web");

	if (context.electronPlatformName !== "darwin") {
		const resourcesDir = path.join(context.appOutDir, "resources");
		await fs.rm(path.join(resourcesDir, "desktop-web"), {
			recursive: true,
			force: true,
		});
		await fs.cp(source, path.join(resourcesDir, "desktop-web"), {
			recursive: true,
			force: true,
			dereference: false,
			verbatimSymlinks: true,
		});
		return;
	}

	const destination = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
		"Contents",
		"Resources",
		"desktop-web",
	);
	await fs.rm(destination, { recursive: true, force: true });
	await fs.cp(source, destination, {
		recursive: true,
		force: true,
		dereference: false,
		verbatimSymlinks: true,
	});
};
