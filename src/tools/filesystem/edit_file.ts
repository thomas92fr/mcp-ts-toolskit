import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createTwoFilesPatch } from "diff";

export const ToolName: string = `edit_file`;

// Fonction utilitaire pour normaliser les fins de ligne
function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

// Fonction utilitaire pour créer un diff unifié
function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
    // Assure des fins de ligne cohérentes pour le diff
    const normalizedOriginal = normalizeLineEndings(originalContent);
    const normalizedNew = normalizeLineEndings(newContent);

    return createTwoFilesPatch(
        filepath,
        filepath,
        normalizedOriginal,
        normalizedNew,
        'original',
        'modified'
    );
}

// Fonction principale pour appliquer les modifications au fichier
async function applyFileEdits(
    filePath: string,
    edits: Array<{ oldText: string, newText: string }>,
    dryRun = false
): Promise<string> {
    // Lecture du contenu du fichier et normalisation des fins de ligne
    const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

    // Application séquentielle des modifications
    let modifiedContent = content;
    for (const edit of edits) {
        const normalizedOld = normalizeLineEndings(edit.oldText);
        const normalizedNew = normalizeLineEndings(edit.newText);

        // Si une correspondance exacte existe, l'utiliser
        if (modifiedContent.includes(normalizedOld)) {
            modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
            continue;
        }

        // Sinon, essayer une correspondance ligne par ligne avec flexibilité pour les espaces
        const oldLines = normalizedOld.split('\n');
        const contentLines = modifiedContent.split('\n');
        let matchFound = false;

        for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
            const potentialMatch = contentLines.slice(i, i + oldLines.length);

            // Comparer les lignes avec les espaces normalisés
            const isMatch = oldLines.every((oldLine, j) => {
                const contentLine = potentialMatch[j];
                return oldLine.trim() === contentLine.trim();
            });

            if (isMatch) {
                // Préserver l'indentation originale de la première ligne
                const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
                const newLines = normalizedNew.split('\n').map((line, j) => {
                    if (j === 0) return originalIndent + line.trimStart();
                    // Pour les lignes suivantes, essayer de préserver l'indentation relative
                    const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
                    const newIndent = line.match(/^\s*/)?.[0] || '';
                    if (oldIndent && newIndent) {
                        const relativeIndent = newIndent.length - oldIndent.length;
                        return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
                    }
                    return line;
                });

                contentLines.splice(i, oldLines.length, ...newLines);
                modifiedContent = contentLines.join('\n');
                matchFound = true;
                break;
            }
        }

        if (!matchFound) {
            throw new Error(`Impossible de trouver une correspondance exacte pour la modification:\n${edit.oldText}`);
        }
    }

    // Création du diff unifié
    const diff = createUnifiedDiff(content, modifiedContent, filePath);

    if (!dryRun) {
        await fs.writeFile(filePath, modifiedContent, 'utf-8');
    }

    return diff;
}

/**
 * Ajoute l'outil edit_file au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment les répertoires autorisés
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;

    // Schéma de l'opération d'édition
    const EditOperation = z.object({
        oldText: z.string().describe('Texte à rechercher - doit correspondre exactement'),
        newText: z.string().describe('Texte de remplacement')
    });

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        path: z.string(),
        edits: z.array(EditOperation),
        dryRun: z.boolean().default(false).describe('Prévisualiser les changements au format diff git')
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Make line-based edits to a text file. Each edit replaces exact line sequences " +
          "with new content. Returns a git-style diff showing the changes made. " +
          "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);
           
                // Validation du chemin
                const validPath = config.validatePath(args.path);

                // Application des modifications
                const diff = await applyFileEdits(validPath, args.edits, args.dryRun);

                logger.info(`Modifications du fichier ${args.path} terminées avec succès`);
                if (args.dryRun) {
                    logger.info('Mode prévisualisation - aucune modification effectuée');
                }

                return diff;             
            });
        },
    });
}