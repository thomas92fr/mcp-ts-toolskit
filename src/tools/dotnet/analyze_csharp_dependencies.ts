import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import * as path from 'path';
import * as fs from 'fs';
import {stringify} from 'yaml';
import { json2csv } from 'json-2-csv';

export const ToolName: string = `analyze_csharp_dependencies`;

/**
 * Représente les informations extraites d'un fichier C#
 */
interface CSharpFileInfo {
    /** Chemin complet du fichier */
    filePath: string;
    /** Namespace déclaré dans le fichier */
    namespace: string;
    /** Liste des using standards */
    usings: string[];
    /** Liste des using globaux */
    globalUsings: string[];
}

/**
 * Représente un fichier lié au fichier analysé et décrit sa relation
 */
interface RelatedFile {
    /** Chemin complet du fichier lié */
    path: string;
    /** Namespace du fichier lié */
    namespace: string;
    /** Type de relation ('same_namespace' ou 'referenced_in_usings') */
    relation: string;
    /** Chemin de dépendance montrant comment ce fichier est lié au fichier source */
    dependencyPath?: string[];
}

/**
 * Nettoie une chaîne de caractères représentant un namespace en retirant les espaces et le point-virgule final
 * @param namespace - Le namespace à nettoyer
 * @returns Le namespace nettoyé
 */
function cleanNamespace(namespace: string): string {
    return namespace.trim().replace(/;$/, '');
}

/**
 * Recherche le répertoire contenant le fichier .gitignore en remontant l'arborescence
 * @param startPath - Chemin de départ pour la recherche
 * @param logger - Logger pour tracer les opérations
 * @returns Le chemin du répertoire contenant .gitignore ou null si non trouvé
 */
function findGitIgnoreDir(startPath: string, logger: ExtendedLogger): string | null {
    let currentDir = startPath;
    while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, '.gitignore'))) {
            logger.info('Found .gitignore at:', currentDir);
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}

/**
 * Extrait le namespace et les directives using (standard et globales) d'un fichier C#
 * @param filePath - Chemin du fichier C# à analyser
 * @returns Un objet contenant le namespace et les tableaux de using standard et globaux
 */
