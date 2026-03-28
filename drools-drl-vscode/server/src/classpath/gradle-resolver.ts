/**
 * Gradle classpath resolver.
 *
 * Parses build.gradle / build.gradle.kts to extract dependency declarations,
 * then locates the corresponding JARs in the Gradle cache.
 * Also includes build/classes/ for the project's own compiled classes.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface GradleDependency {
  group: string;
  name: string;
  version: string;
  configuration: string;
}

/**
 * Resolve classpath entries from a Gradle build file.
 * Returns an array of absolute paths to JAR files and class directories.
 */
export async function resolveGradleClasspath(
  buildGradlePath: string
): Promise<string[]> {
  const projectDir = path.dirname(buildGradlePath);
  const classpath: string[] = [];

  // 1. Include project's own compiled classes
  const buildClassesJava = path.join(projectDir, "build", "classes", "java", "main");
  const buildClassesKotlin = path.join(projectDir, "build", "classes", "kotlin", "main");

  if (fs.existsSync(buildClassesJava)) classpath.push(buildClassesJava);
  if (fs.existsSync(buildClassesKotlin)) classpath.push(buildClassesKotlin);

  // 2. Parse build.gradle for dependencies
  const buildContent = fs.readFileSync(buildGradlePath, "utf-8");
  const isKotlinDsl = buildGradlePath.endsWith(".kts");
  const dependencies = isKotlinDsl
    ? parseKotlinDslDependencies(buildContent)
    : parseGroovyDependencies(buildContent);

  // 3. Resolve each dependency in Gradle cache
  const gradleCache = getGradleCachePath();
  for (const dep of dependencies) {
    if (dep.configuration === "testImplementation" || dep.configuration === "testCompileOnly") {
      continue;
    }
    const jarPaths = findGradleCacheJars(gradleCache, dep);
    classpath.push(...jarPaths);
  }

  // 4. Check for multi-module subprojects
  const settingsFile = findSettingsFile(projectDir);
  if (settingsFile) {
    const subprojects = parseSubprojects(settingsFile);
    for (const sub of subprojects) {
      const subClasses = path.join(projectDir, sub, "build", "classes", "java", "main");
      if (fs.existsSync(subClasses)) {
        classpath.push(subClasses);
      }
    }
  }

  return classpath;
}

/**
 * Find build.gradle or build.gradle.kts in a workspace directory.
 */
export function findGradleBuildFiles(workspaceRoot: string): string[] {
  const result: string[] = [];
  for (const name of ["build.gradle", "build.gradle.kts"]) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) result.push(p);
  }

  // Check one level of subdirectories
  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "build"
      ) {
        for (const name of ["build.gradle", "build.gradle.kts"]) {
          const p = path.join(workspaceRoot, entry.name, name);
          if (fs.existsSync(p)) result.push(p);
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
 * Parse dependencies from Groovy-based build.gradle.
 * Matches patterns like:
 *   implementation 'group:name:version'
 *   implementation "group:name:version"
 *   compileOnly group: 'g', name: 'n', version: 'v'
 */
function parseGroovyDependencies(content: string): GradleDependency[] {
  const deps: GradleDependency[] = [];
  const configs = [
    "implementation",
    "compileOnly",
    "api",
    "runtimeOnly",
    "testImplementation",
    "testCompileOnly",
  ];

  // Short notation: implementation 'group:name:version'
  const shortPattern = new RegExp(
    `(${configs.join("|")})\\s+['"]([^:'"]+):([^:'"]+):([^'"]+)['"]`,
    "g"
  );
  let match;
  while ((match = shortPattern.exec(content)) !== null) {
    deps.push({
      configuration: match[1],
      group: match[2],
      name: match[3],
      version: match[4],
    });
  }

  // Map notation: implementation group: 'g', name: 'n', version: 'v'
  const mapPattern = new RegExp(
    `(${configs.join("|")})\\s+group:\\s*['"]([^'"]+)['"],\\s*name:\\s*['"]([^'"]+)['"],\\s*version:\\s*['"]([^'"]+)['"]`,
    "g"
  );
  while ((match = mapPattern.exec(content)) !== null) {
    deps.push({
      configuration: match[1],
      group: match[2],
      name: match[3],
      version: match[4],
    });
  }

  return deps;
}

/**
 * Parse dependencies from Kotlin DSL build.gradle.kts.
 * Matches patterns like:
 *   implementation("group:name:version")
 */
function parseKotlinDslDependencies(content: string): GradleDependency[] {
  const deps: GradleDependency[] = [];
  const configs = [
    "implementation",
    "compileOnly",
    "api",
    "runtimeOnly",
    "testImplementation",
    "testCompileOnly",
  ];

  const pattern = new RegExp(
    `(${configs.join("|")})\\(["']([^:'"]+):([^:'"]+):([^'"]+)["']\\)`,
    "g"
  );
  let match;
  while ((match = pattern.exec(content)) !== null) {
    deps.push({
      configuration: match[1],
      group: match[2],
      name: match[3],
      version: match[4],
    });
  }

  return deps;
}

function getGradleCachePath(): string {
  const gradleHome = process.env.GRADLE_USER_HOME;
  if (gradleHome) return path.join(gradleHome, "caches", "modules-2", "files-2.1");
  return path.join(os.homedir(), ".gradle", "caches", "modules-2", "files-2.1");
}

/**
 * Search the Gradle cache for JARs matching a dependency.
 * Gradle cache layout: {group}/{name}/{version}/{hash}/{name}-{version}.jar
 */
function findGradleCacheJars(
  cachePath: string,
  dep: GradleDependency
): string[] {
  const depDir = path.join(cachePath, dep.group, dep.name, dep.version);
  if (!fs.existsSync(depDir)) return [];

  const results: string[] = [];
  const jarName = `${dep.name}-${dep.version}.jar`;

  try {
    // Gradle stores files under hash subdirectories
    const hashDirs = fs.readdirSync(depDir, { withFileTypes: true });
    for (const hashDir of hashDirs) {
      if (!hashDir.isDirectory()) continue;
      const jarPath = path.join(depDir, hashDir.name, jarName);
      if (fs.existsSync(jarPath)) {
        results.push(jarPath);
        break; // One copy is enough
      }
    }
  } catch {
    // Permission errors, etc.
  }

  return results;
}

function findSettingsFile(projectDir: string): string | undefined {
  for (const name of ["settings.gradle", "settings.gradle.kts"]) {
    const p = path.join(projectDir, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Parse subproject names from a settings.gradle file.
 */
function parseSubprojects(settingsPath: string): string[] {
  const content = fs.readFileSync(settingsPath, "utf-8");
  const projects: string[] = [];

  // include 'subproject1', 'subproject2'
  // include ':subproject1', ':subproject2'
  const includePattern = /include\s+['"][:']?([^'"]+)['"]/g;
  let match;
  while ((match = includePattern.exec(content)) !== null) {
    projects.push(match[1].replace(/^:/, "").replace(/:/g, path.sep));
  }

  return projects;
}
