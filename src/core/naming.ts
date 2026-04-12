export function branchName(type: string, slug: string): string {
  return `${type}/${slug}`;
}

export function folderName(projectName: string, slug: string): string {
  return `${projectName}.${slug}`;
}

export function workspaceFolderName(slug: string): string {
  return slug;
}
