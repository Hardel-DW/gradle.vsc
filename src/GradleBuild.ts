import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { Memento, WorkspaceFolder } from "vscode";

const MARKER = "GRADLE_TASKS_JSON ";
const WRAPPER = process.platform === "win32" ? "gradlew.bat" : "gradlew";
const MAX_OUTPUT = 64 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export interface GradleTask {
	readonly name: string;
	readonly group: string | null;
	readonly description: string | null;
	readonly debuggable: boolean;
}

export interface GradleProject {
	readonly path: string;
	readonly name: string;
	readonly buildFile: string;
	readonly tasks: readonly GradleTask[];
	readonly children: readonly GradleProject[];
}

export class GradleBuild {
	readonly name: string;
	private loaded: GradleProject | undefined;
	private failure: string | undefined;
	private loading: Promise<void> | undefined;

	constructor(
		readonly dir: string,
		readonly folder: WorkspaceFolder,
		private readonly cache: Memento
	) {
		this.name = basename(dir);
		this.loaded = cache.get(this.cacheKey);
	}

	get project(): GradleProject | undefined {
		return this.loaded;
	}

	get error(): string | undefined {
		return this.failure;
	}

	get command(): string {
		const wrapper = join(this.dir, WRAPPER);
		return existsSync(wrapper) ? wrapper : "gradle";
	}

	load(initScript: string): Promise<void> {
		this.loading ??= this.fetch(initScript).finally(() => {
			this.loading = undefined;
		});
		return this.loading;
	}

	forget(): Thenable<void> {
		return this.cache.update(this.cacheKey, undefined);
	}

	private get cacheKey(): string {
		return `tasks:${this.dir}`;
	}

	private async fetch(initScript: string): Promise<void> {
		const args = ["--quiet", "--dry-run", "--no-configuration-cache", "--init-script", initScript, "help"];
		try {
			const { stdout } = await execFileAsync(quote(this.command), args.map(quote), {
				cwd: this.dir,
				shell: true,
				maxBuffer: MAX_OUTPUT
			});
			const line = stdout.split(/\r?\n/).find((output) => output.startsWith(MARKER));
			if (!line) throw new Error(`Gradle did not print the task list.\n${stdout}`);
			this.loaded = JSON.parse(line.slice(MARKER.length));
			this.failure = undefined;
		} catch (error) {
			this.loaded = undefined;
			this.failure = error instanceof Error ? error.message : String(error);
		}
		await this.cache.update(this.cacheKey, this.loaded);
	}
}

function quote(arg: string): string {
	return `"${arg}"`;
}
