import { connect } from "node:net";
import { setTimeout } from "node:timers/promises";
import { type Disposable, debug, EventEmitter, ShellExecution, Task, type TaskDefinition, TaskPanelKind, tasks } from "vscode";
import type { GradleBuild } from "./GradleBuild.ts";

const TASK_TYPE = "gradleTasks";
const DEBUG_PORT = 5005;
const DEBUG_POLL_MS = 500;

interface GradleTaskDefinition extends TaskDefinition {
	readonly build: string;
	readonly task: string;
	readonly args: readonly string[];
}

export class TaskRunner implements Disposable {
	private readonly running = new Set<string>();
	private readonly changed = new EventEmitter<void>();
	private readonly disposables: Disposable[];
	readonly onDidChange = this.changed.event;

	constructor() {
		this.disposables = [
			this.changed,
			tasks.onDidStartTask((event) => this.track(event.execution.task, true)),
			tasks.onDidEndTask((event) => this.track(event.execution.task, false))
		];
	}

	isRunning(build: GradleBuild, task: string): boolean {
		return this.running.has(runningKey(build.dir, task));
	}

	async run(build: GradleBuild, task: string): Promise<void> {
		await tasks.executeTask(this.create(build, task, []));
	}

	async debug(build: GradleBuild, task: string): Promise<void> {
		await tasks.executeTask(this.create(build, task, ["--debug-jvm"]));
		do {
			await setTimeout(DEBUG_POLL_MS);
			if (await isListening(DEBUG_PORT)) {
				await debug.startDebugging(build.folder, {
					type: "intellij_jvm",
					request: "attach",
					name: task,
					hostName: "localhost",
					port: DEBUG_PORT
				});
				return;
			}
		} while (this.isRunning(build, task));
	}

	dispose(): void {
		for (const disposable of this.disposables) disposable.dispose();
	}

	private create(build: GradleBuild, task: string, args: string[]): Task {
		const definition: GradleTaskDefinition = { type: TASK_TYPE, build: build.dir, task, args };
		const execution = new ShellExecution(build.command, [task, ...args], { cwd: build.dir });
		const created = new Task(definition, build.folder, [task, ...args].join(" "), "gradle", execution);
		created.presentationOptions = { panel: TaskPanelKind.Dedicated, clear: true };
		return created;
	}

	private track(task: Task, running: boolean): void {
		if (task.definition.type !== TASK_TYPE) return;
		const { build, task: path } = task.definition as GradleTaskDefinition;
		if (running) this.running.add(runningKey(build, path));
		else this.running.delete(runningKey(build, path));
		this.changed.fire();
	}
}

function runningKey(build: string, task: string): string {
	return `${build}|${task}`;
}

function isListening(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect(port, "localhost")
			.once("connect", () => {
				socket.destroy();
				resolve(true);
			})
			.once("error", () => resolve(false));
	});
}
