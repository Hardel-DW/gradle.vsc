import { commands, type ExtensionContext, window } from "vscode";
import { GradleBuilds } from "./GradleBuilds.ts";
import { HiddenProjects } from "./HiddenProjects.ts";
import { TaskRunner } from "./TaskRunner.ts";
import { TaskTree, VIEW_ID } from "./TaskTree.ts";
import type { ProjectNode, TaskNode } from "./TreeNodes.ts";

export function activate(context: ExtensionContext): void {
	const log = window.createOutputChannel("Gradle Tasks", { log: true });
	const builds = new GradleBuilds(context, log);
	const runner = new TaskRunner();
	const tree = new TaskTree(context.extensionUri, builds, runner, new HiddenProjects(context.workspaceState));
	context.subscriptions.push(
		log,
		builds,
		runner,
		tree,
		window.registerTreeDataProvider(VIEW_ID, tree),
		commands.registerCommand("gradleTasks.reload", () => builds.reloadAll()),
		commands.registerCommand("gradleTasks.showHidden", () => tree.setShowingHidden(true)),
		commands.registerCommand("gradleTasks.hideHidden", () => tree.setShowingHidden(false)),
		commands.registerCommand("gradleTasks.hide", (node: ProjectNode) => tree.setHidden(node, true)),
		commands.registerCommand("gradleTasks.unhide", (node: ProjectNode) => tree.setHidden(node, false)),
		commands.registerCommand("gradleTasks.run", (node: TaskNode) => runner.run(node.build, node.path)),
		commands.registerCommand("gradleTasks.debug", (node: TaskNode) => runner.debug(node.build, node.path))
	);
}
