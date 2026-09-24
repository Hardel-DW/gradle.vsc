import { dirname, sep } from "node:path";
import { type Disposable, EventEmitter, type ExtensionContext, type LogOutputChannel, Uri, window, workspace } from "vscode";
import { GradleBuild } from "./GradleBuild.ts";
import { VIEW_ID } from "./TaskTree.ts";

const SETTINGS_GLOB = "**/{settings.gradle,settings.gradle.kts}";
const EXCLUDE_GLOB = "**/{node_modules,build,.gradle}/**";

export class GradleBuilds implements Disposable {
	private builds: readonly GradleBuild[] = [];
	private discovery: Promise<void>;
	private readonly initScript: string;
	private readonly changed = new EventEmitter<void>();
	private readonly disposables: Disposable[];
	readonly onDidChange = this.changed.event;

	constructor(
		private readonly context: ExtensionContext,
		private readonly log: LogOutputChannel
	) {
		this.initScript = context.asAbsolutePath("resources/tasks.gradle");
		const watcher = workspace.createFileSystemWatcher(SETTINGS_GLOB);
		this.disposables = [
			watcher,
			this.changed,
			watcher.onDidCreate(() => this.discover()),
			watcher.onDidDelete(() => this.discover()),
			watcher.onDidChange((uri) => this.reload(dirname(uri.fsPath))),
			workspace.onDidChangeWorkspaceFolders(() => this.discover())
		];
		this.discovery = this.scan();
	}

	async all(): Promise<readonly GradleBuild[]> {
		await this.discovery;
		return this.builds;
	}

	async reloadAll(): Promise<void> {
		await Promise.all(this.builds.map((build) => this.load(build)));
	}

	dispose(): void {
		for (const disposable of this.disposables) disposable.dispose();
	}

	private discover(): void {
		this.discovery = this.discovery.then(() => this.scan());
	}

	private async scan(): Promise<void> {
		const files = await workspace.findFiles(SETTINGS_GLOB, EXCLUDE_GLOB);
		const dirs = [...new Set(files.map((file) => dirname(file.fsPath)))].sort();
		const roots = dirs.filter((dir, index) => !dirs.slice(0, index).some((parent) => dir.startsWith(parent + sep)));
		const previous = new Map(this.builds.map((build) => [build.dir, build]));
		this.builds = roots.map((dir) => previous.get(dir) ?? this.create(dir));
		for (const build of previous.values()) {
			if (!roots.includes(build.dir)) await build.forget();
		}
		this.changed.fire();
	}

	private create(dir: string): GradleBuild {
		const folder = workspace.getWorkspaceFolder(Uri.file(dir))!;
		const build = new GradleBuild(dir, folder, this.context.workspaceState);
		if (!build.project) void this.load(build);
		return build;
	}

	private reload(dir: string): void {
		const build = this.builds.find((candidate) => candidate.dir === dir);
		if (build) void this.load(build);
	}

	private async load(build: GradleBuild): Promise<void> {
		await window.withProgress({ location: { viewId: VIEW_ID } }, () => build.load(this.initScript));
		if (build.error) this.log.error(`${build.dir}\n${build.error}`);
		this.changed.fire();
	}
}
