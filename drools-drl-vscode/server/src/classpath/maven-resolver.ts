/**
 * Maven classpath resolver.
 *
 * Parses pom.xml to extract dependency coordinates, then locates
 * the corresponding JARs in the local Maven repository (~/.m2/repository).
 * Also includes target/classes/ for the project's own compiled classes.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface MavenDependency {
  groupId: string;
  artifactId: string;
  version: string;
  scope: string;
}

/**
 * Resolve classpath entries from a Maven pom.xml file.
 * Returns an array of absolute paths to JAR files and class directories.
 */
export async function resolveMavenClasspath(
  pomPath: string
): Promise<string[]> {
  const pomDir = path.dirname(pomPath);
  const classpath: string[] = [];

  // 1. Include project's own compiled classes
  const targetClasses = path.join(pomDir, "target", "classes");
  if (fs.existsSync(targetClasses)) {
    classpath.push(targetClasses);
  }

  // 2. Parse pom.xml for dependencies
  const pomContent = fs.readFileSync(pomPath, "utf-8");
  const dependencies = parsePomDependencies(pomContent);

  // 3. Resolve each dependency to a JAR path in ~/.m2/repository
  const m2Repo = getM2RepositoryPath();
  for (const dep of dependencies) {
    // Only resolve compile and provided scope dependencies
    if (dep.scope === "test" || dep.scope === "runtime") continue;

    const jarPath = resolveJarPath(m2Repo, dep);
    if (jarPath && fs.existsSync(jarPath)) {
      classpath.push(jarPath);
    }
  }

  // 4. For multi-module projects, also scan sibling modules
  const modules = parseModules(pomContent);
  for (const moduleName of modules) {
    const moduleClasses = path.join(pomDir, moduleName, "target", "classes");
    if (fs.existsSync(moduleClasses)) {
      classpath.push(moduleClasses);
    }
  }

  return classpath;
}

/**
 * Find pom.xml files in a workspace directory.
 */
export function findPomFiles(workspaceRoot: string): string[] {
  const result: string[] = [];
  const rootPom = path.join(workspaceRoot, "pom.xml");
  if (fs.existsSync(rootPom)) {
    result.push(rootPom);
  }

  // Check one level of subdirectories for multi-module projects
  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "target"
      ) {
        const subPom = path.join(workspaceRoot, entry.name, "pom.xml");
        if (fs.existsSync(subPom)) {
          result.push(subPom);
        }
      }
    }
  } catch {
    // Permission errors, etc.
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Parse dependency declarations from pom.xml content.
 * Uses regex-based extraction (not a full XML parser) for lightweight operation.
 */
function parsePomDependencies(pomContent: string): MavenDependency[] {
  const dependencies: MavenDependency[] = [];

  // Match <dependencies>...</dependencies> blocks (skip dependencyManagement)
  const depsBlockPattern =
    /<dependencies>([\s\S]*?)<\/dependencies>/g;
  const depPattern =
    /<dependency>\s*([\s\S]*?)\s*<\/dependency>/g;

  let blockMatch;
  while ((blockMatch = depsBlockPattern.exec(pomContent)) !== null) {
    // Skip if inside <dependencyManagement>
    const blockStart = blockMatch.index;
    const preceding = pomContent.slice(Math.max(0, blockStart - 100), blockStart);
    if (preceding.includes("<dependencyManagement>")) continue;

    const block = blockMatch[1];
    let depMatch;
    while ((depMatch = depPattern.exec(block)) !== null) {
      const depXml = depMatch[1];
      const groupId = extractXmlTag(depXml, "groupId");
      const artifactId = extractXmlTag(depXml, "artifactId");
      const version = extractXmlTag(depXml, "version");
      const scope = extractXmlTag(depXml, "scope") || "compile";

      if (groupId && artifactId && version) {
        dependencies.push({ groupId, artifactId, version, scope });
      }
    }
  }

  return dependencies;
}

/**
 * Parse <modules> from pom.xml for multi-module projects.
 */
function parseModules(pomContent: string): string[] {
  const modules: string[] = [];
  const modulesBlock = pomContent.match(/<modules>([\s\S]*?)<\/modules>/);
  if (!modulesBlock) return modules;

  const modulePattern = /<module>([\s\S]*?)<\/module>/g;
  let match;
  while ((match = modulePattern.exec(modulesBlock[1])) !== null) {
    modules.push(match[1].trim());
  }
  return modules;
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`));
  return match ? match[1] : undefined;
}

function getM2RepositoryPath(): string {
  // Check for custom settings in M2_HOME or MAVEN_HOME
  const m2Home = process.env.M2_HOME || process.env.MAVEN_HOME;
  if (m2Home) {
    const customRepo = path.join(m2Home, "repository");
    if (fs.existsSync(customRepo)) return customRepo;
  }
  return path.join(os.homedir(), ".m2", "repository");
}

function resolveJarPath(
  m2Repo: string,
  dep: MavenDependency
): string | undefined {
  const groupPath = dep.groupId.replace(/\./g, path.sep);
  const jarName = `${dep.artifactId}-${dep.version}.jar`;
  return path.join(m2Repo, groupPath, dep.artifactId, dep.version, jarName);
}
