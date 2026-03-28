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

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
