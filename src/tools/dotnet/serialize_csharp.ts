import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { analyzeDirectory, SERIALIZATION_FORMAT_DOC, serializeToCompactString } from './utils/CSharpProjectSerializer.js';

export const ToolName: string = `serialize_csharp`;

export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        // Chemin du répertoire contenant les fichiers C# à analyser
        path: z.string().describe("Chemin du répertoire contenant les fichiers C# à analyser"),
        
        // Options de configuration pour l'analyse
        options: z.object({
            // Configuration des niveaux d'accessibilité à inclure dans l'analyse
            accessibility: z.object({
                // Inclure les méthodes publiques
                public: z.boolean()
                    .default(true)
                    .describe("Inclure les méthodes publiques dans l'analyse"),
                
                // Inclure les méthodes privées
                private: z.boolean()
                    .default(false)
                    .describe("Inclure les méthodes privées dans l'analyse"),
                
                // Inclure les méthodes protégées
                protected: z.boolean()
                    .default(false)
                    .describe("Inclure les méthodes protégées dans l'analyse"),
                
                // Inclure les méthodes internal
                internal: z.boolean()
                    .default(false)
                    .describe("Inclure les méthodes internal dans l'analyse"),
                
                // Inclure les méthodes protected internal
                protectedInternal: z.boolean()
                    .default(false)
                    .describe("Inclure les méthodes protected internal dans l'analyse"),
                
                // Inclure les méthodes private protected
                privateProtected: z.boolean()
                    .default(false)
                    .describe("Inclure les méthodes private protected dans l'analyse")
            })
            .default({})
            .describe("Configuration des niveaux d'accessibilité à inclure dans l'analyse"),
            
            // Inclure les méthodes statiques dans l'analyse
            includeStatic: z.boolean()
                .default(true)
                .describe("Inclure les méthodes statiques dans l'analyse"),
            
            // Filtrer les directives using par namespace
            namespaceFilter: z.array(z.string())
                .default([])
                .describe("Liste des namespaces à inclure dans l'analyse. Si vide, tous les namespaces sont inclus. Ex: ['System', 'Microsoft.Extensions']")
        })
        .default({})
        .describe("Options de configuration pour l'analyse des fichiers C#")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Analyze and serialize C# source files in a directory. Returns a detailed analysis of " +
            "using directives, method signatures, and their accessibility. Can filter by access modifiers " +
            "and namespaces. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation du chemin
                const validPath = config.validatePath(args.path);

                try {
                    // Analyse du répertoire
                    const results = await analyzeDirectory(validPath, args.options);
                    
                    // Conversion des résultats en format compact
                    const serializedResults = results.map(fileInfo => serializeToCompactString(fileInfo)).join('\n');

                    // Combine la documentation et les résultats sérialisés
                    return `${SERIALIZATION_FORMAT_DOC}\n\nRésultats sérialisés :\n${serializedResults}`;

                } catch (error) {
                    logger.error(`Erreur lors de l'analyse des fichiers C#: ${error}`);
                    throw new Error(`Erreur lors de l'analyse des fichiers C#: ${error}`);
                }
            });
        },
    });
}