import { type IconPath, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import type { GradleBuild, GradleProject, GradleTask } from "./GradleBuild.ts";

export interface TaskIcons {
	readonly idle: IconPath;
	readonly running: IconPath;
}

export class BuildNode extends TreeItem {
	constructor(readonly build: GradleBuild) {
		super(build.name, TreeItemCollapsibleState.Expanded);
		this.id = `build:${build.dir}`;
		this.resourceUri = Uri.file(build.dir);
		this.iconPath = ThemeIcon.Folder;
		this.tooltip = build.dir;
	}
}

export class ProjectNode extends TreeItem {
	constructor(
		readonly build: GradleBuild,
		readonly project: GradleProject,
		hidden: boolean
	) {
		super(project.name, TreeItemCollapsibleState.Collapsed);
		this.id = `project:${build.dir}|${project.path}`;
		this.resourceUri = Uri.file(project.buildFile);
		this.iconPath = ThemeIcon.File;
		this.contextValue = hidden ? "hiddenProject" : "project";
		this.description = hidden ? "hidden" : undefined;
	}
}

export class GroupNode extends TreeItem {
	constructor(
		readonly build: GradleBuild,
		readonly project: GradleProject,
		readonly tasks: readonly GradleTask[],
		name: string
	) {
		super(name, TreeItemCollapsibleState.Collapsed);
		this.id = `group:${build.dir}|${project.path}|${name}`;
		this.iconPath = new ThemeIcon("file-submodule");
	}
}

export class TaskNode extends TreeItem {
	constructor(
		readonly build: GradleBuild,
		readonly path: string,
		task: GradleTask,
		running: boolean,
		icons: TaskIcons
	) {
		super(task.name, TreeItemCollapsibleState.None);
		this.id = `task:${build.dir}|${path}`;
		this.tooltip = task.description ?? task.name;
		this.iconPath = running ? icons.running : icons.idle;
		this.contextValue = running ? "runningTask" : task.debuggable ? "debuggableTask" : "task";
	}
}

export class MessageNode extends TreeItem {
	constructor(label: string, icon: string, tooltip?: string) {
		super(label, TreeItemCollapsibleState.None);
		this.iconPath = new ThemeIcon(icon);
		this.tooltip = tooltip;
	}
}
