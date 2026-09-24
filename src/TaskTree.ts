import { commands, type Disposable, EventEmitter, type TreeDataProvider, type TreeItem, Uri } from "vscode";
import type { GradleBuild, GradleProject } from "./GradleBuild.ts";
import type { GradleBuilds } from "./GradleBuilds.ts";
import type { HiddenProjects } from "./HiddenProjects.ts";
import type { TaskRunner } from "./TaskRunner.ts";
import { BuildNode, GroupNode, MessageNode, ProjectNode, type TaskIcons, TaskNode } from "./TreeNodes.ts";

export const VIEW_ID = "gradleTasks";
const DEFAULT_GROUP = "other";

export class TaskTree implements TreeDataProvider<TreeItem>, Disposable {
	private showingHidden = false;
	private readonly icons: TaskIcons;
	private readonly changed = new EventEmitter<void>();
	private readonly disposables: Disposable[];
	readonly onDidChangeTreeData = this.changed.event;

	constructor(
		extensionUri: Uri,
		private readonly builds: GradleBuilds,
		private readonly runner: TaskRunner,
		private readonly hidden: HiddenProjects
	) {
		const icon = (name: string) => ({
			light: Uri.joinPath(extensionUri, "resources", "light", name),
			dark: Uri.joinPath(extensionUri, "resources", "dark", name)
		});
		this.icons = { idle: icon("script.svg"), running: icon("loading.svg") };
		this.disposables = [this.changed, builds.onDidChange(() => this.changed.fire()), runner.onDidChange(() => this.changed.fire())];
	}

	async setShowingHidden(showing: boolean): Promise<void> {
		this.showingHidden = showing;
		await commands.executeCommand("setContext", "gradleTasks.showingHidden", showing);
		this.changed.fire();
	}

	async setHidden(node: ProjectNode, hidden: boolean): Promise<void> {
		await this.hidden.set(node.build, node.project, hidden);
		this.changed.fire();
	}

	getTreeItem(node: TreeItem): TreeItem {
		return node;
	}

	async getChildren(node?: TreeItem): Promise<TreeItem[]> {
		if (node instanceof BuildNode) return this.content(node.build);
		if (node instanceof ProjectNode) return this.projectContent(node);
		if (node instanceof GroupNode) return this.groupContent(node);
		const builds = await this.builds.all();
		return builds.length === 1 ? this.content(builds[0]) : builds.map((build) => new BuildNode(build));
	}

	dispose(): void {
		for (const disposable of this.disposables) disposable.dispose();
	}

	private content(build: GradleBuild): TreeItem[] {
		if (build.project) return this.visible(build, build.project);
		if (build.error) return [new MessageNode("Failed to load tasks", "error", build.error)];
		return [new MessageNode("Loading tasks", "loading~spin")];
	}

	private visible(build: GradleBuild, project: GradleProject): ProjectNode[] {
		const hidden = this.hidden.has(build, project);
		if (hidden && !this.showingHidden) return project.children.flatMap((child) => this.visible(build, child));
		return [new ProjectNode(build, project, hidden)];
	}

	private projectContent({ build, project }: ProjectNode): TreeItem[] {
		const groups = [...Map.groupBy(project.tasks, (task) => task.group ?? DEFAULT_GROUP)]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, tasks]) => new GroupNode(build, project, tasks, name));
		return [...groups, ...project.children.flatMap((child) => this.visible(build, child))];
	}

	private groupContent({ build, project, tasks }: GroupNode): TaskNode[] {
		return tasks
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((task) => {
				const path = project.path === ":" ? `:${task.name}` : `${project.path}:${task.name}`;
				return new TaskNode(build, path, task, this.runner.isRunning(build, path), this.icons);
			});
	}
}
