/**
 * Classpath resolver orchestrator.
 *
 * Detects the project type (Maven, Gradle, or manual) and delegates to
 * the appropriate resolver. Also handles workspace source file scanning
 * as a fallback when no build tool is detected.
 */

import * as fs from "fs";
import * as path from "path";
import {
  resolveMavenClasspath,
  findPomFiles,
} from "./maven-resolver";
import {
  resolveGradleClasspath,
  findGradleBuildFiles,
} from "./gradle-resolver";

export type ClasspathMode = "auto" | "maven" | "gradle" | "manual";

export interface ClasspathConfig {
  mode: ClasspathMode;
  manualClasspath: string[];
  sourceRoots: string[];
}

export interface ClasspathResult {
  /** Detected or configured project type */
  projectType: "maven" | "gradle" | "manual" | "none";
  /** Resolved JAR file paths */
  jarPaths: string[];
  /** Resolved class directories (e.g. target/classes) */
  classDirs: string[];
  /** Java source roots found in the workspace */
  sourceRoots: string[];
}

const DEFAULT_CONFIG: ClasspathConfig = {
  mode: "auto",
  manualClasspath: [],
  sourceRoots: ["src/main/java"],
};

/**
 * Resolve the full classpath for a workspace.
 */
export async function resolveClasspath(
  workspaceRoot: string,
  config: Partial<ClasspathConfig> = {}
): Promise<ClasspathResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const result: ClasspathResult = {
    projectType: "none",
    jarPaths: [],
    classDirs: [],
    sourceRoots: [],
  };

  // Resolve source roots
  for (const root of cfg.sourceRoots) {
    const absRoot = path.isAbsolute(root) ? root : path.join(workspaceRoot, root);
    if (fs.existsSync(absRoot)) {
      result.sourceRoots.push(absRoot);
    }
  }

  // Determine project type
  const projectType = cfg.mode === "auto"
    ? detectProjectType(workspaceRoot)
    : cfg.mode;

  switch (projectType) {
    case "maven": {
      result.projectType = "maven";
      const pomFiles = findPomFiles(workspaceRoot);
      for (const pomFile of pomFiles) {
        const entries = await resolveMavenClasspath(pomFile);
        categorizeEntries(entries, result);
      }
      break;
    }
    case "gradle": {
      result.projectType = "gradle";
      const buildFiles = findGradleBuildFiles(workspaceRoot);
      for (const buildFile of buildFiles) {
        const entries = await resolveGradleClasspath(buildFile);
        categorizeEntries(entries, result);
      }
      break;
    }
    case "manual": {
      result.projectType = "manual";
      for (const entry of cfg.manualClasspath) {
        const absEntry = path.isAbsolute(entry) ? entry : path.join(workspaceRoot, entry);
        if (fs.existsSync(absEntry)) {
          if (absEntry.endsWith(".jar")) {
            result.jarPaths.push(absEntry);
          } else {
            result.classDirs.push(absEntry);
          }
        }
      }
      break;
    }
    default:
      result.projectType = "none";
      break;
  }

  // Deduplicate
  result.jarPaths = [...new Set(result.jarPaths)];
  result.classDirs = [...new Set(result.classDirs)];
  result.sourceRoots = [...new Set(result.sourceRoots)];

  return result;
}

/**
 * Detect project type from workspace root by looking for build files.
 */
function detectProjectType(workspaceRoot: string): ClasspathMode {
  if (fs.existsSync(path.join(workspaceRoot, "pom.xml"))) return "maven";
  if (
    fs.existsSync(path.join(workspaceRoot, "build.gradle")) ||
    fs.existsSync(path.join(workspaceRoot, "build.gradle.kts"))
  ) {
    return "gradle";
  }
  return "manual";
}

/**
 * Categorize classpath entries into JARs and class directories.
 */
function categorizeEntries(entries: string[], result: ClasspathResult): void {
  for (const entry of entries) {
    if (entry.endsWith(".jar")) {
      result.jarPaths.push(entry);
    } else {
      result.classDirs.push(entry);
    }
  }
}
