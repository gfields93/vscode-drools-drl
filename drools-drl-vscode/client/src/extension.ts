import * as path from "path";
import {
  commands,
  ExtensionContext,
  window,
  workspace,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js")
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "drools" }],
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher("**/*.drl"),
        workspace.createFileSystemWatcher("**/*.java"),
        workspace.createFileSystemWatcher("**/*.class"),
        workspace.createFileSystemWatcher("**/pom.xml"),
        workspace.createFileSystemWatcher("**/build.gradle"),
        workspace.createFileSystemWatcher("**/build.gradle.kts"),
      ],
    },
  };

  client = new LanguageClient(
    "droolsDRL",
    "Drools DRL Language Server",
    serverOptions,
    clientOptions
  );

  // Register commands
  context.subscriptions.push(
    commands.registerCommand("drools.rebuildWorkspaceIndex", async () => {
      const result = await client.sendRequest("drools/rebuildWorkspaceIndex");
      window.showInformationMessage("Drools workspace index rebuilt");
    })
  );

  context.subscriptions.push(
    commands.registerCommand("drools.rebuildClasspath", async () => {
      const result = await client.sendRequest("drools/rebuildClasspath");
      window.showInformationMessage("Drools classpath rebuilt");
    })
  );

  context.subscriptions.push(
    commands.registerCommand("drools.showTypeInfo", async () => {
      const editor = window.activeTextEditor;
      if (!editor) return;

      const position = editor.selection.active;
      const wordRange = editor.document.getWordRangeAtPosition(position);
      if (!wordRange) return;

      const typeName = editor.document.getText(wordRange);
      const result = await client.sendRequest("drools/showTypeInfo", {
        typeName,
        uri: editor.document.uri.toString(),
      }) as any;

      if (result) {
        const fields = result.fields
          ?.map((f: any) => `  ${f.name}: ${f.type}`)
          .join("\n") || "  (no fields)";
        window.showInformationMessage(
          `${result.fullyQualifiedName} (${result.source})\nFields:\n${fields}`,
          { modal: true }
        );
      } else {
        window.showInformationMessage(`Type "${typeName}" not found in index`);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("drools.analyzeRuleConflicts", async () => {
      const result = await client.sendRequest("drools/analyzeRuleConflicts") as any;

      const lines: string[] = [];
      if (result.conflicts.length > 0) {
        lines.push(`Conflicts (${result.conflicts.length}):`);
        for (const c of result.conflicts) {
          lines.push(`  ${c.ruleA.name} vs ${c.ruleB.name}: ${c.reason}`);
        }
      }
      if (result.shadows.length > 0) {
        lines.push(`\nShadowing (${result.shadows.length}):`);
        for (const s of result.shadows) {
          lines.push(`  ${s.reason}`);
        }
      }
      if (result.circularDependencies.length > 0) {
        lines.push(`\nCircular Dependencies (${result.circularDependencies.length}):`);
        for (const c of result.circularDependencies) {
          lines.push(`  ${c.reason}`);
        }
      }
      if (lines.length === 0) {
        lines.push("No conflicts, shadowing, or circular dependencies detected.");
      }

      window.showInformationMessage(lines.join("\n"), { modal: true });
    })
  );

  context.subscriptions.push(
    commands.registerCommand("drools.showRuleDependencies", async () => {
      const editor = window.activeTextEditor;
      if (!editor) return;

      const position = editor.selection.active;
      const wordRange = editor.document.getWordRangeAtPosition(position, /[\w\s]+/);
      // Try to get rule name from current line context
      const lineText = editor.document.lineAt(position.line).text;
      const ruleMatch = lineText.match(/rule\s+"([^"]+)"/);
      const ruleName = ruleMatch ? ruleMatch[1] : (wordRange ? editor.document.getText(wordRange).trim() : "");

      if (!ruleName) {
        window.showInformationMessage("Place cursor on a rule name to show dependencies");
        return;
      }

      const result = await client.sendRequest("drools/showRuleDependencies", {
        ruleName,
      }) as any;

      if (result) {
        const triggers = result.triggers.length > 0
          ? `Triggers: ${result.triggers.join(", ")}`
          : "Triggers: (none)";
        const triggeredBy = result.triggeredBy.length > 0
          ? `Triggered by: ${result.triggeredBy.join(", ")}`
          : "Triggered by: (none)";
        window.showInformationMessage(
          `Rule: ${result.ruleName}\n${triggeredBy}\n${triggers}`,
          { modal: true }
        );
      } else {
        window.showInformationMessage(`Rule "${ruleName}" not found in index`);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("drools.listAllRules", async () => {
      const rules = await client.sendRequest("drools/listAllRules") as any[];

      if (!rules || rules.length === 0) {
        window.showInformationMessage("No rules found in workspace");
        return;
      }

      const items = rules.map((r: any) => {
        const parts: string[] = [r.name];
        if (r.salience !== 0) parts.push(`salience=${r.salience}`);
        if (r.agendaGroup) parts.push(`group="${r.agendaGroup}"`);
        return {
          label: r.name,
          description: parts.slice(1).join(", "),
          uri: r.uri,
        };
      });

      const selected = await window.showQuickPick(items, {
        placeHolder: `${rules.length} rules found — select to navigate`,
      });

      if (selected) {
        const uri = (selected as any).uri as string;
        const vscodeUri = await import("vscode").then((m) => m.Uri.parse(uri));
        const doc = await workspace.openTextDocument(vscodeUri);
        await window.showTextDocument(doc);
      }
    })
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
