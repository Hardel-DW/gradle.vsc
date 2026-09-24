import type { Memento } from "vscode";
import type { GradleBuild, GradleProject } from "./GradleBuild.ts";

const STATE_KEY = "hiddenProjects";

export class HiddenProjects {
	private readonly keys: Set<string>;

	constructor(private readonly state: Memento) {
		this.keys = new Set(state.get<string[]>(STATE_KEY, []));
	}

	has(build: GradleBuild, project: GradleProject): boolean {
		return this.keys.has(hiddenKey(build, project));
	}

	set(build: GradleBuild, project: GradleProject, hidden: boolean): Thenable<void> {
		if (hidden) this.keys.add(hiddenKey(build, project));
		else this.keys.delete(hiddenKey(build, project));
		return this.state.update(STATE_KEY, [...this.keys]);
	}
}

function hiddenKey(build: GradleBuild, project: GradleProject): string {
	return `${build.dir}|${project.path}`;
}