function extractNamespaceAndUsings(filePath: string): { namespace: string; usings: string[]; globalUsings: string[] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const usings: string[] = [];
    const globalUsings: string[] = [];
    let namespace = '';

    for (const line of lines) {
        const globalUsingMatch = line.match(/^\s*global\s+using\s+([^;]+);/);
        if (globalUsingMatch) {
            globalUsings.push(cleanNamespace(globalUsingMatch[1]));
            continue;
        }

        const usingMatch = line.match(/^\s*using\s+([^;]+);/);
        if (usingMatch && !line.trim().startsWith("global")) {
            usings.push(cleanNamespace(usingMatch[1]));
            continue;
        }

        const namespaceMatch = line.match(/^\s*namespace\s+([^{\s;]+)/);
        if (namespaceMatch) {
            namespace = cleanNamespace(namespaceMatch[1]);
            break;
        }
    }

    return { namespace, usings, globalUsings };
}

/**
 * Parcourt récursivement un répertoire pour trouver toutes les directives using globales
 * dans les fichiers C#
 * @param dir - Répertoire racine à scanner
 * @returns Un tableau des using globaux uniques trouvés
 */
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

/**
 * Scanne récursivement un répertoire pour trouver tous les fichiers C# et extraire leurs informations
 * (namespace, usings standard et globaux)
 * @param dir - Répertoire racine à scanner
 * @param logger - Logger pour tracer les opérations
 * @returns Un tableau d'objets CSharpFileInfo contenant les informations des fichiers
 */
function scanCSharpFiles(dir: string, logger: ExtendedLogger): CSharpFileInfo[] {
    const results: CSharpFileInfo[] = [];
    const projectGlobalUsings = findAllGlobalUsings(dir);

    function scan(currentDir: string) {
        //logger.info('Scanning directory:', currentDir);
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.cs')) {
                const { namespace, usings, globalUsings } = extractNamespaceAndUsings(fullPath);
                //logger.info('Found file:', { path: fullPath, namespace });
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

/**
 * Trouve tous les fichiers liés à un fichier C# donné en se basant sur les namespaces et usings.
 * Explore récursivement les dépendances en évitant les cycles.
 * @param allFiles - Liste de tous les fichiers C# du projet
 * @param currentFile - Fichier C# pour lequel chercher les dépendances
 * @param visitedNamespaces - Set des namespaces déjà visités (pour éviter les cycles)
 * @param currentPath - Chemin de dépendance actuel
 * @param logger - Logger pour tracer les opérations
 * @returns Un tableau d'objets RelatedFile décrivant les fichiers liés et leurs relations
 */
function findRelatedFiles(
    allFiles: CSharpFileInfo[], 
    currentFile: CSharpFileInfo,
    visitedNamespaces: Set<string> = new Set(),
    currentPath: string[] = [],
    logger: ExtendedLogger
): RelatedFile[] {
    const results: RelatedFile[] = [];
    const currentNamespace = currentFile.namespace;
    
    // Marquer ce namespace comme visité
    visitedNamespaces.add(currentNamespace);

    // Trouver les fichiers directement liés
    for (const file of allFiles) {
        if (file.namespace === currentNamespace && file.filePath !== currentFile.filePath) {
            results.push({
                path: file.filePath,
                namespace: file.namespace,
                relation: 'same_namespace',
                dependencyPath: [...currentPath]
            });
        } else if (currentFile.usings.includes(file.namespace) || currentFile.globalUsings.includes(file.namespace)) {
            results.push({
                path: file.filePath,
                namespace: file.namespace,
                relation: 'referenced_in_usings',
                dependencyPath: [...currentPath, currentNamespace]
            });

            // Explorer récursivement si ce namespace n'a pas déjà été visité
            if (!visitedNamespaces.has(file.namespace)) {
                const childResults = findRelatedFiles(
                    allFiles,
                    file,
                    visitedNamespaces,
                    [...currentPath, currentNamespace],
                    logger
                );
                results.push(...childResults);
            }
        }
    }

    return results;
}

export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName))
        return;

    const ClientArgsSchema = z.object({
        filePath: z.string().describe("Path to the C# file to analyze"),
    });

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

                const validPath = config.validatePath(args.filePath);

                try {
                    const gitIgnoreDir = findGitIgnoreDir(path.dirname(validPath), logger);
                    if (!gitIgnoreDir) {
                        throw new Error('No .gitignore found in parent directories');
                    }

                    // Scanner tous les fichiers .cs
                    const allFiles = scanCSharpFiles(gitIgnoreDir, logger);
                    logger.info('Total files found:', allFiles.length);

                    // Analyser le fichier cible
                    const targetFileInfo = extractNamespaceAndUsings(validPath);
                    const projectGlobalUsings = findAllGlobalUsings(gitIgnoreDir);

                    // Créer l'objet CSharpFileInfo pour le fichier cible
                    const targetFile: CSharpFileInfo = {
                        filePath: validPath,
                        namespace: targetFileInfo.namespace,
                        usings: targetFileInfo.usings,
                        globalUsings: [...targetFileInfo.globalUsings, ...projectGlobalUsings]
                    };

                    // Trouver tous les fichiers liés avec leurs chemins de dépendance
                    const relatedFiles = findRelatedFiles(allFiles, targetFile, new Set(), [], logger);

                    // Trouver les namespaces uniques pour filtrer les usings
                    const foundNamespaces = new Set(relatedFiles.map(file => file.namespace));
                    const matchedStandardUsings = targetFile.usings.filter(using => foundNamespaces.has(using));
                    const matchedGlobalUsings = [...new Set([...targetFile.globalUsings, ...projectGlobalUsings])]
                        .filter(using => foundNamespaces.has(using));

                    // Formatage des résultats
                    let result = {
                        targetFile: {
                            path: validPath,
                            namespace: targetFile.namespace,
                            standardUsings: matchedStandardUsings,
                            globalUsings: matchedGlobalUsings
                        },
                        relatedFiles: relatedFiles.map(file => ({
                            path: file.path,
                            namespace: file.namespace,
                            relation: file.relation,
                            dependencyPath: file.dependencyPath
                        }))
                    }

                    let result_txt = `${stringify(result.targetFile)}\n\n${json2csv(result.relatedFiles)}`;
                    return result_txt;

                } catch (error) {
                    logger.error(`Erreur lors de l'analyse du fichier C#: ${error}`);
                    throw new Error(`Erreur lors de l'analyse du fichier C#: ${error}`);
                }
            });
        },
    });
}