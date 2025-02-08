import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import * as path from 'path';
import * as fs from 'fs';
import {stringify} from 'yaml';

export const ToolName: string = `analyze_csharp_dependencies`;

interface CSharpFileInfo {
    filePath: string;
    namespace: string;
    usings: string[];
    globalUsings: string[];
}

function findGitIgnoreDir(startPath: string): string | null {
    let currentDir = startPath;
    while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, '.gitignore'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}

function extractNamespaceAndUsings(filePath: string): { namespace: string; usings: string[]; globalUsings: string[] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const usings: string[] = [];
    const globalUsings: string[] = [];
    let namespace = '';

    for (const line of lines) {
        // Détecter les global using
        const globalUsingMatch = line.match(/^\s*global\s+using\s+([^;]+);/);
        if (globalUsingMatch) {
            globalUsings.push(globalUsingMatch[1].trim());
            continue;
        }

        // Détecter les using standards
        const usingMatch = line.match(/^\s*using\s+([^;]+);/);
        if (usingMatch && !line.trim().startsWith("global")) {
            usings.push(usingMatch[1].trim());
        }

        // Détecter le namespace
        const namespaceMatch = line.match(/^\s*namespace\s+([^{\s]+)/);
        if (namespaceMatch) {
            namespace = namespaceMatch[1].trim();
            break;
        }
    }

    return { namespace, usings, globalUsings };
}

function findAllGlobalUsings(dir: string): string[] {
    const globalUsings = new Set<string>();

    function scan(currentDir: string) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.cs')) {
                const { globalUsings: fileGlobalUsings } = extractNamespaceAndUsings(fullPath);
                fileGlobalUsings.forEach(using => globalUsings.add(using));
            }
        }
    }

    scan(dir);
    return Array.from(globalUsings);
}

function scanCSharpFiles(dir: string): CSharpFileInfo[] {
    const results: CSharpFileInfo[] = [];
    const projectGlobalUsings = findAllGlobalUsings(dir);

    function scan(currentDir: string) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.cs')) {
                const { namespace, usings, globalUsings } = extractNamespaceAndUsings(fullPath);
                if (namespace) {
                    results.push({ 
                        filePath: fullPath, 
                        namespace, 
                        usings,
                        globalUsings: [...globalUsings, ...projectGlobalUsings]
                    });
                }
            }
        }
    }

    scan(dir);
    return results;
}

export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        // Chemin du fichier C# à analyser
        filePath: z.string().describe("Path to the C# file to analyze"),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Analyzes a C# file and finds all related files based on its namespace and using directives " +
            "(including global usings). Searches up the directory tree for .gitignore, then scans all C# files " +
            "in that directory and its subdirectories. Returns files that share the same namespace or are " +
            "referenced in using directives.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation du chemin
                const validPath = config.validatePath(args.filePath);

                try {
                    // Trouver le dossier .gitignore
                    const gitIgnoreDir = findGitIgnoreDir(path.dirname(validPath));
                    if (!gitIgnoreDir) {
                        throw new Error('No .gitignore found in parent directories');
                    }

                    // Scanner tous les fichiers .cs
                    const allFiles = scanCSharpFiles(gitIgnoreDir);

                    // Analyser le fichier cible
                    const targetFile = extractNamespaceAndUsings(validPath);
                    const projectGlobalUsings = findAllGlobalUsings(gitIgnoreDir);

                    // Combiner les usings standards et globals
                    const allUsings = [...new Set([
                        ...targetFile.usings,
                        ...targetFile.globalUsings,
                        ...projectGlobalUsings
                    ])];

                    // Filtrer les fichiers pertinents
                    const relatedFiles = allFiles.filter(file => 
                        // Même namespace
                        file.namespace === targetFile.namespace ||
                        // Ou namespace utilisé dans les usings (standards ou globals)
                        allUsings.some(using => using === file.namespace)
                    );

                    // Formatage des résultats
                    return stringify({
                        targetFile: {
                            path: validPath,
                            namespace: targetFile.namespace,
                            standardUsings: targetFile.usings,
                            globalUsings: [...targetFile.globalUsings, ...projectGlobalUsings]
                        },
                        relatedFiles: relatedFiles.map(file => ({
                            path: file.filePath,
                            namespace: file.namespace,
                            relation: file.namespace === targetFile.namespace ? 
                                'same_namespace' : 'referenced_in_usings'
                        }))
                    });

                } catch (error) {
                    logger.error(`Erreur lors de l'analyse du fichier C#: ${error}`);
                    throw new Error(`Erreur lors de l'analyse du fichier C#: ${error}`);
                }
            });
        },
    });
}