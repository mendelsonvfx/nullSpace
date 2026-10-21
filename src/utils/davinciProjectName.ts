export interface NamedProject {
  id: string;
  name: string;
  category?: string;
}

/**
 * Name of the project's Resolve project (in the "nullSpace" Project Manager folder): the plain project name,
 * or "<name> (<category>)" when another nullSpace project has the same name
 */
export function davinciProjectName(project: NamedProject, allProjects: NamedProject[]): string {
  const key = project.name.trim().toLowerCase();
  const duplicate = allProjects.some(p => p.id !== project.id && p.name.trim().toLowerCase() === key);
  if (!duplicate) return project.name;
  return `${project.name} (${project.category || project.id.slice(0, 4)})`;
}
