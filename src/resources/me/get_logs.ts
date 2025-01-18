import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import path from 'path';
import fs from "fs/promises";

export const RessourceName: string = `Today's Application Logs`;


/**
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP
 * @param config Configuration de l'application
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Ressource(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {

    // Fonction helper pour lire les dernières entrées d'un fichier de log
    async function readLastLogEntries(filePath: string, count: number): Promise<string> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.trim().split('\n');
            let result = lines.slice(-count).join('\n');
            
            // Si le nombre total de lignes est supérieur à count
            if (lines.length > count) {
                result = `[Log tronqué - ${lines.length - count} lignes supplémentaires disponibles dans ${filePath}]\n\n${result}`;
            }
            
            return result;
        } catch (error) {
            throw new Error(`Error reading log file: ${error}`);
        }
    }

    // Ajout du template pour les logs du jour avec paramètre de limite
    server.addResource({
        uri: "file:///logs/app.log",
        name: RessourceName,
        mimeType: "text/plain",
        async load() {
            try {
                const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
                const logPath = path.join(config.BasePath, `app-logs-${today}.txt`);
                const numEntries = config.LogsNumberToShow;
                
                if (isNaN(numEntries) || numEntries <= 0) {
                    throw new Error("Invalid count parameter");
                }

                const logContent = await readLastLogEntries(logPath, numEntries);
                return {
                    text: logContent
                };
            } catch (error) {
                logger.error("Error reading log file", { error });
                throw error;
            }
        },
    });


}




