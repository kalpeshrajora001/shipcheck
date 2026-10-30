import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckResult } from '../../types';
import { runCommand, fileExists } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runJavaChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('java', 'Java/Kotlin', 'JVM compile checks', 'No Java/Kotlin files in scope')];
  }

  const hasMaven = fileExists(path.join(workspaceRoot, 'pom.xml'));
  const hasGradle =
    fileExists(path.join(workspaceRoot, 'build.gradle')) ||
    fileExists(path.join(workspaceRoot, 'build.gradle.kts'));

  if (hasMaven) {
    return [await mavenCompile(workspaceRoot, signal)];
  }
  if (hasGradle) {
    return [await gradleCompile(workspaceRoot, signal)];
  }

  // Fallback: javac single-file best effort
  return [await javacFiles(workspaceRoot, files.filter((f) => f.endsWith('.java')), signal)];
}

async function mavenCompile(workspaceRoot: string, signal?: AbortSignal): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'maven-compile',
    name: 'Maven compile',
    description: 'mvn -q -DskipTests compile (read-only toward sources)',
  };
  const mvn = fileExists(path.join(workspaceRoot, 'mvnw'))
    ? path.join(workspaceRoot, 'mvnw')
    : 'mvn';
  const r = await runCommand(mvn, {
    cwd: workspaceRoot,
    args: ['-q', '-DskipTests', 'compile'],
    timeoutMs: 600_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'mvn/mvnw not found');
  }
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'syntax',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'Maven',
    'Fix compile errors.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'mvn'),
      kind: 'syntax',
      severity: 'error',
      title: 'Maven compile failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 500)),
      suggestion: 'Fix compile errors reported by Maven.',
      checkId: base.id,
    });
  }
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'Maven compile passed' : 'Maven compile failed',
    durationMs: Date.now() - start,
  };
}

async function gradleCompile(workspaceRoot: string, signal?: AbortSignal): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'gradle-compile',
    name: 'Gradle compile',
    description: 'gradle compileJava / compileKotlin (skip tests)',
  };
  const gradlew = fileExists(path.join(workspaceRoot, 'gradlew'))
    ? path.join(workspaceRoot, 'gradlew')
    : 'gradle';
  const r = await runCommand(gradlew, {
    cwd: workspaceRoot,
    args: ['compileJava', 'compileKotlin', '-x', 'test', '-q'],
    timeoutMs: 600_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'gradle/gradlew not found');
  }
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'syntax',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'Gradle',
    'Fix compile errors.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'gradle'),
      kind: 'syntax',
      severity: 'error',
      title: 'Gradle compile failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 500)),
      suggestion: 'Fix compile errors reported by Gradle.',
      checkId: base.id,
    });
  }
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'Gradle compile passed' : 'Gradle compile failed',
    durationMs: Date.now() - start,
  };
}

async function javacFiles(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'javac',
    name: 'javac',
    description: 'Best-effort javac on changed files (no build file)',
  };
  if (!files.length) {
    return notConfigured(base.id, base.name, base.description, 'No .java files and no Maven/Gradle project');
  }
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  // Write class files to a temp dir so the workspace stays read-only.
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-javac-'));
  try {
    const r = await runCommand('javac', {
      cwd: workspaceRoot,
      args: ['-d', outDir, ...rels],
      timeoutMs: 180_000,
      signal,
    });
    if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
      return unavailable(base.id, base.name, base.description, 'javac not found; add Maven/Gradle for full checks');
    }
    if (r.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const findings = findingsFromLines(
      base.id,
      'syntax',
      'error',
      workspaceRoot,
      `${r.stdout}\n${r.stderr}`,
      'javac',
      'Fix compile errors.'
    );
    return {
      ...base,
      status: r.code === 0 ? 'PASSED' : 'FAILED',
      findings,
      summary: r.code === 0 ? 'javac passed' : 'javac reported issues',
      detail: 'Without pom/gradle, classpath may be incomplete — prefer Maven/Gradle projects.',
      durationMs: Date.now() - start,
    };
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
